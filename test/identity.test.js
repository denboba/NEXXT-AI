'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, chatToSim } = require('./helpers');
const { Store } = require('../src/store');
const { seed } = require('../src/data/personas');

test('documented phone login and persona selection use one account, history and agent', async t => {
  const app = await boot(); t.after(app.close);
  const client = app.client(); await chatToSim(client);
  const login = await client.post('/api/login/request', { identifier: '+40 722 000 111' });
  assert.equal((await client.get('/api/me')).status, 401);
  await client.post('/api/login/approve', { requestId: login.data.requestId });
  const logged = await client.get('/api/login/status?requestId=' + login.data.requestId);
  assert.equal(logged.data.user.id, 'persona-ioana');
  assert.equal(logged.data.account.balance, 18400);
  const result = await client.post('/api/chat', { type: 'text', text: 'medium' });
  assert.equal(result.data.mode, 'offline');
  assert.ok(result.data.cards.some(card => card.type === 'plan_proposal'));
  const persona = app.client(); await persona.post('/api/journey', {});
  const switched = await persona.post('/api/persona', { persona: 'ioana' });
  assert.equal(switched.data.account.id, logged.data.account.id);
  assert.equal(Object.values(app.store.db.users).filter(user => user.firstName === 'Ioana').length, 1);
});

test('legacy Ioana migration preserves net activity and archives original records once', () => {
  const store = new Store(null);
  store.db.users.legacy = { id: 'legacy', seed: true, phone: '+40722000111', email: 'ioana.popescu@example.com' };
  store.db.accounts.old = { id: 'old', userId: 'legacy', balance: 2000 };
  store.db.ledger.push({ userId: 'legacy', accountId: 'old', amount: 2500, label: 'Opening balance' });
  store.db.journeys.j = { id: 'j', userId: 'legacy' };
  store.db.loginRequests.r = { userId: 'legacy' };
  store.db.plans.p = { id: 'p', userId: 'legacy', accountId: 'old', invested: 500 };
  seed(store);
  assert.equal(store.db.accounts['account-persona-ioana'].balance, 17900);
  assert.equal(store.db.journeys.j.userId, 'persona-ioana');
  assert.equal(store.db.plans.p.accountId, 'account-persona-ioana');
  assert.equal(store.db.legacySeedArchive.legacy.accounts[0].balance, 2000);
  assert.equal(store.db.users.legacy, undefined);
  const before = JSON.stringify(store.db); seed(store);
  assert.equal(JSON.stringify(store.db), before);
});
