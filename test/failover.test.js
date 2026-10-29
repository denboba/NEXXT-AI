'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { seed } = require('../src/data/personas');
const { run } = require('../src/agent/agent');
const { create } = require('../src/agent/scripted');
const { ProviderError } = require('../src/agent/http');
const { select } = require('../src/agent/provider');
const { sseResponse } = require('./sse');

function setup(id = 'ioana', risk) {
  const store = new Store(null); seed(store);
  return { store, journey: { id: 'journey-' + id, userId: 'persona-' + id, language: 'en',
    coach: { profile: risk ? { risk } : {} }, memory: {}, messages: [] }, env: {} };
}
// Stub console.error for one turn and collect the server log lines.
async function logged(work) {
  const original = console.error, lines = [];
  console.error = (...args) => lines.push(args.join(' '));
  try { return { value: await work(), lines }; } finally { console.error = original; }
}
// Count real tool executions from the audit log (the guard rejects without executing).
function executed(store) {
  const counts = {};
  for (const entry of store.db.audit) if (['allowed', 'rejected'].includes(entry.decision) && !entry.reason) {
    counts[entry.tool] = (counts[entry.tool] || 0) + 1;
  }
  return counts;
}
const callOne = { text: 'Let me look.', toolCalls: [
  { id: 't1', name: 'get_customer_profile', input: {} },
  { id: 't2', name: 'get_spending_summary', input: {} },
  { id: 't3', name: 'find_savings_capacity', input: {} },
] };
const live = name => require('../src/agent/' + name);

test('success then throw: the offline planner finishes the turn without re-running call-1 tools', async () => {
  const ctx = setup('ioana', 'medium'), events = [];
  const offline = await run({ ...setup('ioana', 'medium'), text: 'Help me invest', provider: null });
  let second;
  const provider = create([callOne, request => {
    second = request;
    request.onEvent({ type: 'text_delta', text: 'partial ' });
    throw new ProviderError('server_error');
  }]);
  const { value: result, lines } = await logged(() => run({ ...ctx, text: 'Help me invest', provider,
    onProgress: event => events.push(event) }));
  const count = { counts: executed(ctx.store) };
  assert.ok(second, 'call 2 happened');
  assert.equal(result.mode, 'offline'); assert.equal(result.fallbackReason, 'server_error');
  for (const name of ['get_customer_profile', 'get_spending_summary', 'find_savings_capacity']) {
    assert.equal(count.counts[name], 1, name + ' ran once');
    assert.equal(result.trace.filter(item => item.tool === name).length, 1, name + ' traced once');
    assert.equal(result.trace.find(item => item.tool === name).source, 'agent');
  }
  assert.equal(result.trace.filter(item => item.guard).length, 0, 'no DUPLICATE_CALL rows');
  assert.ok(result.trace.some(item => item.source === 'offline'), 'offline planner continued');
  assert.equal(result.text, offline.text, 'same answer as a pure offline turn');
  assert.equal(result.streamedText, 'Let me look. partial ');
  assert.ok(!events.some(event => /text/.test(event.type)), 'no partial text in progress events');
  assert.ok(!JSON.stringify(events).includes('partial'));
  const fallback = events.filter(event => event.type === 'fallback');
  assert.equal(fallback.length, 1); assert.equal(fallback[0].code, 'server_error');
  assert.deepEqual(lines, ['[nexxt] live provider failed: server_error']);
});

test('the failed call\'s tool calls are dropped (real Anthropic stream that errors mid tool_use)', async () => {
  const ctx = setup('ioana', 'medium');
  const block = (index, id, name) => 'event: content_block_start\ndata: ' + JSON.stringify({ type: 'content_block_start',
    index, content_block: { type: 'tool_use', id, name, input: {} } }) + '\n\nevent: content_block_stop\ndata: '
    + JSON.stringify({ type: 'content_block_stop', index }) + '\n\n';
  const start = 'event: message_start\ndata: ' + JSON.stringify({ type: 'message_start', message: { id: 'm', type: 'message',
    role: 'assistant', content: [], usage: { input_tokens: 10, output_tokens: 1 } } }) + '\n\n';
  const text = 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
    + 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Checking."}}\n\n'
    + 'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n';
  const first = start + text + block(1, 'a1', 'get_customer_profile') + block(2, 'a2', 'get_spending_summary')
    + block(3, 'a3', 'find_savings_capacity')
    + 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":20}}\n\n'
    + 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
  const failing = start + block(0, 'b1', 'handoff_to_adviser') + block(1, 'b2', 'get_customer_profile')
    + 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
  let calls = 0;
  const provider = select({ env: { LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'fake' },
    fetchImpl: async () => sseResponse(calls++ === 0 ? first : failing) });
  const handoffs = ctx.store.db.handoffs.length;
  const { value: result, lines } = await logged(() => run({ ...ctx, text: 'Help me invest', provider }));
  const count = { counts: executed(ctx.store) };
  assert.equal(calls, 2);
  assert.equal(result.mode, 'offline'); assert.equal(result.fallbackReason, 'server_error');
  assert.equal(count.counts.handoff_to_adviser, undefined, 'failed call tool calls never executed');
  assert.equal(ctx.store.db.handoffs.length, handoffs);
  assert.equal(count.counts.get_customer_profile, 1);
  assert.equal(result.streamedText, 'Checking.');
  assert.deepEqual(lines, ['[nexxt] live provider failed: server_error']);
});

test('offline planner only issues the profile tools this turn does not already have', () => {
  const offline = live('offline');
  const names = results => offline.next({ text: 'Help me invest', results, memory: {} }).toolCalls.map(call => call.name);
  assert.deepEqual(names({}), ['get_customer_profile', 'get_spending_summary', 'find_savings_capacity']);
  assert.deepEqual(names({ get_spending_summary: { monthlySurplus: 1 } }), ['get_customer_profile', 'find_savings_capacity']);
  assert.deepEqual(names({ find_savings_capacity: { safeMonthly: 1 }, get_spending_summary: {} }), ['get_customer_profile']);
});

test('a client abort does not fall back, run no offline tools or log a failure', async () => {
  const ctx = setup('ioana', 'medium'), events = [], client = new AbortController();
  const provider = create([callOne, request => new Promise((resolve, reject) => {
    setTimeout(() => client.abort(), 5);
    request.signal.addEventListener('abort', () => reject(new ProviderError('timeout')), { once: true });
  })]);
  const before = ctx.store.db.turns.length;
  const { value: outcome, lines } = await logged(() => run({ ...ctx, text: 'Help me invest', provider,
    signal: client.signal, onProgress: event => events.push(event) }).then(() => null, error => error));
  assert.ok(outcome, 'run rejects on a client abort');
  assert.equal(outcome.code, 'aborted');
  assert.ok(!events.some(event => event.type === 'fallback'));
  assert.ok(!events.some(event => event.type === 'tool_start' && event.tool === 'compare_products'));
  assert.equal(events.filter(event => event.type === 'tool_start').length, 3, 'only call-1 tools ran');
  assert.deepEqual(lines, []);
  assert.equal(ctx.store.db.turns.length, before, 'no turn metrics for an aborted turn');
  assert.equal(ctx.journey.messages.length, 0);
});

test('a client signal that is already aborted never calls the provider', async () => {
  const ctx = setup(), client = new AbortController(); client.abort();
  let called = false;
  const provider = create([() => { called = true; return callOne; }]);
  const outcome = await run({ ...ctx, text: 'Help me invest', provider, signal: client.signal }).then(() => null, error => error);
  assert.equal(outcome?.code, 'aborted'); assert.equal(called, false);
});

test('HTTP: a client that disconnects mid-turn gets no fallback and no stored coach message', async () => {
  const { boot } = require('./helpers');
  let started, released;
  const begun = new Promise(resolve => { started = resolve; });
  const provider = create([callOne, request => new Promise((resolve, reject) => {
    started();
    request.signal.addEventListener('abort', () => { released = true; reject(new ProviderError('timeout')); }, { once: true });
  }), { text: '', toolCalls: [] }]);
  const app = await boot({}, { provider });
  try {
    const first = await fetch(app.base + '/api/journey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const cookie = first.headers.get('set-cookie').split(';')[0];
    const post = (path, body, signal) => fetch(app.base + path, { method: 'POST', signal,
      headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
    await (await post('/api/persona', { persona: 'ioana' })).text();
    const journey = Object.values(app.store.db.journeys).find(item => item.userId === 'persona-ioana');
    const before = journey.messages.length, client = new AbortController();
    const { lines } = await logged(async () => {
      const pending = post('/api/agent', { text: 'Help me invest' }, client.signal).catch(error => error);
      await begun; client.abort();
      assert.equal((await pending).name, 'AbortError');
      for (let wait = 0; wait < 100 && !released; wait++) await new Promise(resolve => setTimeout(resolve, 10));
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    assert.equal(released, true, 'the provider call was aborted');
    assert.equal(journey.messages.length, before, 'no user or coach message persisted');
    assert.ok(!app.store.db.audit.some(entry => entry.decision === 'allowed' && entry.tool === 'compare_products'));
    assert.deepEqual(lines, []);
    const status = await (await fetch(app.base + '/api/agent/status', { headers: { cookie } })).json();
    assert.ok(!status.events.some(event => event.type === 'fallback'));
    // The journey is not left busy and a normal turn still completes.
    const next = await post('/api/agent', { text: 'Help me invest' });
    assert.equal(next.status, 200);
  } finally { await app.close(); }
});

test('real Anthropic stream that errors mid-text keeps the partial text of the failed call', async () => {
  const ctx = setup('ioana', 'medium'), events = [];
  const start = 'event: message_start\ndata: ' + JSON.stringify({ type: 'message_start', message: { id: 'm', type: 'message',
    role: 'assistant', content: [], usage: { input_tokens: 10, output_tokens: 1 } } }) + '\n\n';
  const tools = ['get_customer_profile', 'get_spending_summary', 'find_savings_capacity'].map((name, index) =>
    'event: content_block_start\ndata: ' + JSON.stringify({ type: 'content_block_start', index,
      content_block: { type: 'tool_use', id: 'c' + index, name, input: {} } })
    + '\n\nevent: content_block_stop\ndata: ' + JSON.stringify({ type: 'content_block_stop', index }) + '\n\n').join('');
  const first = start + tools
    + 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":20}}\n\n'
    + 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
  const failing = start
    + 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
    + 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Your buffer "}}\n\n'
    + 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"looks fine"}}\n\n'
    + 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
  let calls = 0;
  const provider = select({ env: { LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'fake' },
    fetchImpl: async () => sseResponse(calls++ === 0 ? first : failing, { chunk: 9 }) });
  const { value: result, lines } = await logged(() => run({ ...ctx, text: 'Help me invest', provider,
    onProgress: event => events.push(event) }));
  assert.equal(calls, 2);
  assert.equal(result.mode, 'offline'); assert.equal(result.fallbackReason, 'server_error');
  assert.equal(result.streamedText, 'Your buffer looks fine');
  assert.ok(!JSON.stringify(events).includes('looks fine'), 'partial text never reaches progress events');
  assert.deepEqual(lines, ['[nexxt] live provider failed: server_error']);
});
