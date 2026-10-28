'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, chatToSim, signUp } = require('./helpers');
const { confirmProposal } = require('../src/bank');
const previewOf = response => response.data.cards.find(card => card.type === 'plan_proposal')?.proposal;

async function connect(app, persona = 'ioana') {
  const client = app.client();
  const simulation = await chatToSim(client);
  assert.ok(simulation.data.history.some(message => message.widgets?.some(card => card.type === 'connect_context')));
  const result = await client.post('/api/context/connect', { persona });
  assert.equal(result.status, 200);
  assert.equal(result.data.user, null);
  assert.ok(result.data.cards.some(card => card.type === 'capacity'));
  const planned = await client.post('/api/chat', { type: 'text', text: persona === 'andrei' ? 'low' : 'medium' });
  const preview = previewOf(planned);
  assert.ok(preview, JSON.stringify(planned.data));
  assert.equal(preview.preview, true);
  assert.equal(preview.userId, null);
  assert.ok(planned.data.trace.findIndex(item => item.tool === 'propose_plan')
    < planned.data.trace.findIndex(item => item.tool === 'request_authentication'));
  return { client, preview, journey: app.store.db.journeys[planned.data.journeyId] };
}

test('anonymous acquisition preview becomes a fresh account-scoped proposal only after approved login', async t => {
  const app = await boot(); t.after(app.close);
  const { client, preview, journey } = await connect(app);
  assert.equal((await client.post('/api/proposals/' + preview.id + '/confirm', { confirmed: true })).status, 401);
  assert.throws(() => confirmProposal(app.store, journey, preview.id, true), { status: 401 });
  assert.equal(Object.keys(app.store.db.plans).length, 0);
  const login = await client.post('/api/login/request', { identifier: 'ioana.popescu@example.com' });
  await client.post('/api/login/approve', { requestId: login.data.requestId });
  const logged = await client.get('/api/login/status?requestId=' + login.data.requestId);
  assert.equal(logged.data.requiresReplan, true);
  assert.equal(logged.data.account.balance, 18400);
  assert.equal((await client.post('/api/proposals/' + preview.id + '/confirm', { confirmed: true })).status, 404);
  const replanned = await client.post('/api/chat', { type: 'text', text: 'Recalculate my signed-in account plan' });
  const fresh = previewOf(replanned);
  assert.equal(fresh.preview, false);
  assert.equal(fresh.userId, 'persona-ioana');
  assert.notEqual(fresh.id, preview.id);
  assert.equal(fresh.monthly, preview.monthly);
  const confirmed = await client.post('/api/proposals/' + fresh.id + '/confirm', { confirmed: true });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.account.balance, 18400);
  const events = app.store.db.events.filter(event => event.journeyId === journey.id).map(event => event.type);
  assert.ok(events.indexOf('questions_answered') < events.indexOf('context_connected'));
  assert.ok(events.indexOf('context_connected') < events.indexOf('account_ready'));
});

test('all sample personas can preview; previews are scoped to their anonymous journey', async t => {
  const app = await boot(); t.after(app.close);
  for (const persona of ['ioana', 'andrei', 'mihai', 'elena']) {
    const { client, preview } = await connect(app, persona);
    const other = app.client(); await other.post('/api/journey', {});
    await other.post('/api/persona', { persona });
    assert.equal((await other.post('/api/proposals/' + preview.id + '/confirm', { confirmed: true })).status, 404);
    assert.equal((await client.get('/api/me')).status, 401);
  }
});

test('new demo account links explicit sample history but never inherits the sample balance', async t => {
  const app = await boot(); t.after(app.close);
  const { client, preview } = await connect(app);
  const signed = await signUp(client);
  assert.equal(signed.status, 200);
  assert.equal(signed.data.account.balance, 0);
  assert.equal(signed.data.requiresReplan, true);
  const next = await client.post('/api/chat', { type: 'text', text: 'Recalculate my signed-in account plan' });
  const capacity = next.data.cards.find(card => card.type === 'capacity');
  assert.equal(capacity.balance, 0);
  const proposal = previewOf(next);
  assert.equal(proposal.productId, 'buffer-savings');
  assert.equal(proposal.preview, false);
  assert.equal((await client.post('/api/proposals/' + preview.id + '/confirm', { confirmed: true })).status, 404);
});

test('sample connection is demo-only, same-origin and cannot replace authenticated history', async t => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await c.post('/api/journey', {});
  assert.equal((await c.post('/api/context/connect', { persona: 'ioana' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.post('/api/context/connect', { persona: '../ioana' })).status, 404);
  await c.post('/api/persona', { persona: 'andrei' });
  assert.equal((await c.post('/api/context/connect', { persona: 'ioana' })).status, 409);
  const production = await boot({ DEMO_MODE: '0' }); t.after(production.close);
  const prod = production.client(); await prod.post('/api/journey', {});
  assert.equal((await prod.post('/api/context/connect', { persona: 'ioana' })).status, 403);
});
