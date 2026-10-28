'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, chatToSim, signUp } = require('./helpers');

test('web chat: three questions lead to the simulation with engine numbers', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client();
  const r = await chatToSim(c);
  assert.equal(r.status, 200);
  const sim = r.data.messages.find((m) => m.widgets && m.widgets.some((w) => w.type === 'sim')).widgets[0].sim;
  assert.equal(sim.fund, 35771);
  assert.equal(sim.cashReal, 26379);
  assert.match(r.data.messages.find((m) => m.widgets && m.widgets.some((w) => w.type === 'cta')).text, /free account/);
  const types = app.store.db.events.map((e) => e.type);
  for (const t of ['ad_click', 'chat_started', 'questions_answered', 'simulation_viewed']) assert.ok(types.includes(t), t);
});

test('chat responses include the full history so the client never loses earlier messages', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await chatToSim(c);
  const r = await c.post('/api/chat', { type: 'choice', id: 'faq_fees' });
  assert.ok(r.data.messages.length < r.data.history.length);
  assert.ok(r.data.history.some((m) => m.widgets && m.widgets.some((w) => w.type === 'cta')), 'CTA must still be in history');
  assert.equal(r.data.history.at(-1).id, r.data.messages.at(-1).id);
});

test('slider change re-runs the simulation; out-of-range amounts are refused politely', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await chatToSim(c);
  let r = await c.post('/api/chat', { type: 'amount', value: 1000 });
  assert.equal(r.data.messages[r.data.messages.length - 1].widgets[0].sim.monthly, 1000);
  r = await c.post('/api/chat', { type: 'amount', value: 5 });
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.monthly, 1000, 'invalid amount must not overwrite the profile');
});

test('FAQ answers and free text intents', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await chatToSim(c);
  let r = await c.post('/api/chat', { type: 'choice', id: 'faq_market_drop' });
  assert.match(r.data.messages.at(-1).text, /Nothing is guaranteed/);
  r = await c.post('/api/chat', { type: 'text', text: 'can I take my money out any time?' });
  assert.match(r.data.messages.at(-1).text, /working days/);
  r = await c.post('/api/chat', { type: 'text', text: 'tell me about the pension' });
  assert.match(r.data.messages.at(-1).text, /Voluntary pension/);
  r = await c.post('/api/chat', { type: 'text', text: 'asdf qwerty' });
  assert.match(r.data.messages.at(-1).text, /I can help with/);
});

test('human handoff stores the conversation for an adviser', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await chatToSim(c);
  let r = await c.post('/api/chat', { type: 'text', text: 'I want to talk to a person' });
  assert.ok(r.data.messages.at(-1).widgets.some((w) => w.type === 'handoff_form'));
  assert.equal((await c.post('/api/handoff', { phone: 'abc' })).status, 400);
  assert.equal((await c.post('/api/handoff', { phone: '+40 744 555 666' })).status, 200);
  const h = app.store.db.handoffs[0];
  assert.equal(h.phone, '+40744555666');
  assert.ok(h.transcript.length > 3);
});

test('new customer: onboarding steps are enforced in order and carry the chat over', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await chatToSim(c);
  assert.equal((await c.post('/api/signup/id', { idNumber: 'RX123456' })).status, 409);
  assert.equal((await c.post('/api/signup/details', { firstName: 'M', lastName: '', email: 'x', phone: '1' })).status, 400);
  assert.equal((await c.post('/api/signup/details', { firstName: 'Maria', lastName: 'Ionescu', email: 'maria@example.com', phone: '+40 733 111 222' })).status, 200);
  assert.equal((await c.post('/api/signup/selfie', { captured: true })).status, 409, 'selfie before ID');
  assert.equal((await c.post('/api/signup/id', { idNumber: 'bad' })).status, 400);
  await c.post('/api/signup/id', { idNumber: 'rx 123456' });
  assert.equal((await c.post('/api/signup/selfie', {})).status, 400);
  await c.post('/api/signup/selfie', { captured: true });
  const otp = await c.post('/api/signup/otp/request');
  assert.match(otp.data.demoCode, /^\d{6}$/);
  assert.equal((await c.post('/api/signup/otp/verify', { code: '000000' })).status, 400);
  const done = await c.post('/api/signup/otp/verify', { code: otp.data.demoCode });
  assert.equal(done.status, 200);
  assert.equal(done.data.user.firstName, 'Maria');
  assert.match(done.data.account.iban, /^RO00DEMO/);
  assert.equal(done.data.account.balance, 0);
  assert.equal(done.data.stage, 'app');
  assert.match(done.data.messages.find((m) => /You’re in, Maria/.test(m.text)).text, /500 lei\/month, balanced, 5 years/);
  assert.ok(app.store.db.events.some((e) => e.type === 'account_ready' && e.kind === 'new'));
  assert.ok(!JSON.stringify(app.store.db.users).includes('123456'), 'full ID number must not be stored');
});

test('OTP expires and locks after too many wrong attempts', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await c.post('/api/journey', {});
  await c.post('/api/signup/details', { firstName: 'A', lastName: 'B', email: 'a@b.co', phone: '+40 755 000 000' });
  await c.post('/api/signup/id', { idNumber: 'AB123456' }); await c.post('/api/signup/selfie', { captured: true });
  const otp = await c.post('/api/signup/otp/request');
  for (let i = 0; i < 5; i++) await c.post('/api/signup/otp/verify', { code: '111111' });
  assert.equal((await c.post('/api/signup/otp/verify', { code: otp.data.demoCode })).status, 429);
  const o = Object.values(app.store.db.onboardings)[0];
  o.otpAttempts = 0; o.otpExpires = Date.now() - 1;
  assert.equal((await c.post('/api/signup/otp/verify', { code: otp.data.demoCode })).status, 410);
});

test('duplicate phone or email is rejected', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await c.post('/api/journey', {});
  const r = await c.post('/api/signup/details', { firstName: 'Ioana', lastName: 'P', email: 'new@example.com', phone: '+40 722 000 111' });
  assert.equal(r.status, 409);
});

test('existing client: login needs approval, then keeps the conversation', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await chatToSim(c, { amount: 'a300', years: 'y10' });
  assert.equal((await c.post('/api/login/request', { identifier: '+40 799 999 999' })).status, 404);
  const req = await c.post('/api/login/request', { identifier: '+40 722 000 111' });
  assert.equal(req.status, 200);
  let s = await c.get(`/api/login/status?requestId=${req.data.requestId}`);
  assert.equal(s.data.status, 'pending');
  assert.equal((await c.get('/api/me')).status, 401, 'no access before approval');
  await c.post('/api/login/approve', { requestId: req.data.requestId });
  s = await c.get(`/api/login/status?requestId=${req.data.requestId}`);
  assert.equal(s.data.status, 'approved');
  assert.equal(s.data.user.firstName, 'Ioana');
  assert.equal(s.data.account.balance, 2500);
  assert.match(s.data.messages.map((m) => m.text).join(' '), /300 lei\/month, balanced, 10 years/);
  assert.equal((await c.get('/api/me')).status, 200);
});

test('another visitor cannot approve or poll someone else\'s login request', async (t) => {
  const app = await boot(); t.after(app.close);
  const a = app.client(), b = app.client();
  await a.post('/api/journey', {}); await b.post('/api/journey', {});
  const req = await a.post('/api/login/request', { identifier: 'ioana.popescu@example.com' });
  assert.equal((await b.post('/api/login/approve', { requestId: req.data.requestId })).status, 404);
  assert.equal((await b.get(`/api/login/status?requestId=${req.data.requestId}`)).status, 404);
});

test('plans: suitability gate, activation, first debit, funnel, insufficient balance', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client(); await chatToSim(c);
  const req = await c.post('/api/login/request', { identifier: '+40 722 000 111' });
  await c.post('/api/login/approve', { requestId: req.data.requestId });
  await c.get(`/api/login/status?requestId=${req.data.requestId}`);

  let r = await c.post('/api/plans', { productId: 'diversified-fund', monthly: 500 });
  assert.equal(r.status, 409, 'risk question must be answered first');

  r = await c.post('/api/chat', { type: 'choice', id: 'r_low' });
  const prod = r.data.messages.at(-1).widgets[0];
  assert.equal(prod.recommended, 'bond-fund');
  assert.equal(prod.items.find((i) => i.id === 'stocks-etfs').allowed, false);
  assert.equal((await c.post('/api/plans', { productId: 'stocks-etfs', monthly: 500 })).status, 403);
  assert.equal((await c.post('/api/plans', { productId: 'bond-fund', monthly: 50 })).status, 400);

  r = await c.post('/api/plans', { productId: 'bond-fund', monthly: 500 });
  assert.equal(r.status, 200);
  const plan = r.data.plan;
  assert.match(plan.nextDebit, /^\d{4}-\d{2}-05$/);
  assert.match(r.data.messages.at(-1).text, /Done ✓/);
  assert.equal((await c.post('/api/plans', { productId: 'bond-fund', monthly: 500 })).status, 409, 'no duplicate active plan');

  r = await c.post(`/api/plans/${plan.id}/run-debit`);
  assert.equal(r.status, 200);
  assert.equal(r.data.account.balance, 2000);
  assert.equal(r.data.portfolio.invested, 500);
  assert.equal(r.data.ledger[0].kind, 'debit');

  const adm = await c.get('/api/admin/metrics', { 'x-admin-token': 'secret' });
  const counts = Object.fromEntries(adm.data.steps.map((s) => [s.type, s.count]));
  assert.deepEqual(counts, { ad_click: 1, chat_started: 1, questions_answered: 1, account_ready: 1, plan_activated: 1, first_debit_executed: 1 });
  assert.equal(adm.data.existingClients, 1);

  // balance too low: the debit is refused and nothing moves
  app.store.db.accounts[plan.accountId].balance = 100;
  r = await c.post(`/api/plans/${plan.id}/run-debit`);
  assert.equal(r.status, 402);
  assert.equal(app.store.db.accounts[plan.accountId].balance, 100);
});

test('a client cannot touch another client\'s plan', async (t) => {
  const app = await boot(); t.after(app.close);
  const a = app.client(); await chatToSim(a);
  await signUp(a);
  await a.post('/api/chat', { type: 'choice', id: 'r_medium' });
  await a.post('/api/me/topup', { amount: 1000 });
  const plan = (await a.post('/api/plans', { productId: 'diversified-fund', monthly: 500 })).data.plan;
  const b = app.client(); await b.post('/api/journey', {});
  const req = await b.post('/api/login/request', { identifier: '+40 722 000 111' });
  await b.post('/api/login/approve', { requestId: req.data.requestId });
  await b.get(`/api/login/status?requestId=${req.data.requestId}`);
  assert.equal((await b.post(`/api/plans/${plan.id}/run-debit`)).status, 404);
  assert.equal((await b.post(`/api/plans/${plan.id}/stop`)).status, 404);
});

test('admin endpoints need the token; demo-only actions are off outside demo mode', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client();
  assert.equal((await c.get('/api/admin/metrics')).status, 401);
  assert.equal((await c.get('/api/admin/metrics', { 'x-admin-token': 'wrong' })).status, 401);
  assert.equal((await c.get('/api/admin/metrics', { 'x-admin-token': 'secret' })).status, 200);
  const prod = await boot({ DEMO_MODE: '0' }); t.after(prod.close);
  const p = prod.client(); await p.post('/api/journey', {});
  const otpReq = await p.post('/api/signup/details', { firstName: 'A', lastName: 'B', email: 'a@b.co', phone: '+40 755 000 001' });
  await p.post('/api/signup/id', { idNumber: 'AB123456' }); await p.post('/api/signup/selfie', { captured: true });
  assert.equal((await p.post('/api/signup/otp/request')).data.demoCode, undefined, 'code must not be returned outside demo mode');
  const req = await p.post('/api/login/request', { identifier: '+40 722 000 111' });
  assert.equal((await p.post('/api/login/approve', { requestId: req.data.requestId })).status, 403);
});

test('basics: static pages, security headers, bad input, path traversal', async (t) => {
  const app = await boot(); t.after(app.close);
  const c = app.client();
  const home = await fetch(app.base + '/'); assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(app.base + '/..%2f..%2fetc/passwd')).status, 404);
  assert.equal((await fetch(app.base + '/../package.json')).status, 404);
  assert.equal((await c.post('/api/chat', { type: 'text', text: 'hi' })).status, 401, 'chat needs a journey');
  assert.equal((await c.get('/api/simulate?monthly=5')).status, 400);
  assert.equal((await c.get('/api/simulate?monthly=500&years=5')).data.fund, 35771);
  const big = await fetch(app.base + '/api/journey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'x'.repeat(30000) }) });
  assert.equal(big.status, 413);
  const bad = await fetch(app.base + '/api/journey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
});

test('state survives a restart of the store file', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { Store } = require('../src/store');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexxt-')), 'db.json');
  const a = new Store(file); a.db.handoffs.push({ id: 'x' }); a.flush();
  assert.equal(new Store(file).db.handoffs[0].id, 'x');
});
