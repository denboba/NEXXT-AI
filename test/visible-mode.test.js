'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');
const { create } = require('../src/agent/scripted');
const { ProviderError } = require('../src/agent/http');
const { verdict, exitCodeFor } = require('../scripts/smoke-live');

async function persona(app, id = 'ioana') {
  const c = app.client(); await c.post('/api/journey', {}); await c.post('/api/persona', { persona: id }); return c;
}

test('adapters declare their model id', () => {
  const env = { ANTHROPIC_API_KEY: 'k', COMPAT_API_KEY: 'k', AWS_BEARER_TOKEN_BEDROCK: 'k', BEDROCK_MODEL_ID: 'eu.anthropic.x' };
  assert.equal(require('../src/agent/anthropic').create({ env }).model, 'claude-sonnet-5-5');
  assert.equal(require('../src/agent/anthropic').create({ env: { COACH_MODEL: 'm1' } }).model, 'm1');
  assert.equal(require('../src/agent/openai').create({ env }).model, 'gpt-4.1-mini');
  assert.equal(require('../src/agent/bedrock').create({ env }).model, 'eu.anthropic.x');
});

test('config exposes no provider offline and the injected provider name and model, never keys', async t => {
  const offline = await boot({}, { provider: null }); t.after(offline.close);
  const off = (await offline.client().get('/api/config')).data;
  assert.equal(off.llm, false); assert.equal(off.provider, null); assert.equal(off.model, null);
  const live = await boot({ ANTHROPIC_API_KEY: 'sk-secret-value' }, { provider: { ...create(), name: 'anthropic', model: 'claude-test' } });
  t.after(live.close);
  const on = await live.client().get('/api/config');
  assert.equal(on.data.llm, true); assert.equal(on.data.provider, 'anthropic'); assert.equal(on.data.model, 'claude-test');
  assert.equal(JSON.stringify(on.data).includes('sk-secret'), false);
});

test('a live turn reports its model and carries no fallback notice', async t => {
  const app = await boot({}, { provider: create() }); t.after(app.close);
  const r = await (await persona(app)).post('/api/agent', { text: 'medium' });
  assert.equal(r.data.mode, 'agent'); assert.equal(r.data.model, 'scripted');
  assert.equal(r.data.messages[0].fallback, undefined);
});

test('a fallback turn has no model and stores the notice on that coach message', async t => {
  const provider = { name: 'anthropic', model: 'claude-test', complete: async () => { throw new ProviderError('timeout'); } };
  const app = await boot({}, { provider }); t.after(app.close);
  const c = await persona(app);
  const error = console.error; console.error = () => {};
  let r; try { r = await c.post('/api/agent', { text: 'medium' }); } finally { console.error = error; }
  assert.equal(r.data.mode, 'offline'); assert.equal(r.data.fallbackReason, 'timeout'); assert.equal(r.data.model, null);
  assert.equal(r.data.messages[0].role, 'coach'); assert.equal(r.data.messages[0].fallback, 'timeout');
  const stored = (await c.get('/api/journey')).data.messages.filter(m => m.role === 'coach').at(-1);
  assert.equal(stored.fallback, 'timeout');
  // Plain offline (no provider) is not a fallback and gets no notice.
  const plain = await boot({}, { provider: null }); t.after(plain.close);
  const p = await (await persona(plain)).post('/api/agent', { text: 'medium' });
  assert.equal(p.data.messages[0].fallback, undefined);
});

test('smoke-live fails on any fallback turn unless SMOKE_ALLOW_FALLBACK=1', () => {
  const live = { mode: 'agent', guardOutcome: 'passed', fallbackReason: null };
  const fell = { mode: 'offline', guardOutcome: 'offline_template', fallbackReason: 'auth' };
  assert.deepEqual(verdict(live), { pass: true, fallback: false });
  assert.deepEqual(verdict(fell), { pass: false, fallback: true });
  assert.equal(exitCodeFor([live, live]), 0);
  assert.equal(exitCodeFor([live, fell]), 1);
  assert.equal(exitCodeFor([live, { ...live, fallbackReason: 'timeout' }]), 1);
  assert.equal(exitCodeFor([live, fell], { SMOKE_ALLOW_FALLBACK: '1' }), 0);
  assert.equal(exitCodeFor([live, fell], { SMOKE_ALLOW_FALLBACK: 'true' }), 1);
  assert.equal(exitCodeFor([{ ...live, guardOutcome: 'failed' }], { SMOKE_ALLOW_FALLBACK: '1' }), 1);
});
