'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { select } = require('../src/agent/provider');
const { fixture, sseResponse } = require('./sse');

const tool = { name: 'get_customer_profile', description: 'Profile',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false } };
const request = { system: 'Rules', messages: [{ role: 'user', content: 'Help' }], tools: [tool],
  callTimeoutMs: 5000, deadline: Date.now() + 60000 };
const anthropic = (fetchImpl, env = {}) => select({ env: { LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'fake', ...env }, fetchImpl });

test('Anthropic request streams with default model, temperature 0 and two cached system blocks', async () => {
  let captured;
  const provider = anthropic(async (url, options) => { captured = { url, options }; return sseResponse(fixture('anthropic-text')); });
  await provider.complete({ ...request, context: 'Prompt version: x\nLanguage: en' });
  const body = JSON.parse(captured.options.body);
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.temperature, 0);
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 800);
  assert.deepEqual(body.system, [{ type: 'text', text: 'Rules', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'Prompt version: x\nLanguage: en' }]);
  assert.deepEqual(body.tools[0], { name: tool.name, description: tool.description, input_schema: tool.inputSchema });
  await provider.complete(request);
  assert.equal(JSON.parse(captured.options.body).system.length, 1, 'no empty context block');
  const custom = anthropic(async (url, options) => { captured = { options }; return sseResponse(fixture('anthropic-text')); },
    { COACH_MODEL: 'test-model' });
  await custom.complete(request);
  assert.equal(JSON.parse(captured.options.body).model, 'test-model');
});

test('text fixture: deltas joined across 7-byte chunks (incl. split UTF-8) and cache creation usage', async () => {
  for (const chunk of [1, 7, 64, 100000]) {
    const result = await anthropic(async () => sseResponse(fixture('anthropic-text'), { chunk })).complete(request);
    assert.equal(result.text, 'Budget ready. Ștefan, you can save safely.');
    assert.deepEqual(result.toolCalls, []);
    assert.deepEqual(result.usage, { inputTokens: 530, outputTokens: 15, cacheReadInputTokens: 0,
      cacheCreationInputTokens: 2048, reported: true });
  }
});

test('tool-use fixture: input assembled from input_json_delta, empty input becomes {}, cache read reported', async () => {
  const result = await anthropic(async () => sseResponse(fixture('anthropic-tool-use'))).complete(request);
  assert.equal(result.text, 'Let me check your budget.');
  assert.deepEqual(result.toolCalls, [
    { id: 'toolu_fixture_1', name: 'get_customer_profile', input: {} },
    { id: 'toolu_fixture_2', name: 'simulate', input: { monthly: 200, years: 10 } },
  ]);
  assert.deepEqual(result.usage, { inputTokens: 412, outputTokens: 89, cacheReadInputTokens: 2048,
    cacheCreationInputTokens: 0, reported: true });
});

test('thinking, signature and citation deltas are ignored', async () => {
  const result = await anthropic(async () => sseResponse(fixture('anthropic-thinking-citations'), { chunk: 5 })).complete(request);
  assert.equal(result.text, 'Keep a buffer first.');
  assert.deepEqual(result.toolCalls, [{ id: 'toolu_fixture_3', name: 'find_savings_capacity', input: { horizonYears: 5 } }]);
  assert.equal(result.usage.cacheReadInputTokens, 2048);
});

test('async-iterable bodies with CRLF line endings are parsed', async () => {
  const text = fixture('anthropic-text').replace(/\n/g, '\r\n');
  const body = { async *[Symbol.asyncIterator]() { for (let i = 0; i < text.length; i += 3) yield text.slice(i, i + 3); } };
  const result = await anthropic(async () => ({ ok: true, status: 200, body })).complete(request);
  assert.equal(result.text, 'Budget ready. Ștefan, you can save safely.');
});

test('stream error event is classified and not retried after events arrived', async () => {
  let calls = 0;
  const provider = anthropic(async () => { calls++; return sseResponse(fixture('anthropic-error')); });
  await assert.rejects(provider.complete(request), error => error.name === 'ProviderError' && error.code === 'server_error');
  assert.equal(calls, 1);
});

test('truncated stream or invalid tool JSON is a bad_response', async () => {
  const cut = fixture('anthropic-text').split('event: message_stop')[0];
  await assert.rejects(anthropic(async () => sseResponse(cut)).complete(request), error => error.code === 'bad_response');
  const broken = fixture('anthropic-tool-use').replace('": 10}', '": 10');
  await assert.rejects(anthropic(async () => sseResponse(broken)).complete(request), error => error.code === 'bad_response');
});

test('LLM_FIRST_TOKEN_MS: no first event in time aborts with ProviderError timeout', async () => {
  let aborted = false;
  const provider = anthropic(async (url, options) => {
    options.signal.addEventListener('abort', () => { aborted = true; });
    return sseResponse(fixture('anthropic-text'), { stallAfter: 0 });
  }, { LLM_FIRST_TOKEN_MS: '50' });
  const started = Date.now();
  await assert.rejects(provider.complete(request), error => error.name === 'ProviderError' && error.code === 'timeout');
  assert.ok(Date.now() - started < 2000);
  assert.ok(aborted, 'fetch signal aborted');
  const slowHeaders = anthropic(() => new Promise(() => {}), { LLM_FIRST_TOKEN_MS: '50' });
  await assert.rejects(slowHeaders.complete(request), error => error.code === 'timeout');
});

test('LLM_FIRST_TOKEN_MS: a gap between events larger than the limit aborts with timeout', async () => {
  const text = fixture('anthropic-text');
  const provider = anthropic(async () => sseResponse(text, { chunk: 64, stallAfter: text.indexOf('event: content_block_delta') }),
    { LLM_FIRST_TOKEN_MS: '50' });
  await assert.rejects(provider.complete(request), error => error.code === 'timeout');
  const steady = anthropic(async () => sseResponse(text, { chunk: 400, gapMs: 15 }), { LLM_FIRST_TOKEN_MS: '50' });
  assert.equal((await steady.complete(request)).text, 'Budget ready. Ștefan, you can save safely.');
});

test('HTTP errors are still classified for the streaming adapter', async () => {
  for (const [status, code] of [[403, 'auth'], [404, 'model_not_found'], [429, 'throttled']]) {
    const provider = anthropic(async () => ({ ok: false, status, json: async () => ({ type: 'error', error: { type: 'x' } }) }));
    await assert.rejects(provider.complete(request), error => error.code === code);
  }
});

test('a client abort stops the stream', async () => {
  const controller = new AbortController();
  const provider = anthropic(async () => sseResponse(fixture('anthropic-text'), { stallAfter: 0 }));
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(provider.complete({ ...request, signal: controller.signal }), error => error.code === 'timeout');
});

test('cached prompt tokens count toward the token budget and are priced (reads 0.1x, writes 1.25x)', async () => {
  const { Store } = require('../src/store');
  const { seed } = require('../src/data/personas');
  const { run } = require('../src/agent/agent');
  const { create } = require('../src/agent/scripted');
  const setup = () => { const store = new Store(null); seed(store);
    return { store, journey: { id: 'journey-ioana', userId: 'persona-ioana', language: 'en',
      coach: { profile: { risk: 'medium' } }, memory: {}, messages: [] } }; };
  const cachedProvider = cache => { const base = create([
    { text: '', toolCalls: ['get_customer_profile', 'get_spending_summary', 'find_savings_capacity']
      .map((name, index) => ({ id: 'c' + index, name, input: {} })) },
    { text: 'I checked your capacity and kept your savings safe.', toolCalls: [] }]);
    return { name: 'anthropic', model: 'claude-test', complete: async request => ({ ...await base.complete(request),
      usage: { inputTokens: 100, outputTokens: 10, ...cache } }) }; };
  const env = { LLM_INPUT_USD_PER_MILLION: '3', LLM_OUTPUT_USD_PER_MILLION: '15' };
  const priced = await run({ ...setup(), env, text: 'Help me invest',
    provider: cachedProvider({ cacheReadInputTokens: 1000, cacheCreationInputTokens: 200 }) });
  assert.equal(priced.mode, 'agent');
  const u = priced.usage;
  assert.ok(u.cacheReadInputTokens > 0 && u.cacheCreationInputTokens > 0);
  const expected = ((u.inputTokens + u.cacheReadInputTokens * 0.1 + u.cacheCreationInputTokens * 1.25) * 3 + u.outputTokens * 15) / 1e6;
  assert.ok(Math.abs(priced.estimatedCostUsd - expected) < 1e-12);
  assert.ok(priced.estimatedCostUsd > ((u.inputTokens * 3 + u.outputTokens * 15) / 1e6));
  const error = console.error; console.error = () => {};
  let over;
  try {
    over = await run({ ...setup(), env: { ...env, LLM_TOKEN_BUDGET: '9000' }, text: 'Help me invest',
      provider: cachedProvider({ cacheReadInputTokens: 9000 }) });
  } finally { console.error = error; }
  assert.equal(over.mode, 'offline'); assert.equal(over.fallbackReason, 'token_budget');
});
