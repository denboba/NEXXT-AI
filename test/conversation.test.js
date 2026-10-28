'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { seed } = require('../src/data/personas');
const { run } = require('../src/agent/agent');
const bank = require('../src/bank');

const questions = {
  en: ['what if the market drops?', 'can I withdraw anytime?', 'what fees will I pay?',
    'how does a fund work?', 'hello', 'should I buy bitcoin?', 'why this product?', 'what do you know about me?'],
  ro: ['ce fac dacă scade piața?', 'pot retrage oricând?', 'ce comisioane plătesc?',
    'cum funcționează un fond?', 'salut', 'ar trebui să cumpăr bitcoin?', 'de ce acest produs?', 'ce știi despre mine?'],
};

for (const persona of ['ioana', 'andrei', 'mihai', 'elena']) for (const language of ['en', 'ro']) {
  test(`questions stay personal and preserve the proposal: ${persona}/${language}`, async () => {
    const store = new Store(null); seed(store);
    const journey = { id: 'questions', userId: 'persona-' + persona, language,
      coach: { profile: {} }, memory: {}, messages: [] };
    async function turn(text) {
      const result = await run({ store, journey, text, provider: null });
      journey.messages.push({ role: 'user', text }, { role: 'coach', text: result.text });
      return result;
    }
    await turn('medium');
    const proposal = Object.values(store.db.proposals)[0];
    const version = journey.proposalVersion;
    const answers = [];
    for (const question of questions[language]) {
      const result = await turn(question);
      assert.equal(result.refusalReason, null, question);
      assert.equal(journey.proposalVersion, version, question);
      assert.ok(!result.trace.some(item => item.tool === 'propose_plan'), question);
      assert.ok(result.cards.length <= 1, question);
      answers.push(result.text);
    }
    assert.equal(new Set(answers).size, questions[language].length);
    assert.ok(bank.confirmProposal(store, journey, proposal.id, true));
  });
}

test('three questions and a repeated question preserve consent; changing amount invalidates it with a diff', async () => {
  const store = new Store(null); seed(store);
  const journey = { id: 'diff', userId: 'persona-ioana', coach: { profile: {} }, memory: {}, messages: [] };
  await run({ store, journey, text: 'medium', provider: null });
  const proposal = Object.values(store.db.proposals)[0];
  let previous = '';
  for (const text of ['fees?', 'fees?', 'can I withdraw?', 'what if the market drops?']) {
    const result = await run({ store, journey, text, provider: null });
    assert.notEqual(result.text, previous);
    previous = result.text;
    journey.messages.push({ role: 'coach', text: result.text });
  }
  assert.equal(journey.proposalVersion, proposal.version);
  const changed = await run({ store, journey, text: 'save 300 lei monthly', provider: null });
  assert.match(changed.text, /500.*300/);
  assert.ok(changed.cards.some(card => card.type === 'what_if'));
  assert.throws(() => bank.confirmProposal(store, journey, proposal.id, true), /changed/);
});
