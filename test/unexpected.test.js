'use strict';
// Unexpected situations referenced in JUDGING.md: each must end in a safe, explained outcome.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { seed } = require('../src/data/personas');
const { run } = require('../src/agent/agent');
const { select } = require('../src/agent/provider');
const bank = require('../src/bank');

function setup(id = 'ioana') {
  const store = new Store(null); seed(store);
  return { store, journey: { id: 'journey-' + id, userId: 'persona-' + id, language: 'en', coach: { profile: {} },
    memory: {}, messages: [] }, env: {} };
}

test('a malformed model tool call falls back to the offline planner with the same tools', async () => {
  const provider = { name: 'malformed', complete: async () => ({ toolCalls: [{ name: 42 }] }) };
  const result = await run({ ...setup(), text: 'Help me invest', provider });
  assert.equal(result.mode, 'offline'); assert.equal(result.fallbackReason, 'invalid_tool_call');
  assert.ok(result.cards.some(card => card.type === 'capacity'));
});

test('an unknown tool requested by the model is rejected and audited as unknown_tool', async () => {
  const ctx = setup(); let calls = 0;
  const provider = { name: 'unknown', complete: async () => (calls++ === 0
    ? { toolCalls: [{ id: 'x', name: 'transfer_money', input: { amount: 5000 } }] }
    : { text: 'I can only use the planning tools.' }) };
  const result = await run({ ...ctx, text: 'Help me invest', provider });
  const step = result.trace.find(item => item.tool === 'transfer_money');
  assert.ok(step && step.error); assert.equal(step.summary, 'rejected');
  assert.ok(ctx.store.db.audit.some(entry => entry.tool === 'unknown_tool' && entry.decision === 'rejected'));
  assert.equal(Object.keys(ctx.store.db.plans).length, 0);
});

test('a provider HTTP 403 is classified as auth and the turn completes offline', async () => {
  const provider = select({ env: { LLM_PROVIDER: 'bedrock', AWS_BEARER_TOKEN_BEDROCK: 'fixture', AWS_REGION: 'eu-west-2',
    BEDROCK_MODEL_ID: 'eu.anthropic.fixture-v1:0' },
  fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: 'AccessDeniedException' }) }) });
  const result = await run({ ...setup(), text: 'Help me invest', provider });
  assert.equal(result.mode, 'offline'); assert.equal(result.fallbackReason, 'auth');
  assert.ok(result.cards.some(card => card.type === 'capacity'));
});

test('a proposal from an older version cannot be confirmed after the goal changes', async () => {
  const ctx = setup();
  await run({ ...ctx, text: 'medium', provider: null });
  const proposal = Object.values(ctx.store.db.proposals)[0]; assert.ok(proposal);
  ctx.journey.proposalVersion = (ctx.journey.proposalVersion || 0) + 1;
  assert.throws(() => bank.confirmProposal(ctx.store, ctx.journey, proposal.id, true), /changed/);
  assert.equal(Object.keys(ctx.store.db.plans).length, 0);
});
