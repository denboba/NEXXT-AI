'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../src/llm');

const facts = 'Customer plan: 500 lei a month for 5 years. Fund 35771 lei.';
const fake = (text, ok = true) => async () => ({ ok, json: async () => ({ content: [{ type: 'text', text }] }) });

test('returns null without an API key', async () => {
  assert.equal(await llm.ask({ text: 'hi', facts, env: {} }), null);
});
test('accepts replies whose numbers come from the facts', async () => {
  const r = await llm.ask({ text: 'hi', facts, env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: fake('Over 5 years it could reach 35,771 lei in the simulation.') });
  assert.match(r, /35,771/);
});
test('discards replies with invented figures', async () => {
  const r = await llm.ask({ text: 'hi', facts, env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: fake('You will earn 12% a year guaranteed.') });
  assert.equal(r, null);
});
test('returns null on API errors and network failures', async () => {
  assert.equal(await llm.ask({ text: 'hi', facts, env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: fake('x', false) }), null);
  assert.equal(await llm.ask({ text: 'hi', facts, env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async () => { throw new Error('down'); } }), null);
});
