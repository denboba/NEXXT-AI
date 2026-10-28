'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');
const { personas } = require('../src/data/personas');

test('two complete four-persona runs succeed with exact financial seed restoration and audited reset', async t => {
  const app = await boot(); t.after(app.close);
  const client = app.client();
  for (let run = 0; run < 2; run++) {
    for (const persona of ['ioana', 'andrei', 'mihai', 'elena']) {
      await client.post('/api/journey', {});
      await client.post('/api/persona', { persona });
      const turn = await client.post('/api/agent', { text: 'medium' });
      const proposal = turn.data.cards.find(card => card.type === 'plan_proposal').proposal;
      const confirmation = await client.post(`/api/proposals/${proposal.id}/confirm`, { confirmed: true });
      assert.equal(confirmation.status, 200, persona);
      assert.equal((await client.post(`/api/plans/${confirmation.data.plan.id}/run-debit`)).status, 200, persona);
    }
    assert.equal(Object.keys(app.store.db.plans).length, 4);
    assert.equal((await client.post('/api/demo/reset')).status, 200);
    for (const persona of personas()) {
      assert.equal(app.store.db.accounts['account-persona-' + persona.id].balance, persona.balance);
      assert.deepEqual(app.store.db.customers['persona-' + persona.id], persona);
    }
    assert.equal(Object.keys(app.store.db.plans).length, 0);
    assert.equal(Object.keys(app.store.db.proposals).length, 0);
    assert.equal(Object.keys(app.store.db.confirmations).length, 0);
    assert.equal(app.store.db.ledger.length, 0);
    assert.equal(Object.keys(app.store.db.journeys).length, 0);
    assert.equal(app.store.db.audit.at(-1).decision, 'reset');
  }
});

test('active plan amount can change only through another explicit confirmation', async t => {
  const app = await boot(); t.after(app.close); const c = app.client();
  await c.post('/api/journey', {}); await c.post('/api/persona', { persona: 'ioana' });
  const first = await c.post('/api/agent', { text: 'medium' });
  const proposal = first.data.cards.find(card => card.type === 'plan_proposal').proposal;
  const plan = (await c.post(`/api/proposals/${proposal.id}/confirm`, { confirmed: true })).data.plan;
  const repeated = await c.post('/api/agent', { text: 'Help me plan my savings' });
  assert.match(repeated.data.messages[0].text, /already active/);
  const update = await c.post('/api/agent', { text: 'save 300 lei monthly' });
  const replacement = update.data.cards.find(card => card.type === 'plan_proposal').proposal;
  assert.equal(replacement.replacesPlanId, plan.id);
  assert.equal(app.store.db.plans[plan.id].monthly, 500);
  const updated = await c.post(`/api/proposals/${replacement.id}/confirm`, { confirmed: true });
  assert.equal(updated.data.plan.id, plan.id);
  assert.equal(updated.data.plan.monthly, 300);
  assert.equal(Object.keys(app.store.db.plans).length, 1);
  assert.equal(updated.data.account.balance, 18400);
  assert.equal(Object.keys(app.store.db.confirmations).length, 2);
});

test('reset is demo-only, same-origin and rate-limited', async t => {
  const app = await boot(); t.after(app.close); const c = app.client(); await c.post('/api/journey', {});
  assert.equal((await c.post('/api/demo/reset', {}, { origin: 'https://other.example' })).status, 403);
  for (let count = 0; count < 3; count++) {
    await c.post('/api/journey', {}); assert.equal((await c.post('/api/demo/reset')).status, 200);
  }
  await c.post('/api/journey', {}); assert.equal((await c.post('/api/demo/reset')).status, 429);
  const prod = await boot({ DEMO_MODE: '0' }); t.after(prod.close); const p = prod.client();
  await p.post('/api/journey', {}); assert.equal((await p.post('/api/demo/reset')).status, 403);
});
