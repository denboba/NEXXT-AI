'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { seed } = require('../src/data/personas');
const { createTools } = require('../src/tools');
function setup(persona = 'ioana') {
  const store = new Store(null); seed(store);
  const journey = { id: 'test', userId: 'persona-' + persona, coach: { profile: {} }, memory: {}, messages: [] };
  return { store, journey, tools: createTools({ store, journey }) };
}
test('tools validate every input and reject customer identifiers and unknown tools', () => {
  const { tools } = setup();
  for (const input of [null, [], {userId:'persona-andrei'}, {months:13}, {months:1.5}]) assert.ok(tools.execute('get_spending_summary',input).error);
  assert.ok(tools.execute('not_a_tool').error);
  assert.ok(tools.execute('simulate',{monthly:0,years:5}).error);
  assert.equal(tools.execute('get_customer_profile').firstName,'Ioana');
  assert.equal(JSON.stringify(tools.execute('get_customer_profile')).includes('persona-'),false);
});
test('capacity produces the four responsible persona conclusions', () => {
  const ioana = setup(); const i = ioana.tools.execute('find_savings_capacity');
  assert.equal(i.bufferMonths,3); assert.ok(i.idleCash>0); assert.ok(i.safeMonthly>=100);
  const a = setup('andrei').tools.execute('find_savings_capacity');
  assert.equal(a.bufferReady,false); assert.equal(a.safeMonthly,0); assert.equal(a.microSaving,100); assert.ok(a.readyInMonths>0);
  const m = setup('mihai').tools.execute('find_savings_capacity');
  assert.equal(m.bufferMonths,6); assert.equal(m.obligationTotal,12000); assert.ok(m.safeMonthly<=200);
  const e = setup('elena').tools.execute('find_savings_capacity');
  assert.equal(e.obligationTotal,14000); assert.equal(e.ladder.length,3);
  const ranked = setup('elena').tools.execute('compare_products',{horizonYears:1,riskComfort:'low'});
  assert.equal(ranked.products[0].id,'business-deposit-ladder');
});
test('recurring subscriptions are detectable and spending is scoped to the customer', () => {
  const { tools, store } = setup('andrei');
  const spending = tools.execute('get_spending_summary');
  assert.equal(spending.subscriptions.length,3); assert.equal(spending.monthlyIncome,2300);
  store.db.customers['persona-ioana'].transactions[0].merchant = 'SECRET_OTHER_CUSTOMER';
  assert.equal(JSON.stringify(tools.execute('get_spending_summary')).includes('SECRET_OTHER_CUSTOMER'),false);
  assert.ok(tools.execute('get_customer_profile',{customerId:'persona-ioana'}).error);
});
test('risk cannot be invented by a model, proposals never activate and cannot exceed capacity', () => {
  const { tools, store, journey } = setup();
  assert.ok(tools.execute('set_risk_profile',{answer:'high'}).error);
  journey.pendingRiskAnswer='medium'; assert.equal(tools.execute('set_risk_profile',{answer:'medium'}).risk,'medium');
  assert.ok(tools.execute('propose_plan',{productId:'stocks-etfs',monthly:100}).error);
  assert.ok(tools.execute('propose_plan',{productId:'diversified-fund',monthly:10000}).error);
  const { proposal } = tools.execute('propose_plan',{productId:'diversified-fund',monthly:100});
  assert.ok(proposal); assert.ok(Object.isFrozen(proposal)); assert.equal(Object.keys(store.db.plans).length,0);
  assert.equal(proposal.journeyId,journey.id);
  const andrei = setup('andrei'); andrei.journey.pendingRiskAnswer='low'; andrei.tools.execute('set_risk_profile',{answer:'low'});
  assert.ok(andrei.tools.execute('propose_plan',{productId:'bond-fund',monthly:100}).error);
  assert.ok(andrei.tools.execute('propose_plan',{productId:'buffer-savings',monthly:100}).proposal);
});
test('what-if explains a hypothetical diff and invalidates old proposals without moving cash', () => {
  const { tools, journey, store } = setup(); const before = store.db.accounts['account-persona-ioana'].balance;
  journey.pendingChange={bonus:1000,horizonYears:2};
  const result=tools.execute('what_if',{change:{bonus:1000,horizonYears:2}});
  assert.equal(result.diff.idleCash,1000); assert.equal(result.horizonYears,2); assert.equal(journey.proposalVersion,1);
  assert.equal(store.db.accounts['account-persona-ioana'].balance,before);
  assert.equal(tools.execute('simulate',{monthly:500,years:5}).fund,35771);
  assert.equal(tools.execute('request_authentication',{kind:'login'}).ui.type,'auth');
  assert.equal(tools.execute('handoff_to_adviser',{reason:'Complex situation'}).requested,true);
  assert.equal(store.db.handoffs[0].transcript.length,0);
});
