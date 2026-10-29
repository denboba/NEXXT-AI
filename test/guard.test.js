'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { seed } = require('../src/data/personas');
const { run } = require('../src/agent/agent');
const { create } = require('../src/agent/scripted');
const guard = require('../src/agent/guard');
const { PRECONDITIONS, NOT_MODEL_CALLABLE, SPECS } = require('../src/tools');

function setup(id = 'ioana', risk) {
  const store = new Store(null); seed(store);
  return { store, journey: { id: 'journey-' + id, userId: 'persona-' + id, language: 'en',
    coach: { profile: risk ? { risk } : {} }, memory: {}, messages: [] }, env: {} };
}
// Call 1 emits the given tool calls; call 2 records what the model received and answers.
async function turn(ctx, calls, text = 'Help me invest') {
  const seen = {};
  const provider = create([
    { text: '', toolCalls: calls },
    request => {
      for (const message of request.messages.filter(item => item.role === 'tool')) seen[message.toolCallId] = JSON.parse(message.content);
      return { text: 'I checked your capacity and kept your savings safe.', toolCalls: [] };
    },
  ]);
  const result = await run({ ...ctx, text, provider });
  return { result, seen };
}
function assertRejected({ result, seen }, ctx, id, name, code) {
  assert.equal(seen[id]?.status, 'REJECTED'); assert.equal(seen[id].code, code);
  assert.equal(typeof seen[id].detail, 'string'); assert.ok(seen[id].detail.length > 0 && seen[id].detail.length < 200);
  const step = result.trace.find(item => item.guard === code);
  assert.ok(step, 'trace shows ' + code); assert.equal(step.tool, name); assert.equal(step.error, true);
  assert.equal(step.summary, 'rejected'); assert.equal(step.result, 'REJECTED: ' + code);
  assert.ok(ctx.store.db.audit.some(entry => entry.decision === 'rejected' && entry.reason === code), 'audited ' + code);
  assert.ok(result.decisions.some(node => node.kind === 'tool' && node.error), 'decision graph renders the rejected step');
}
const capacity = { id: 'cap', name: 'find_savings_capacity', input: {} };

test('PRECONDITIONS lives next to the tool specs and every entry names a real tool', () => {
  assert.deepEqual([...PRECONDITIONS.propose_plan], ['risk_answered', 'capacity_computed']);
  for (const name of Object.keys(PRECONDITIONS)) assert.ok(SPECS.some(spec => spec.name === name), name);
  for (const name of NOT_MODEL_CALLABLE) assert.ok(!SPECS.some(spec => spec.name === name), name);
  for (const name of ['activate_plan', 'confirm_plan', 'move_money', 'transfer', 'execute_debit']) assert.ok(NOT_MODEL_CALLABLE.includes(name), name);
});

test('guard.check returns each rejection code in order and null for an allowed call', () => {
  const journey = { coach: { profile: {} } }, results = {}, seen = new Set();
  const check = call => guard.check({ call, results, journey, seen })?.code || null;
  assert.equal(check({ name: 'launch_rocket', input: {} }), 'UNKNOWN_TOOL');
  assert.equal(check({ name: 'activate_plan', input: {} }), 'NOT_MODEL_CALLABLE');
  assert.equal(check({ name: 'move_money', input: { amount: 1 } }), 'NOT_MODEL_CALLABLE');
  assert.equal(check({ name: 'simulate', input: { monthly: 50, years: 5 } }), 'INVALID_ARGS');
  assert.equal(check({ name: 'get_customer_profile', input: { customerId: 'persona-elena' } }), 'INVALID_ARGS');
  const propose = { name: 'propose_plan', input: { productId: 'diversified-fund', monthly: 500 } };
  assert.match(guard.check({ call: propose, results, journey, seen }).detail, /risk_answered, capacity_computed/);
  journey.coach.profile.risk = 'medium';
  assert.match(guard.check({ call: propose, results, journey, seen }).detail, /capacity_computed/);
  results.find_savings_capacity = { error: 'unavailable' };
  assert.equal(check(propose), 'PRECONDITION_NOT_MET');
  results.find_savings_capacity = { safeMonthly: 500 };
  assert.equal(check(propose), null);
  const call = { name: 'compare_products', input: { goal: 'home', horizonYears: 5 } };
  assert.equal(check(call), null); guard.remember(seen, call);
  assert.equal(check({ name: 'compare_products', input: { horizonYears: 5, goal: 'home' } }), 'DUPLICATE_CALL');
  assert.equal(check({ name: 'compare_products', input: { horizonYears: 6, goal: 'home' } }), null);
  assert.deepEqual(guard.CODES, ['UNKNOWN_TOOL', 'NOT_MODEL_CALLABLE', 'INVALID_ARGS', 'PRECONDITION_NOT_MET', 'DUPLICATE_CALL']);
});

test('UNKNOWN_TOOL: an unknown tool is not run and the model receives the rejection', async () => {
  const ctx = setup();
  const out = await turn(ctx, [capacity, { id: 'x', name: 'launch_rocket', input: {} }]);
  assertRejected(out, ctx, 'x', 'launch_rocket', 'UNKNOWN_TOOL');
  assert.ok(ctx.store.db.audit.some(entry => entry.tool === 'unknown_tool' && entry.reason === 'UNKNOWN_TOOL'));
  assert.equal(out.result.mode, 'agent');
});

test('NOT_MODEL_CALLABLE: the model can never activate a plan or move money', async () => {
  const ctx = setup();
  const out = await turn(ctx, [capacity, { id: 'a', name: 'activate_plan', input: { proposalId: 'p1' } },
    { id: 'm', name: 'move_money', input: { amount: 5000 } }]);
  assertRejected(out, ctx, 'a', 'activate_plan', 'NOT_MODEL_CALLABLE');
  assert.equal(out.seen.m.code, 'NOT_MODEL_CALLABLE');
  assert.equal(Object.keys(ctx.store.db.plans).length, 0);
});

test('INVALID_ARGS: a call with unknown fields is not run', async () => {
  const ctx = setup(); const before = ctx.store.db.handoffs.length;
  const out = await turn(ctx, [capacity,
    { id: 'h', name: 'handoff_to_adviser', input: { reason: 'help', customerId: 'persona-elena' } }]);
  assertRejected(out, ctx, 'h', 'handoff_to_adviser', 'INVALID_ARGS');
  assert.equal(ctx.store.db.handoffs.length, before);
});

test('PRECONDITION_NOT_MET: propose_plan before risk answered and capacity computed creates no proposal', async () => {
  const ctx = setup();
  const out = await turn(ctx, [capacity, { id: 'p', name: 'propose_plan', input: { productId: 'diversified-fund', monthly: 500 } }]);
  assertRejected(out, ctx, 'p', 'propose_plan', 'PRECONDITION_NOT_MET');
  assert.match(out.seen.p.detail, /risk_answered/);
  assert.equal(Object.keys(ctx.store.db.proposals).length, 0);
  const risky = setup('ioana', 'medium');
  const early = await turn(risky, [{ id: 'p', name: 'propose_plan', input: { productId: 'diversified-fund', monthly: 500 } }]);
  assert.equal(early.seen.p.code, 'PRECONDITION_NOT_MET'); assert.match(early.seen.p.detail, /capacity_computed/);
  assert.doesNotMatch(early.seen.p.detail, /risk_answered/);
  // Without capacity the reply fails validation and the offline planner (which computes capacity
  // first) may propose; the model's own propose_plan never ran.
  assert.ok(early.result.trace.filter(item => item.tool === 'propose_plan' && item.source === 'agent')
    .every(item => item.guard === 'PRECONDITION_NOT_MET'));
});

test('DUPLICATE_CALL: an identical repeat is not run and the first result is kept', async () => {
  const ctx = setup(); const before = ctx.store.db.handoffs.length;
  const out = await turn(ctx, [capacity,
    { id: 'h1', name: 'handoff_to_adviser', input: { reason: 'help' } },
    { id: 'h2', name: 'handoff_to_adviser', input: { reason: 'help' } }]);
  assertRejected(out, ctx, 'h2', 'handoff_to_adviser', 'DUPLICATE_CALL');
  assert.equal(out.seen.h1.requested, true);
  assert.equal(ctx.store.db.handoffs.length, before + 1);
  assert.equal(out.result.cards.filter(card => card.type === 'handoff').length, 1);
  assert.equal(out.result.decisions.find(node => node.id === 'outcome').answer, 'handoff');
});

test('the offline planner goes through the guard and never trips it', async () => {
  const original = guard.check; const rejected = []; let checked = 0;
  guard.check = args => { checked++; const result = original(args); if (result) rejected.push(result.code); return result; };
  try {
    for (const id of ['ioana', 'andrei', 'mihai', 'elena']) {
      for (const text of ['medium', 'Help me invest', 'I want an adviser']) await run({ ...setup(id), text, provider: null });
    }
  } finally { guard.check = original; }
  assert.ok(checked > 20); assert.deepEqual(rejected, []);
});

test('offline loop stops after an iteration where the guard rejected every call', async () => {
  const offline = require('../src/agent/offline'), original = offline.next;
  let asked = 0;
  // A planner that keeps asking for propose_plan without its preconditions.
  offline.next = () => { asked++; return { toolCalls: [{ id: 'p', name: 'propose_plan', input: { productId: 'x', monthly: 100 } }] }; };
  try {
    const ctx = setup('ioana', 'medium');
    const result = await run({ ...ctx, text: 'Help me invest', provider: null });
    assert.equal(asked, 1, 'the rejected call is not re-issued');
    assert.equal(result.trace.filter(item => item.guard === 'PRECONDITION_NOT_MET').length, 1);
    assert.equal(ctx.store.db.audit.filter(entry => entry.reason === 'PRECONDITION_NOT_MET').length, 1);
  } finally { offline.next = original; }
});
