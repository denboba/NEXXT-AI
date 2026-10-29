'use strict';
const products = require('../products');
const engine = require('../engine');
const bank = require('../bank');
const { spending, capacity } = require('./finance');
const rules = require('../domain/rules');
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const string = (maxLength = 200) => ({ type: 'string', maxLength });
const enumeration = values => ({ type: 'string', enum: values });
const SPECS = [
  ['get_customer_profile', 'Read only this session customer’s synthetic profile.', schema()],
  ['get_spending_summary', 'Summarize synthetic spending and recurring bills.', schema({
    months: { type: 'integer', minimum: 1, maximum: 12 },
  })],
  ['find_savings_capacity', 'Compute essential buffer, obligations, idle cash and safe monthly amount.', schema()],
  ['compare_products', 'Compare product suitability, liquidity, horizon and segment.', schema({
    goal: string(), horizonYears: number(.25, 30), needsLiquidity: { type: 'boolean' },
    riskComfort: enumeration(['low', 'medium', 'high']),
  })],
  ['simulate', 'Produce illustrative numbers and an end-of-horizon stress case.', schema({
    monthly: number(100, 2000), years: { type: 'integer', minimum: 1, maximum: 30 }, productId: string(80),
  }, ['monthly', 'years'])],
  ['what_if', 'Explore a hypothetical change without moving money.', schema({ change: schema({
    bonus: number(0, 100000), rentIncrease: number(0, 20000), horizonYears: number(.25, 30),
    monthly: number(0, 10000), riskComfort: enumeration(['low', 'medium', 'high']),
  }) }, ['change'])],
  ['set_risk_profile', 'Record the customer’s explicit answer to the suitability question.', schema({
    answer: enumeration(['low', 'medium', 'high']),
  }, ['answer'])],
  ['propose_plan', 'Prepare an immutable expiring proposal. Cannot activate a plan or move money.', schema({
    productId: string(80), monthly: { type: 'integer', minimum: 100, maximum: 10000 },
  }, ['productId', 'monthly'])],
  ['request_authentication', 'Offer the existing sign-up or login flow.', schema({ kind: enumeration(['signup', 'login']) }, ['kind'])],
  ['handoff_to_adviser', 'Request an adviser with the conversation attached.', schema({ reason: string(300) }, ['reason'])],
  ['check_rules', 'Look up the bank and regulatory rules that constrain a product or decision. '
    + 'Informational, not legal or tax advice.', schema({
    topic: enumeration(rules.TOPICS), productId: string(80),
  }, ['topic'])],
].map(([name, description, inputSchema]) => ({ name, description, inputSchema }));
// Known bank operations that only the customer can trigger through the app (explicit
// confirmation endpoints). The model can never call them: no plan activation, no money movement.
const NOT_MODEL_CALLABLE = Object.freeze(['activate_plan', 'confirm_plan', 'confirm_proposal', 'move_money',
  'transfer', 'transfer_money', 'execute_debit', 'cancel_plan', 'withdraw']);
// Preconditions checked by src/agent/guard.js before a tool runs.
// risk_answered: the customer's explicit risk answer is recorded (set_risk_profile).
// capacity_computed: find_savings_capacity succeeded earlier in this turn.
const PRECONDITIONS = Object.freeze({ propose_plan: Object.freeze(['risk_answered', 'capacity_computed']) });

function valid(value, spec) {
  if (spec.type === 'object') {
    return value && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).every(key => Object.hasOwn(spec.properties, key) && valid(value[key], spec.properties[key]))
      && spec.required.every(key => Object.hasOwn(value, key));
  }
  if (spec.type === 'string') {
    return typeof value === 'string' && value.length <= (spec.maxLength || 100)
      && !/[\x00-\x1f]/.test(value) && (!spec.enum || spec.enum.includes(value));
  }
  if (spec.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'number' && Number.isFinite(value)
    && (spec.type !== 'integer' || Number.isInteger(value)) && value >= spec.minimum && value <= spec.maximum;
}
function context(store, journey) {
  return require('../data/context').resolve(store, journey);
}
function compare(customer, input, cap) {
  const horizon = input.horizonYears || customer.horizonYears;
  const risk = input.riskComfort || 'low';
  const allowed = new Set(products.allowedFor(risk).map(p => p.id));
  return products.PRODUCTS.map(product => {
    const why = [], whyNot = [], ruleIds = [], ruleCards = [];
    // Each exclusion cites the rule topic and the exact rule card (src/domain/rules.js) that drove it.
    const exclude = (reason, rule, card) => {
      whyNot.push(reason);
      if (!ruleIds.includes(rule)) ruleIds.push(rule);
      if (!ruleCards.includes(card)) ruleCards.push(card);
    };
    if (product.segment !== customer.segment) exclude('Different customer segment.', 'segment', 'segment-match');
    if (horizon < product.minHorizonYears) {
      exclude('Minimum horizon is longer than your goal.', 'appropriateness', 'horizon-fit');
    }
    if (!allowed.has(product.id)) exclude('Above your risk comfort.', 'appropriateness', 'demo-risk-cap');
    if (input.needsLiquidity && product.liquidity === 'locked') {
      exclude('Money is locked for the agreed term.', 'early_withdrawal', 'term-lock');
    }
    if (!cap.bufferReady && product.id !== 'buffer-savings') {
      exclude('Build the emergency buffer before investing.', 'buffer_policy', 'buffer-months');
    }
    if (product.liquidity === 'instant') why.push('Instant access.');
    if (product.id === 'business-deposit-ladder') why.push('Staggered maturities protect payroll and seasonal lows.');
    if (!whyNot.length) why.push('Fits the segment, horizon and risk limits.');
    const preferred = customer.segment === 'business' ? product.id === 'business-deposit-ladder'
      : !cap.bufferReady ? product.id === 'buffer-savings'
        : horizon <= 2 ? product.id === 'term-deposit' || product.id === 'buffer-savings'
          : product.id === 'diversified-fund';
    return { ...product, eligible: !whyNot.length, why, whyNot, ruleIds, ruleCards,
      protection: rules.protectionOf(product.id), score: whyNot.length ? -whyNot.length : preferred ? 10 : 1 };
  }).sort((a, b) => b.score - a.score);
}
function createTools({ store, journey }) {
  const state = () => {
    const ctx = context(store, journey);
    return { ...ctx, cap: capacity(ctx.customer, ctx.account.balance, {
      rentIncrease: journey.memory?.changes?.rentIncrease || 0,
    }) };
  };
  const implementations = {
    get_customer_profile() {
      const { customer, cap } = state();
      const { firstName, ageBand, segment, incomePattern, goal, horizonYears, synthetic, asOf } = customer;
      const pending = Object.values(store.db.proposals).find(proposal => proposal.journeyId === journey.id
        && proposal.userId === (journey.userId || null) && proposal.version === journey.proposalVersion
        && proposal.expires > Date.now()
        && !Object.values(store.db.plans).some(plan => plan.proposalId === proposal.id));
      const active = journey.userId && Object.values(store.db.plans)
        .find(plan => plan.userId === journey.userId && plan.status === 'active');
      const fallbackProduct = segment === 'business' ? 'business-deposit-ladder'
        : !cap.bufferReady ? 'buffer-savings' : 'diversified-fund';
      const planning = {
        monthly: pending?.monthly || active?.monthly || journey.memory?.chosenAmount || cap.safeMonthly || cap.microSaving || 100,
        horizonYears: journey.memory?.horizonYears || horizonYears,
        risk: journey.coach?.profile.risk || null,
        product: products.byId(pending?.productId || active?.productId || fallbackProduct),
        hasPending: Boolean(pending),
        hasActive: Boolean(active),
      };
      return { firstName, ageBand, segment, incomePattern, goal, horizonYears, synthetic, asOf, planning,
        authenticated: Boolean(journey.userId), samplePreview: !journey.userId };
    },
    get_spending_summary({ months = 12 }) {
      const data = spending(state().customer, months);
      return { ...data, ui: { type: 'budget', ...data } };
    },
    find_savings_capacity() {
      const data = state().cap;
      return { ...data, ui: { type: 'capacity', ...data } };
    },
    compare_products(input) {
      const { customer, cap } = state();
      const actualRisk = journey.coach?.profile.risk;
      const risk = actualRisk || input.riskComfort || 'low';
      const data = compare(customer, { ...input, riskComfort: risk }, cap);
      return { products: data, suitabilityAnswered: Boolean(actualRisk), ui: { type: 'compare', products: data } };
    },
    simulate({ monthly, years, productId = 'diversified-fund' }) {
      const product = products.byId(productId);
      if (!product || product.expectedReturn === null) throw new bank.BankError('No illustrative return assumption for that product.');
      const sim = engine.simulate({ monthly, years, fundReturn: product.expectedReturn });
      const stress = engine.simulate({ monthly, years, fundReturn: product.expectedReturn,
        drop: product.risk >= 2 ? .2 : 0, dropAtMonth: years * 12 });
      return { ...sim,
        annualReturnPct: Number((product.expectedReturn * 100).toFixed(2)),
        inflationPct: Number((sim.assumptions.inflation * 100).toFixed(2)),
        stressDropPct: product.risk >= 2 ? 20 : 0, stressFund: stress.fund, illustrative: true,
        ui: { type: 'simulation', sim, stressFund: stress.fund, productId, illustrative: true },
      };
    },
    what_if({ change }) {
      if (!journey.pendingChange || Object.keys(change).length !== Object.keys(journey.pendingChange).length
        || Object.keys(change).some(key => change[key] !== journey.pendingChange[key])) {
        throw new bank.BankError('A what-if change must come from the current customer message.', 409);
      }
      const { customer, account, cap: before } = state();
      const after = capacity(customer, account.balance, { ...(journey.memory?.changes || {}), ...change });
      journey.memory ||= {}; const previousHorizonYears=journey.memory.horizonYears || customer.horizonYears;
      const previousMonthly = journey.memory.chosenAmount || before.safeMonthly || before.microSaving;
      const previousRisk = journey.coach.profile.risk || null;
      journey.memory.horizonYears = change.horizonYears || previousHorizonYears;
      journey.memory.changes={...(journey.memory.changes || {}),...change};
      journey.proposalVersion = (journey.proposalVersion || 0) + 1;
      const data = { before, after, change, previousHorizonYears, previousMonthly, previousRisk,
        monthly: change.monthly ?? previousMonthly, risk: change.riskComfort || previousRisk,
        horizonYears: journey.memory.horizonYears,
        diff: { idleCash: after.idleCash - before.idleCash, safeMonthly: after.safeMonthly - before.safeMonthly },
        hypothetical: true };
      return { ...data, ui: { type: 'what_if', ...data } };
    },
    set_risk_profile({ answer }) {
      // A model assertion is insufficient: the server records a risk answer only
      // when it matches an explicit customer answer established for this turn.
      if (journey.pendingRiskAnswer !== answer) throw new bank.BankError('Ask the customer to answer the risk question explicitly.', 409);
      if (journey.coach.profile.risk === answer) return { risk: answer, unchanged: true };
      journey.coach.profile.risk = answer; journey.memory ||= {}; journey.memory.risk = answer;
      journey.proposalVersion = (journey.proposalVersion || 0) + 1; store.save();
      return { risk: answer, ui: { type: 'risk_set', risk: answer } };
    },
    propose_plan(input) {
      if (journey.turnAllowsProposal === false) throw new bank.BankError('A question does not request a new proposal.', 409);
      const proposal = bank.proposePlan(store, journey, input);
      return { proposal, ui: { type: 'plan_proposal', proposal } };
    },
    request_authentication({ kind }) {
      const ready = Object.values(store.db.proposals).some(proposal => proposal.journeyId === journey.id
        && proposal.preview && proposal.version === journey.proposalVersion);
      if (!journey.userId && journey.sampleCustomerId && !ready) {
        throw new bank.BankError('Analyze the connected sample and prepare a preview before asking for an account.');
      }
      return { required: !journey.userId, ui: { type: 'auth', kind } };
    },
    handoff_to_adviser({ reason }) {
      const id = require('node:crypto').randomUUID();
      store.db.handoffs.push({ id, journeyId: journey.id, phone: 'Demo adviser queue', name: null,
        at: new Date().toISOString(), reason,
        transcript: (journey.messages || []).slice(-40).map(({ role, text }) => ({ role, text })),
      });
      store.save();
      return { requested: true, ui: { type: 'handoff', requested: true } };
    },
    check_rules({ topic, productId }) {
      const product = productId ? products.byId(productId) : null;
      if (productId && !product) throw new bank.BankError('Unknown product for the rules lookup.');
      const language = journey.language === 'ro' ? 'ro' : 'en';
      const matching = rules.byTopic(topic, productId).map(rule => rules.localize(rule, language));
      const summary = product ? { id: product.id, name: product.name, protection: rules.protectionOf(product.id) } : null;
      const disclaimer = rules.DISCLAIMER[language];
      return { topic, rulesVersion: rules.VERSION, rules: matching, product: summary, disclaimer,
        ui: { type: 'rules', topic, product: summary, rules: matching, disclaimer } };
    },
  };
  return { specs: SPECS, execute(name, input = {}) {
    const spec = SPECS.find(item => item.name === name);
    if (!spec || !valid(input, spec.inputSchema)) {
      return { error: 'Invalid tool or input. Customer identifiers and unknown fields are never accepted.' };
    }
    try { return implementations[name](input); }
    catch (error) {
      return { error: error instanceof bank.BankError || error instanceof RangeError
        ? error.message : 'Tool unavailable. Please try again or ask an adviser.' };
    }
  } };
}
module.exports = { createTools, SPECS, NOT_MODEL_CALLABLE, PRECONDITIONS, valid, context, compare };
