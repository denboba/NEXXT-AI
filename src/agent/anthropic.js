'use strict';
const { requestStream, failure } = require('./http');
const { merge } = require('./messages');

function messagesFor(messages) {
  return merge(messages.map(message => {
    if (message.role === 'tool') {
      return { role: 'user', content: [{
        type: 'tool_result', tool_use_id: message.toolCallId, content: message.content,
      }] };
    }
    return { role: message.role, content: [
      ...(message.content ? [{ type: 'text', text: message.content }] : []),
      ...(message.toolCalls || []).map(call => ({ type: 'tool_use', id: call.id, name: call.name, input: call.input })),
    ] };
  }));
}

// Anthropic stream `error` event types -> normalized provider codes.
const ERRORS = { overloaded_error: 'server_error', api_error: 'server_error', rate_limit_error: 'throttled',
  authentication_error: 'auth', permission_error: 'auth', not_found_error: 'model_not_found',
  invalid_request_error: 'bad_request', request_too_large: 'bad_request' };

// Folds Anthropic SSE events into { text, toolCalls, usage }. Tool input is built ONLY from
// input_json_delta fragments; thinking, signature, citation and unknown deltas are ignored.
// Text deltas are also reported through onEvent so a call that fails mid-text keeps its partial text.
function parse(json) {
  let input;
  try { input = json.trim() ? JSON.parse(json) : {}; } catch { throw failure('bad_response'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('bad_response');
  return input;
}

function collector(onEvent) {
  const blocks = [], usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0, reported: false };
  let started = false, stopped = false, stopReason = null;
  const take = raw => {
    if (!raw) return;
    usage.reported = true;
    if (Number.isFinite(raw.input_tokens)) usage.inputTokens = raw.input_tokens;
    if (Number.isFinite(raw.output_tokens)) usage.outputTokens = raw.output_tokens;
    if (Number.isFinite(raw.cache_read_input_tokens)) usage.cacheReadInputTokens = raw.cache_read_input_tokens;
    if (Number.isFinite(raw.cache_creation_input_tokens)) usage.cacheCreationInputTokens = raw.cache_creation_input_tokens;
  };
  function add({ event, data }) {
    let payload;
    try { payload = JSON.parse(data); } catch { throw failure('bad_response'); }
    const type = payload?.type || event;
    if (type === 'error') throw failure(ERRORS[payload.error?.type] || 'server_error');
    if (type === 'message_start') { started = true; take(payload.message?.usage); return; }
    if (type === 'content_block_start') {
      const block = payload.content_block || {};
      if (block.type === 'text') blocks[payload.index] = { type: 'text', text: block.text || '' };
      else if (block.type === 'tool_use') blocks[payload.index] = { type: 'tool_use', id: block.id, name: block.name, json: '' };
      return;
    }
    if (type === 'content_block_delta') {
      const block = blocks[payload.index], delta = payload.delta || {};
      if (!block) return;
      if (delta.type === 'text_delta' && block.type === 'text') {
        block.text += delta.text || '';
        if (delta.text) onEvent?.({ type: 'text_delta', text: delta.text });
      }
      else if (delta.type === 'input_json_delta' && block.type === 'tool_use') block.json += delta.partial_json || '';
      return;
    }
    if (type === 'content_block_stop') {
      const block = blocks[payload.index];
      if (block?.type !== 'tool_use') return;
      block.input = parse(block.json);
      return;
    }
    if (type === 'message_delta') { stopReason = payload.delta?.stop_reason || stopReason; take(payload.usage); return; }
    if (type === 'message_stop') stopped = true;
  }
  function result() {
    if (!started || !stopped) throw failure('bad_response');
    const present = blocks.filter(Boolean);
    return {
      text: present.filter(block => block.type === 'text').map(block => block.text).join(' '),
      toolCalls: present.filter(block => block.type === 'tool_use').map(block => ({
        id: block.id, name: block.name, input: block.input ?? parse(block.json) })),
      usage, stopReason,
    };
  }
  return { add, result };
}

function firstTokenMs(env) {
  const value = Number(env.LLM_FIRST_TOKEN_MS);
  return Number.isFinite(value) && value > 0 ? value : 6000;
}

function create({ env, fetchImpl = fetch }) {
  const model = env.COACH_MODEL || 'claude-sonnet-5-5';
  return {
    name: 'anthropic', model,
    async complete({ system, context, messages, tools, signal, callTimeoutMs, deadline, onEvent }) {
      // Static rules are cached; the per-session context is a second, uncached block. The API rejects
      // empty text blocks, so the second block is only sent when context is a non-empty string.
      const blocks = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } },
        ...(typeof context === 'string' && context ? [{ type: 'text', text: context }] : [])];
      const stream = collector(onEvent);
      await requestStream(fetchImpl, 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json', accept: 'text/event-stream',
          'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model, max_tokens: 800, temperature: 0, stream: true,
          system: blocks, messages: messagesFor(messages),
          tools: tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })),
        }),
      }, { signal, callTimeoutMs, deadline, onEvent, idleMs: firstTokenMs(env), onData: stream.add });
      const { text, toolCalls, usage } = stream.result();
      return { text, toolCalls, usage };
    },
  };
}

module.exports = { create, collector };
