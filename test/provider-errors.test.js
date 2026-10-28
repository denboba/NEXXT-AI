'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { select } = require('../src/agent/provider');
const request = { system: 'Rules', messages: [{ role: 'user', content: 'Help me save' }], tools: [],
  callTimeoutMs: 100, deadline: Date.now() + 60000 };
const secret = 'FAKE_CREDENTIAL_MUST_NOT_BE_LOGGED';
const env = { ANTHROPIC_API_KEY: secret, COMPAT_API_KEY: secret, AWS_BEARER_TOKEN_BEDROCK: secret,
  AWS_REGION: 'eu-west-2', BEDROCK_MODEL_ID: 'eu.anthropic.fixture-v1:0' };
const payload = kind => kind === 'anthropic' ? { content: [{ type: 'text', text: 'Budget ready' }] }
  : kind === 'openai' ? { choices: [{ message: { content: 'Budget ready' } }] }
    : { output: { message: { content: [{ text: 'Budget ready' }] } } };

for (const kind of ['anthropic', 'openai', 'bedrock']) {
  for (const [status, code] of [[429, 'throttled'], [503, 'server_error'], [401, 'auth'],
    [404, 'model_not_found'], [400, 'bad_request']]) {
    test(`${kind} classifies HTTP ${status}, bounds retries and redacts errors`, async () => {
      let calls = 0; const events = [];
      const provider = select({ env: { ...env, LLM_PROVIDER: kind }, fetchImpl: async () => {
        calls++;
        return { ok: false, status, json: async () => ({ error: { message: secret } }) };
      } });
      await assert.rejects(provider.complete({ ...request, onEvent: event => events.push(event) }), error => {
        assert.equal(error.code, code); assert.ok(!error.message.includes(secret)); return true;
      });
      assert.equal(calls, [429, 503].includes(status) ? 2 : 1);
      assert.ok(!JSON.stringify(events).includes(secret));
    });
  }
  test(`${kind} recovers once after a reset, then normalizes the response`, async () => {
    let calls = 0;
    const provider = select({ env: { ...env, LLM_PROVIDER: kind }, fetchImpl: async () => {
      if (++calls === 1) throw Object.assign(new Error(secret), { code: 'ECONNRESET' });
      return { ok: true, status: 200, json: async () => payload(kind) };
    } });
    assert.equal((await provider.complete(request)).text, 'Budget ready'); assert.equal(calls, 2);
  });
  test(`${kind} enforces a per-call timeout even when fetch ignores abort`, async () => {
    const provider = select({ env: { ...env, LLM_PROVIDER: kind }, fetchImpl: () => new Promise(() => {}) });
    await assert.rejects(provider.complete({ ...request, callTimeoutMs: 5 }), error => error.code === 'timeout');
  });
}

test('Bedrock accepts foundation IDs and inference-profile IDs/ARNs and diagnoses display names', async () => {
  for (const model of ['anthropic.fixture-v1:0', 'eu.anthropic.fixture-v1:0',
    'arn:aws:bedrock:eu-west-2::foundation-model/anthropic.fixture-v1:0',
    'arn:aws:bedrock:eu-west-2:123456789012:inference-profile/eu.anthropic.fixture-v1:0']) {
    const provider = select({ env: { ...env, LLM_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: model },
      fetchImpl: async () => ({ ok: true, json: async () => payload('bedrock') }) });
    assert.equal((await provider.complete(request)).text, 'Budget ready');
  }
  const invalid = select({ env: { ...env, LLM_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'Opus 5.5' } });
  await assert.rejects(invalid.complete(request), error => error.code === 'model_not_found'
    && error.hint.includes('inference profile ID/ARN') && !error.message.includes(secret));
});
