'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');
const { create } = require('../src/agent/scripted');

test('owned progress appears during a delayed live turn and the non-streaming result remains complete', async t => {
  const scripted = create();
  const provider = { name: 'scripted', async complete(request) {
    await new Promise(resolve => setTimeout(resolve, 60));
    return scripted.complete(request);
  } };
  const app = await boot({}, { provider }); t.after(app.close);
  const a = app.client(), b = app.client();
  await a.post('/api/journey', {}); await a.post('/api/persona', { persona: 'ioana' });
  await b.post('/api/journey', {});
  const turnId = require('node:crypto').randomUUID();
  const pending = a.post('/api/agent', { text: 'medium', turnId });
  let status;
  for (let count = 0; count < 30; count++) {
    await new Promise(resolve => setTimeout(resolve, 10));
    status = await a.get('/api/agent/status?turnId=' + turnId);
    if (status.data.events?.some(event => event.type === 'tool_end')) break;
  }
  assert.equal(status.data.state, 'running');
  assert.ok(status.data.events.some(event => event.type === 'tool_start'));
  assert.equal((await b.get('/api/agent/status?turnId=' + turnId)).status, 404);
  assert.equal((await a.post('/api/demo/reset')).status, 409);
  const result = await pending;
  assert.equal(result.data.mode, 'agent');
  assert.ok(result.data.cards.some(card => card.type === 'plan_proposal'));
  assert.ok(result.data.providerCalls.length >= 3);
  assert.equal((await a.get('/api/agent/status?turnId=' + turnId)).data.state, 'complete');
});
