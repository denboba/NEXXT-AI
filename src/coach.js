'use strict';
// The conversation. Scripted steps carry the customer from ad to first investment; every figure comes from
// the engine or the product catalogue. Free text is matched to intents, then (optionally) sent to the LLM.
const engine = require('./engine');
const products = require('./products');
const analytics = require('./analytics');
const llm = require('./llm');
const {t} = require('./i18n');
const copy = (journey,key,values) => t(journey?.language,key,values);

const DISCLAIMER = t('en',"legacyDisclaimer");
const fmt = (n,journey) => Math.round(n).toLocaleString(journey?.language==='ro'?'ro-RO':'en-US');
const WORRY_LABEL = { fear_loss: 'legacyBalanced', withdraw: "legacyWorryWithdraw", understand: 'legacySimple', other: "legacyWorryOther" };

function say(journey, text, widgets) {
  const m = { id: ++journey.msgSeq, role: 'coach', text, at: new Date().toISOString() };
  if (widgets) m.widgets = widgets;
  journey.messages.push(m);
  return m;
}
function userSaid(journey, text) {
  const m = { id: ++journey.msgSeq, role: 'user', text, at: new Date().toISOString() };
  journey.messages.push(m);
  return m;
}

const chips = (key, options, extra = {}) => ({ type: 'chips', key, options, ...extra });
const FAQ_CHIPS = [
  { id: 'faq_market_drop', label: "legacyFaqDrop" },
  { id: 'faq_withdraw', label: "legacyFaqWithdraw" },
  { id: 'faq_fees', label: "legacyFaqFees" },
  { id: 'faq_how_fund', label: "legacyFaqFund" },
];
const faqChips = (journey) => chips('faq', [...FAQ_CHIPS.map(option=>({...option,label:copy(journey,option.label)})), { id: 'human', label: copy(journey,"legacyHuman") }]);

const AMOUNTS = [100, 300, 500, 1000];
const askAmount = (journey) => say(journey, journey.coach.stage === 'app'
  ? copy(journey,"legacyAskAmountApp")
  : copy(journey,"legacyGreeting"),
  [chips('amount', AMOUNTS.map((a) => ({ id: `a${a}`, label: copy(journey,"legacyAmountLabel",{v0:fmt(a,journey)}) })), { slider: { min: 100, max: 2000, step: 50, value: journey.coach.profile.monthly || 500 } })]);

const askWorry = (journey) => say(journey, copy(journey,"legacyAskWorry"), [chips('worry', [
  { id: 'fear_loss', label: copy(journey,"legacyWorryLoss") },
  { id: 'withdraw', label: copy(journey,"legacyWorryAccess") },
  { id: 'understand', label: copy(journey,"legacyWorryUnderstand") },
  { id: 'other', label: copy(journey,"legacyWorryNone") },
])]);

const askYears = (journey) => say(journey, copy(journey,"legacyAskYears"), [chips('years', [
  { id: 'y3', label: copy(journey,"legacyYears3") }, { id: 'y5', label: copy(journey,"legacyYears5") }, { id: 'y10', label: copy(journey,"legacyYears10") },
])]);

const askRisk = (journey) => say(journey,
  copy(journey,"legacyAskRisk"),
  [chips('risk', [
    { id: 'r_low', label: copy(journey,"legacyRiskLow") },
    { id: 'r_medium', label: copy(journey,"legacyRiskMedium") },
    { id: 'r_high', label: copy(journey,"legacyRiskHigh") },
  ])]);

function simMessage(journey, lead) {
  const p = journey.coach.profile;
  const sim = engine.simulate({ monthly: p.monthly, years: p.years });
  analytics.track(journey._store, journey, 'simulation_viewed');
  return say(journey,
    copy(journey,"legacySimulation",{v0:lead,v1:sim.years,v2:fmt(sim.monthly,journey),v3:fmt(sim.fund,journey),v4:fmt(sim.contributed,journey),v5:fmt(sim.cashReal,journey),v6:fmt(sim.advantage,journey)}),
    [{ type: 'sim', sim, disclaimer: copy(journey,"legacyDisclaimer") }]);
}

function showOpen(journey) {
  say(journey, copy(journey,"legacyAskMore"), [faqChips(journey)]);
  say(journey, copy(journey,"legacyContinue"),
    [{ type: 'cta', options: [{ id: 'new', label: copy(journey,"legacyOpen") }, { id: 'existing', label: copy(journey,"legacyExisting") }] }]);
}

// ---------- knowledge ----------
function defaults(p) { return { monthly: p.monthly || 500, years: p.years || 5 }; }

const FAQ = {
  market_drop(p,journey) {
    const { monthly, years } = defaults(p);
    const sim = engine.simulate({ monthly, years });
    const bad = engine.stressTest({ monthly, years, drop: 0.2 });
    return copy(journey,"legacyMarketDrop",{v0:years,v1:fmt(monthly,journey),v2:fmt(bad.fund,journey),v3:fmt(sim.fund,journey),v4:fmt(sim.cashReal,journey),v5:fmt(sim.contributed,journey)});
  },
  withdraw(profile,journey) {
    const f = products.byId('diversified-fund');
    return copy(journey,"legacyWithdraw",{v0:f.settlementDays});
  },
  fees(profile,journey) {
    const f = products.byId('diversified-fund');
    return copy(journey,"legacyFees",{v0:f.annualFeePct.toLocaleString(journey?.language==='ro'?'ro-RO':'en-US')});
  },
  how_fund(profile,journey) {
    return copy(journey,"legacyHowFund");
  },
  min(profile,journey) { return copy(journey,"legacyMinimum"); },
  inflation(profile,journey) {
    const pts = engine.cashShrink(10000, 5);
    return copy(journey,"legacyInflation",{v0:fmt(pts[5].value,journey)});
  },
  tax(profile,journey) {
    const p = products.byId('voluntary-pension');
    return copy(journey,"legacyTax",{v0:copy(journey,"product_"+p.id)});
  },
};

const INTENTS = [
  ['human', /consilier|persoana|suna-ma|\b(human|adviser|advisor|agent|person|someone|call me|talk to|complain)/i],
  ['withdraw', /retrag|lichid|withdraw|take (it |my money )?out|access|liquid|locked|lock |anytime|redeem|sell my/i],
  ['fees', /comisio|costuri|\b(fee|fees|cost|costs|commission|charge|charges|price)\b/i],
  ['product:voluntary-pension', /pension/i],
  ['product:term-deposit', /deposit/i],
  ['product:bond-fund', /bond/i],
  ['product:stocks-etfs', /stock|etf|shares/i],
  ['how_fund', /cum.*(fond|invest)|explica|inteleg|how.*(fund|work|invest)|what.*(fund|etf)|explain|understand|stock market|jargon/i],
  ['market_drop', /scade|pierder|risc|teama|drop|crash|fall|lose|loss|down|market|risk|afraid|scared|safe|guarantee|worst/i],
  ['min', /minimum|least|smallest|start with|how little/i],
  ['inflation', /inflatie|numerar|preturi|inflation|prices|cash|shrink|worth/i],
  ['tax', /\btax/i],
];

function matchIntent(text) {
  const hit = INTENTS.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
}

function productAnswer(id,journey) {
  const p = products.byId(id);
  return copy(journey,"legacyProduct",{v0:copy(journey,"product_"+p.id),v1:copy(journey,"blurb_"+p.id),v2:copy(journey,"riskLabel_"+p.risk),v3:p.redeemable ? copy(journey,"legacyRedeemable") : copy(journey,"legacyLocked")});
}

function facts(journey) {
  const p = journey.coach.profile;
  const lines = ['Simulation assumptions: inflation 5.5% a year, diversified fund illustration 7.2% a year. Minimum 100 lei a month.'];
  if (p.monthly && p.years) {
    const s = engine.simulate({ monthly: p.monthly, years: p.years });
    lines.push(`Customer plan: ${s.monthly} lei a month for ${s.years} years. Paid in ${s.contributed} lei. As cash worth ${s.cashReal} lei in today’s money. In the fund ${s.fund} lei (simulation). Difference ${s.advantage} lei.`);
  }
  for (const pr of products.PRODUCTS) lines.push(`${pr.name}: ${pr.riskLabel}. ${pr.blurb} Minimum ${pr.minMonthly} lei a month.`);
  return lines.join('\n');
}

async function answerFree(journey, text, ctx) {
  const intent = matchIntent(text);
  if (intent) return answerIntent(journey, intent, ctx);
  const reply = await llm.ask({ text, facts: facts(journey), fetchImpl: ctx.fetchImpl, env: ctx.env });
  if (reply) { say(journey, reply, [faqChips(journey)]); return; }
  say(journey, copy(journey,"legacyHelp"), [faqChips(journey)]);
}

function answerIntent(journey, intent, ctx) {
  const p = journey.coach.profile;
  if (intent === 'human') return handoff(journey, ctx);
  if (intent.startsWith('product:')) return say(journey, productAnswer(intent.slice(8),journey), [faqChips(journey)]);
  say(journey, FAQ[intent](p,journey), [faqChips(journey)]);
}

function handoff(journey, ctx) {
  if (ctx.user) {
    const h = ctx.createHandoff({ phone: ctx.user.phone, name: `${ctx.user.firstName} ${ctx.user.lastName}` });
    return say(journey, copy(journey,"legacyHandoffDone",{v0:ctx.user.phone,v1:h.id.slice(0, 8)}));
  }
  say(journey, copy(journey,"legacyHandoffAsk"), [{ type: 'handoff_form' }]);
}

// ---------- lifecycle ----------
function ensureCoach(store, journey) {
  Object.defineProperty(journey, '_store', { value: store, enumerable: false, configurable: true, writable: true });
  if (!journey.coach) {
    journey.coach = { stage: 'web', step: 'ask_amount', profile: {} };
    journey.messages = [];
    journey.msgSeq = 0;
  }
}

function start(store, journey) {
  ensureCoach(store, journey);
  if (journey.messages.length === 0) askAmount(journey);
  store.save();
}

function enterApp(store, journey, user) {
  ensureCoach(store, journey);
  const c = journey.coach;
  if (c.stage === 'app') return;
  c.stage = 'app';
  const p = c.profile;
  if (p.monthly && p.years) {
    say(journey, copy(journey,"legacyCarryOver",{v0:user.firstName,v1:fmt(p.monthly,journey),v2:copy(journey,WORRY_LABEL[p.worry] || 'legacyChoices'),v3:p.years}));
    c.step = 'ask_risk';
    askRisk(journey);
  } else {
    say(journey, copy(journey,"legacyWelcome",{v0:user.firstName}));
    c.step = p.monthly ? 'ask_years' : 'ask_amount';
    p.monthly ? askYears(journey) : askAmount(journey);
  }
  store.save();
}

function recommend(journey, ctx) {
  const c = journey.coach, p = c.profile;
  const rec = products.recommend(p);
  const allowed = products.allowedFor(p.risk).map((x) => x.id);
  c.step = 'recommend';
  say(journey, copy(journey,"legacyRecommend",{v0:copy(journey,"tag_"+rec.id).toLowerCase(),v1:fmt(p.monthly,journey),v2:copy(journey,"product_"+rec.id),v3:copy(journey,"riskLabel_"+rec.risk),v4:rec.redeemable ? copy(journey,"legacyAccessSuffix") : ''}), [{
    type: 'products', monthly: p.monthly, recommended: rec.id,
    items: products.PRODUCTS.map((x) => ({
      id: x.id, name: copy(journey,"product_"+x.id), tag: copy(journey,"tag_"+x.id), riskLabel: copy(journey,"riskLabel_"+x.risk), blurb: copy(journey,"blurb_"+x.id), allowed: allowed.includes(x.id),
      reason: allowed.includes(x.id) ? null : copy(journey,"legacyAboveRisk",{v0:copy(journey,"riskLabel_"+x.risk)}),
    })),
    disclaimer: copy(journey,"legacyDisclaimer"),
  }]);
}

function onActivated(store, journey, plan) {
  const product = products.byId(plan.productId);
  say(journey, copy(journey,"legacyActivated",{v0:fmt(plan.monthly,journey),v1:copy(journey,"product_"+product.id),v2:plan.nextDebit}), [faqChips(journey)]);
  journey.coach.step = 'active';
  store.save();
}

function onDebit(store, journey, plan, account) {
  const product = products.byId(plan.productId);
  say(journey, copy(journey,"legacyDebited",{v0:fmt(plan.monthly,journey),v1:copy(journey,"product_"+product.id),v2:fmt(plan.invested,journey),v3:plan.debits,v4:copy(journey,plan.debits === 1 ? 'legacyMonth' : 'legacyMonths'),v5:plan.nextDebit,v6:fmt(account.balance,journey)}));
  store.save();
}

const RISK_OF = { r_low: 'low', r_medium: 'medium', r_high: 'high' };

// input: {type:'choice', id} | {type:'amount', value} | {type:'text', text} | {type:'state'}
async function handle(store, journey, input, ctx = {}) {
  ensureCoach(store, journey);
  const c = journey.coach, p = c.profile;
  const before = journey.messages.length;
  const track = (t) => analytics.track(store, journey, t);
  const started = journey.messages.some((m) => m.role === 'user');

  const labelOf = (id) => {
    for (const m of [...journey.messages].reverse()) {
      for (const w of m.widgets || []) {
        const o = (w.options || []).find((x) => x.id === id);
        if (o) return o.label;
      }
    }
    return id;
  };

  if (input.type === 'text') {
    const text = String(input.text || '').trim().slice(0, 500);
    if (!text) return { messages: [] };
    userSaid(journey, text);
    if (!started) track('chat_started');
    const num = Number(String(text).replace(/[^\d]/g, ''));
    if (c.step === 'ask_amount' && num) return amountStep(store, journey, num, before);
    await answerFree(journey, text, ctx);
  } else if (input.type === 'amount') {
    const v = Number(input.value);
    if (!['ask_amount', 'open'].includes(c.step)) return { messages: [] };
    if (!started) { userSaid(journey, copy(journey,"legacyAmountMessage",{v0:fmt(v,journey)})); track('chat_started'); } else if (c.step === 'open') userSaid(journey, copy(journey,"legacyAmountMessage",{v0:fmt(v,journey)}));
    return amountStep(store, journey, v, before);
  } else if (input.type === 'choice') {
    const id = String(input.id || '');
    if (!started) track('chat_started');
    userSaid(journey, labelOf(id));
    if (id.startsWith('faq_')) { const k = id.slice(4); if (FAQ[k]) say(journey, FAQ[k](p,journey), [faqChips(journey)]); }
    else if (id === 'human') handoff(journey, ctx);
    else if (/^a\d+$/.test(id) && ['ask_amount', 'open'].includes(c.step)) return amountStep(store, journey, Number(id.slice(1)), before);
    else if (c.step === 'ask_worry' && ['fear_loss', 'withdraw', 'understand', 'other'].includes(id)) {
      p.worry = id;
      const replies = {
        fear_loss: copy(journey,"legacyLossReply"),
        withdraw: copy(journey,"legacyAccessReply",{v0:products.byId('diversified-fund').settlementDays}),
        understand: FAQ.how_fund(p,journey),
        other: copy(journey,"legacySimple"),
      };
      say(journey, replies[id]);
      c.step = 'ask_years';
      askYears(journey);
    } else if (/^y(3|5|10)$/.test(id) && ['ask_years', 'open'].includes(c.step)) {
      p.years = Number(id.slice(1));
      if (c.stage === 'app') { c.step = 'ask_risk'; askRisk(journey); }
      else if (c.step === 'ask_years') { c.step = 'open'; track('questions_answered'); simMessage(journey, copy(journey,"legacyPicture")); showOpen(journey); }
      else simMessage(journey, copy(journey,"legacyUpdated"));
    } else if (c.step === 'ask_risk' && RISK_OF[id]) {
      p.risk = RISK_OF[id];
      recommend(journey, ctx);
    } else if (id === 'show_all' && c.stage === 'app') recommend(journey, ctx);
    else say(journey, copy(journey,"legacyHowHelp"), [faqChips(journey)]);
  } else if (input.type === 'state') {
    return { messages: [] };
  }
  store.save();
  return { messages: journey.messages.slice(before) };
}

function amountStep(store, journey, v, before) {
  const c = journey.coach, p = c.profile;
  if (!Number.isFinite(v) || v < engine.LIMITS.minMonthly || v > engine.LIMITS.maxMonthly) {
    say(journey, copy(journey,"legacyAmountLimits",{v0:engine.LIMITS.minMonthly,v1:fmt(engine.LIMITS.maxMonthly,journey)}), [chips('amount', AMOUNTS.map((a) => ({ id: `a${a}`, label: copy(journey,"legacyAmountLabel",{v0:fmt(a,journey)}) })), { slider: { min: 100, max: 2000, step: 50, value: 500 } })]);
  } else {
    p.monthly = Math.round(v);
    if (c.step === 'open') simMessage(journey, copy(journey,"legacyUpdated"));
    else if (c.stage === 'app') { c.step = p.years ? 'ask_risk' : 'ask_years'; p.years ? askRisk(journey) : askYears(journey); }
    else { c.step = 'ask_worry'; askWorry(journey); }
  }
  store.save();
  return { messages: journey.messages.slice(before) };
}

module.exports = { start, handle, enterApp, onActivated, onDebit, DISCLAIMER };
