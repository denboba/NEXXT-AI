'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { seed } = require('../src/data/personas');
const { createTools, SPECS } = require('../src/tools');
const { RULES, TOPICS, byTopic } = require('../src/domain/rules');
const safety = require('../src/agent/safety');
const { run } = require('../src/agent/agent');
const { create } = require('../src/agent/scripted');
const bank = require('../src/bank');

function setup(persona = 'ioana', language = 'en') {
  const store = new Store(null); seed(store);
  const journey = { id: 'rules-' + persona, userId: 'persona-' + persona, language, coach: { profile: {} },
    memory: {}, messages: [] };
  return { store, journey, tools: createTools({ store, journey }) };
}

test('rules knowledge base is frozen, cited and covers every topic', () => {
  assert.ok(Object.isFrozen(RULES));
  for (const topic of TOPICS) assert.ok(byTopic(topic).length, topic);
  for (const rule of RULES) {
    for (const field of ['id', 'topic', 'title', 'statement', 'exception', 'source', 'asOf', 'verifyWith']) {
      assert.ok(rule[field], rule.id + ' ' + field);
    }
    assert.ok(Object.isFrozen(rule) && Object.isFrozen(rule.constraint), rule.id);
    assert.ok(rule.ro.title && rule.ro.statement && rule.ro.exception, rule.id + ' ro');
  }
  assert.equal(SPECS.length, 11);
  assert.equal(SPECS.at(-1).name, 'check_rules');
});

test('check_rules returns deposit cover for a term deposit and marks a fund as not covered', () => {
  const { tools } = setup();
  const deposit = tools.execute('check_rules', { topic: 'deposit_protection', productId: 'term-deposit' });
  const cover = deposit.rules.find(rule => rule.id === 'fgdb-deposit-cover');
  assert.equal(cover.constraint.coverageEur, 100000);
  assert.match(cover.source, /FGDB/);
  assert.equal(deposit.product.protection, 'deposit_guarantee');
  assert.equal(deposit.ui.type, 'rules');
  const fund = tools.execute('check_rules', { topic: 'deposit_protection', productId: 'diversified-fund' });
  assert.equal(fund.product.protection, 'not_deposit');
  assert.ok(!fund.rules.some(rule => rule.id === 'fgdb-deposit-cover'));
  assert.equal(fund.rules.find(rule => rule.id === 'not-a-deposit').constraint.fgdbCovered, false);
  assert.equal(fund.rules.find(rule => rule.id === 'investor-compensation').constraint.compensationEur, 20000);
  const pension = tools.execute('check_rules', { topic: 'pension_deduction', productId: 'voluntary-pension' });
  assert.equal(pension.rules[0].constraint.deductibleEurPerYear, 400);
  const ro = setup('ioana', 'ro').tools.execute('check_rules', { topic: 'deposit_protection', productId: 'term-deposit' });
  assert.match(ro.rules[0].title, /depozitelor/);
});

test('check_rules rejects unknown topics, unknown products, extra fields and customer identifiers', () => {
  const { tools } = setup();
  assert.ok(tools.execute('check_rules', {}).error);
  assert.ok(tools.execute('check_rules', { topic: 'crypto' }).error);
  assert.ok(tools.execute('check_rules', { topic: 'segment', productId: 'no-such-product' }).error);
  assert.ok(tools.execute('check_rules', { topic: 'segment', extra: true }).error);
  assert.ok(tools.execute('check_rules', { topic: 'segment', customerId: 'persona-andrei' }).error);
});

test('compare_products cites rule topics and protection without changing the top product', () => {
  const ioana = setup(); ioana.journey.coach.profile.risk = 'medium';
  const ranked = ioana.tools.execute('compare_products', { horizonYears: 7, riskComfort: 'medium' }).products;
  assert.equal(ranked[0].id, 'diversified-fund');
  assert.equal(ranked[0].protection, 'not_deposit');
  assert.equal(ranked.find(item => item.id === 'term-deposit').protection, 'deposit_guarantee');
  assert.deepEqual(ranked.find(item => item.id === 'business-deposit-ladder').ruleIds, ['segment']);
  assert.ok(ranked.find(item => item.id === 'stocks-etfs').ruleIds.includes('appropriateness'));
  for (const item of ranked) assert.equal(item.ruleIds.length > 0, item.whyNot.length > 0, item.id);
  const elena = setup('elena').tools.execute('compare_products', { horizonYears: 1, riskComfort: 'low' }).products;
  assert.equal(elena[0].id, 'business-deposit-ladder');
  const liquid = setup('mihai').tools.execute('compare_products', { needsLiquidity: true, riskComfort: 'low' }).products;
  assert.ok(liquid.find(item => item.id === 'term-deposit').ruleIds.includes('early_withdrawal'));
  const andrei = setup('andrei').tools.execute('compare_products', { riskComfort: 'low' }).products;
  assert.ok(andrei.find(item => item.id === 'bond-fund').ruleIds.includes('buffer_policy'));
});

test('deposit-protection questions are answered while return guarantees are still refused', () => {
  for (const text of ['Is my term deposit protected if the bank fails?', 'Ce înseamnă garantarea depozitelor?',
    'Is my deposit guaranteed if the bank fails?', 'What is the FGDB?', 'Ce se întâmplă dacă banca dă faliment?']) {
    assert.equal(safety.refusal(text, { firstName: 'Ioana' }), null, text);
  }
  for (const text of ['Can you guarantee 10% returns?', 'Guarantee me 10% returns', 'Garantează-mi 10%',
    'Is my deposit guaranteed to earn 8%?']) {
    assert.equal(safety.refusal(text, { firstName: 'Ioana' }), 'guarantee', text);
  }
  assert.equal(safety.refusal(safety.withoutProtectionTerms('The deposit guarantee scheme covers deposits.')), null);
});

test('a deposit-protection question uses check_rules, cites a tool figure and preserves the proposal', async () => {
  const { store, journey } = setup();
  await run({ store, journey, text: 'medium', provider: create() });
  const proposal = Object.values(store.db.proposals).at(-1);
  const version = journey.proposalVersion;
  const proposals = Object.keys(store.db.proposals).length;
  const result = await run({ store, journey, text: 'Is my deposit guaranteed if the bank fails?', provider: create() });
  assert.equal(result.mode, 'agent');
  assert.equal(result.guardOutcome, 'passed');
  assert.equal(result.refusalReason, null);
  assert.ok(result.trace.some(item => item.tool === 'check_rules' && !item.error));
  assert.ok(!result.trace.some(item => item.tool === 'propose_plan'));
  assert.deepEqual(result.cards.map(card => card.type), ['rules']);
  assert.match(result.text, /20,000 EUR/);
  assert.match(result.text, /not a bank deposit/);
  assert.equal(journey.proposalVersion, version);
  assert.equal(Object.keys(store.db.proposals).length, proposals);
  assert.equal(Object.keys(store.db.plans).length, 0);
  assert.ok(bank.confirmProposal(store, journey, proposal.id, true));
});

test('deposit, pension and rules questions answer from tool figures in both languages', async () => {
  const andrei = setup('andrei');
  await run({ ...andrei, text: 'low', provider: create() });
  const covered = await run({ ...andrei, text: 'Is my money safe if the bank fails?', provider: create() });
  assert.match(covered.text, /100,000 EUR/);
  const blocked = await run({ ...andrei, text: "Why can't I buy stocks?", provider: create() });
  assert.ok(blocked.trace.some(item => item.tool === 'compare_products'));
  assert.match(blocked.text, /not available/);
  assert.match(blocked.text, /MiFID II/);
  const ro = setup('ioana', 'ro');
  const pension = await run({ ...ro, text: 'Pensia facultativă este deductibilă fiscal?', provider: create() });
  assert.match(pension.text, /400 EUR/);
  assert.equal(pension.guardOutcome, 'passed');
});

test('a live reply naming the deposit guarantee passes the reply guard', async () => {
  const { store, journey } = setup();
  let calls = 0;
  const provider = { name: 'fake-live', complete: async () => (++calls === 1
    ? { toolCalls: [{ id: 'a', name: 'find_savings_capacity', input: {} },
      { id: 'b', name: 'check_rules', input: { topic: 'deposit_protection', productId: 'term-deposit' } }] }
    : { text: 'A term deposit is covered by the deposit guarantee scheme up to the lei equivalent of 100,000 EUR.' }) };
  const result = await run({ store, journey, text: 'Is my term deposit protected if the bank fails?', provider });
  assert.equal(result.mode, 'agent');
  assert.equal(result.guardOutcome, 'passed');
  assert.ok(result.cards.some(card => card.type === 'rules'));
});
