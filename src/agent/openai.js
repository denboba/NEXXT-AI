'use strict';
const { requestJSON, failure } = require('./http');

function create({ env, fetchImpl = fetch }) {
  const model = env.COACH_MODEL || 'gpt-4.1-mini';
  return {
    name: 'openai', model,
    async complete({ system, context, messages, tools, signal, callTimeoutMs, deadline, onEvent }) {
      const url = new URL(env.COMPAT_BASE_URL || 'https://api.openai.com/v1');
      const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !local) throw new Error('Provider URL requires HTTPS');
      if (url.username || url.password || url.search || url.hash) throw failure('bad_request');
      url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
      const converted = messages.map(message => ({
        role: message.role, content: message.content || '',
        ...(message.role === 'tool' ? { tool_call_id: message.toolCallId } : {}),
        ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map(call => ({
          id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.input) },
        })) } : {}),
      }));
      const data = await requestJSON(fetchImpl, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.COMPAT_API_KEY },
        body: JSON.stringify({
          model, max_tokens: 800,
          messages: [{ role: 'system', content: context ? system + '\n' + context : system }, ...converted],
          tools: tools.map(tool => ({ type: 'function', function: {
            name: tool.name, description: tool.description, parameters: tool.inputSchema,
          } })),
        }),
      }, { signal, callTimeoutMs, deadline, onEvent });
      const message = data.choices?.[0]?.message;
      if (!message) throw failure('bad_response');
      return {
        text: message.content || '',
        toolCalls: (message.tool_calls || []).map(call => ({
          id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments),
        })),
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0,
          reported: Boolean(data.usage),
        },
      };
    },
  };
}

module.exports = { create };
