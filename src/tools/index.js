'use strict';
const products = require('../products');
const engine = require('../engine');
const bank = require('../bank');
const { spending, capacity } = require('./finance');
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const string = (maxLength = 200) => ({ type: 'string', maxLength });
const enumeration = values => ({ type: 'string', enum: values });
const SPECS = [
  ['get_customer_profile', 'Read only this session customer’s synthetic profile.', schema()],
  ['get_spending_summary', 'Summarize synthetic spending and recurring bills.', schema({ months: { type: 'integer', minimum: 1, maximum: 12 } })],
  ['find_savings_capacity', 'Compute essential buffer, obligations, idle cash and safe monthly amount.', schema()],
  ['compare_products', 'Compare product suitability, liquidity, horizon and segment.', schema({ goal: string(), horizonYears: number(.25, 30), needsLiquidity: { type: 'boolean' }, riskComfort: enumeration(['low', 'medium', 'high']) })],
  ['simulate', 'Produce illustrative numbers and an end-of-horizon stress case.', schema({ monthly: number(100, 2000), years: { type: 'integer', minimum: 1, maximum: 30 }, productId: string(80) }, ['monthly', 'years'])],
  ['what_if', 'Explore a hypothetical bonus, rent increase or shorter horizon without changing bank balances.', schema({ change: schema({ bonus: number(0, 100000), rentIncrease: number(0, 20000), horizonYears: number(.25, 30) }) }, ['change'])],
  ['set_risk_profile', 'Record the customer’s explicit answer to the suitability question.', schema({ answer: enumeration(['low', 'medium', 'high']) }, ['answer'])],
  ['propose_plan', 'Prepare an immutable expiring proposal. Cannot activate a plan or move money.', schema({ productId: string(80), monthly: { type: 'integer', minimum: 100, maximum: 10000 } }, ['productId', 'monthly'])],
  ['request_authentication', 'Offer the existing sign-up or login flow.', schema({ kind: enumeration(['signup', 'login']) }, ['kind'])],
  ['handoff_to_adviser', 'Request an adviser with the conversation attached.', schema({ reason: string(300) }, ['reason'])],
].map(([name, description, inputSchema]) => ({ name, description, inputSchema }));

function valid(value, spec) {
  if (spec.type === 'object') return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => Object.hasOwn(spec.properties, key) && valid(value[key], spec.properties[key])) && spec.required.every(key => Object.hasOwn(value, key));
  if (spec.type === 'string') return typeof value === 'string' && value.length <= (spec.maxLength || 100) && !/[\x00-\x1f]/.test(value) && (!spec.enum || spec.enum.includes(value));
  if (spec.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'number' && Number.isFinite(value) && (spec.type !== 'integer' || Number.isInteger(value)) && value >= spec.minimum && value <= spec.maximum;
}
function context(store, journey) {
  const customer = journey.userId && store.db.customers[journey.userId];
  const account = journey.userId && bank.accountOf(store, journey.userId);
  if (!customer || !account) throw new bank.BankError('Synthetic spending history is unavailable. Select a demo persona or speak to an adviser.', 409);
  return { customer, account };
}
function compare(customer, input, cap) {
  const horizon = input.horizonYears || customer.horizonYears;
  const risk = input.riskComfort || 'low';
  const allowed = new Set(products.allowedFor(risk).map(p => p.id));
  return products.PRODUCTS.map(product => {
    const why = [], whyNot = [];
    if (product.segment !== customer.segment) whyNot.push('Different customer segment.');
    if (horizon < product.minHorizonYears) whyNot.push('Minimum horizon is longer than your goal.');
    if (!allowed.has(product.id)) whyNot.push('Above your risk comfort.');
    if (input.needsLiquidity && product.liquidity === 'locked') whyNot.push('Money is locked for the agreed term.');
    if (!cap.bufferReady && product.id !== 'buffer-savings') whyNot.push('Build the emergency buffer before investing.');
    if (product.liquidity === 'instant') why.push('Instant access.');
    if (product.id === 'business-deposit-ladder') why.push('Staggered maturities protect payroll and seasonal lows.');
    if (!whyNot.length) why.push('Fits the segment, horizon and risk limits.');
    const preferred = customer.segment === 'business' ? product.id === 'business-deposit-ladder' : !cap.bufferReady ? product.id === 'buffer-savings' : horizon <= 2 ? product.id === 'term-deposit' || product.id === 'buffer-savings' : product.id === 'diversified-fund';
    return { ...product, eligible: !whyNot.length, why, whyNot, score: whyNot.length ? -whyNot.length : preferred ? 10 : 1 };
  }).sort((a, b) => b.score - a.score);
}
function createTools({ store, journey }) {
  const state = () => { const ctx = context(store, journey); return { ...ctx, cap: capacity(ctx.customer, ctx.account.balance, {rentIncrease:journey.memory?.changes?.rentIncrease || 0}) }; };
  const implementations = {
    get_customer_profile() { const { customer } = state(); const { firstName, ageBand, segment, incomePattern, goal, horizonYears, synthetic, asOf } = customer; return { firstName, ageBand, segment, incomePattern, goal, horizonYears, synthetic, asOf }; },
    get_spending_summary({ months = 12 }) { const data = spending(state().customer, months); return { ...data, ui: { type: 'budget', ...data } }; },
    find_savings_capacity() { const data = state().cap; return { ...data, ui: { type: 'capacity', ...data } }; },
    compare_products(input) { const { customer, cap } = state(); const actualRisk=journey.coach?.profile.risk; const risk=actualRisk || input.riskComfort || 'low'; const data = compare(customer, {...input,riskComfort:risk}, cap); return { products: data, suitabilityAnswered:Boolean(actualRisk), ui: { type: 'compare', products: data } }; },
    simulate({ monthly, years, productId = 'diversified-fund' }) {
      const product = products.byId(productId);
      if (!product || product.expectedReturn === null) throw new bank.BankError('No illustrative return assumption for that product.');
      const sim = engine.simulate({ monthly, years, fundReturn: product.expectedReturn });
      const stress = engine.simulate({ monthly, years, fundReturn: product.expectedReturn, drop: product.risk >= 2 ? .2 : 0, dropAtMonth: years * 12 });
      return { ...sim, annualReturnPct: Number((product.expectedReturn*100).toFixed(2)), inflationPct:Number((sim.assumptions.inflation*100).toFixed(2)), stressFund: stress.fund, illustrative: true, ui: { type: 'simulation', sim, stressFund: stress.fund, productId, illustrative: true } };
    },
    what_if({ change }) {
      if (!journey.pendingChange || Object.keys(change).length!==Object.keys(journey.pendingChange).length || Object.keys(change).some(key=>change[key]!==journey.pendingChange[key])) throw new bank.BankError('A what-if change must come from the current customer message.', 409);
      const { customer, account, cap: before } = state(); const after = capacity(customer, account.balance, {...(journey.memory?.changes || {}),...change});
      journey.memory ||= {}; const previousHorizonYears=journey.memory.horizonYears || customer.horizonYears;
      journey.memory.horizonYears = change.horizonYears || previousHorizonYears;
      journey.memory.changes={...(journey.memory.changes || {}),...change};
      journey.proposalVersion = (journey.proposalVersion || 0) + 1;
      const data = { before, after, change, previousHorizonYears, horizonYears: journey.memory.horizonYears, diff: { idleCash: after.idleCash - before.idleCash, safeMonthly: after.safeMonthly - before.safeMonthly }, hypothetical: true };
      return { ...data, ui: { type: 'what_if', ...data } };
    },
    set_risk_profile({ answer }) {
      // A model assertion is insufficient: the server records a risk answer only
      // when it matches an explicit customer answer established for this turn.
      if (journey.pendingRiskAnswer !== answer) throw new bank.BankError('Ask the customer to answer the risk question explicitly.', 409);
      journey.coach.profile.risk = answer; journey.memory ||= {}; journey.memory.risk = answer;
      journey.proposalVersion = (journey.proposalVersion || 0) + 1; store.save();
      return { risk: answer, ui: { type: 'risk_set', risk: answer } };
    },
    propose_plan(input) { const proposal = bank.proposePlan(store, journey, input); return { proposal, ui: { type: 'plan_proposal', proposal } }; },
    request_authentication({ kind }) { return { required: !journey.userId, ui: { type: 'auth', kind } }; },
    handoff_to_adviser({ reason }) {
      const id = require('node:crypto').randomUUID();
      store.db.handoffs.push({ id, journeyId: journey.id, phone: 'Demo adviser queue', name: null, at: new Date().toISOString(), reason, transcript: (journey.messages || []).slice(-40).map(({ role, text }) => ({ role, text })) }); store.save();
      return { requested: true, ui: { type: 'handoff', requested: true } };
    },
  };
  return { specs: SPECS, execute(name, input = {}) {
    const spec = SPECS.find(item => item.name === name);
    if (!spec || !valid(input, spec.inputSchema)) return { error: 'Invalid tool or input. Customer identifiers and unknown fields are never accepted.' };
    try { return implementations[name](input); } catch (error) { return { error: error instanceof bank.BankError || error instanceof RangeError ? error.message : 'Tool unavailable. Please try again or ask an adviser.' }; }
  } };
}
module.exports = { createTools, SPECS, valid, context, compare };
