'use strict';
// The conversation. Scripted steps carry the customer from ad to first investment; every figure comes from
// the engine or the product catalogue. Free text is matched to intents, then (optionally) sent to the LLM.
const engine = require('./engine');
const products = require('./products');
const analytics = require('./analytics');
const llm = require('./llm');

const DISCLAIMER = 'Simulation only · past returns don’t guarantee future results';
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const WORRY_LABEL = { fear_loss: 'balanced', withdraw: 'withdraw anytime', understand: 'kept simple', other: 'no special worries' };

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
  { id: 'faq_market_drop', label: 'What if the market drops?' },
  { id: 'faq_withdraw', label: 'Can I withdraw anytime?' },
  { id: 'faq_fees', label: 'What fees will I pay?' },
  { id: 'faq_how_fund', label: 'How does a fund work?' },
];
const faqChips = () => chips('faq', [...FAQ_CHIPS, { id: 'human', label: 'Talk to a person' }]);

const AMOUNTS = [100, 300, 500, 1000];
const askAmount = (journey) => say(journey, journey.coach.stage === 'app'
  ? 'Let’s set up your plan. How much could you set aside each month?'
  : 'Hi! I’m your Raiffeisen investment coach. In 2 minutes I’ll show what your cash is doing and what it could do instead. How much could you set aside each month?',
  [chips('amount', AMOUNTS.map((a) => ({ id: `a${a}`, label: `${fmt(a)} lei` })), { slider: { min: 100, max: 2000, step: 50, value: journey.coach.profile.monthly || 500 } })]);

const askWorry = (journey) => say(journey, 'What worries you most about investing?', [chips('worry', [
  { id: 'fear_loss', label: 'Fear of losing my money' },
  { id: 'withdraw', label: 'I want to withdraw anytime' },
  { id: 'understand', label: 'I don’t understand how it works' },
  { id: 'other', label: 'Nothing in particular' },
])]);

const askYears = (journey) => say(journey, 'And for how long could you leave it invested?', [chips('years', [
  { id: 'y3', label: '3 years' }, { id: 'y5', label: '5 years' }, { id: 'y10', label: '10 years' },
])]);

const askRisk = (journey) => say(journey,
  'One quick check so I only show what suits you: if your investment fell 15% in a month, what would you most likely do?',
  [chips('risk', [
    { id: 'r_low', label: 'Sell to stop the losses' },
    { id: 'r_medium', label: 'Wait for it to recover' },
    { id: 'r_high', label: 'Invest more while it’s cheap' },
  ])]);

function simMessage(journey, lead) {
  const p = journey.coach.profile;
  const sim = engine.simulate({ monthly: p.monthly, years: p.years });
  analytics.track(journey._store, journey, 'simulation_viewed');
  return say(journey,
    `${lead} Over ${sim.years} years, ${fmt(sim.monthly)} lei a month could grow to ${fmt(sim.fund)} lei. Kept as cash, the same ${fmt(sim.contributed)} lei would only be worth ${fmt(sim.cashReal)} lei in today’s money. That’s ${fmt(sim.advantage)} lei better off.`,
    [{ type: 'sim', sim, disclaimer: DISCLAIMER }]);
}

function showOpen(journey) {
  say(journey, 'Anything you want to ask? Tap a question, type your own, or move the slider to try another amount.', [faqChips()]);
  say(journey, 'Ready to try it for real? New to Raiffeisen? Open a free account in about 3 minutes. Already a client? Log in and I’ll keep everything we talked about.',
    [{ type: 'cta', options: [{ id: 'new', label: 'Open a free account' }, { id: 'existing', label: 'I’m already a client' }] }]);
}

// ---------- knowledge ----------
function defaults(p) { return { monthly: p.monthly || 500, years: p.years || 5 }; }

const FAQ = {
  market_drop(p) {
    const { monthly, years } = defaults(p);
    const sim = engine.simulate({ monthly, years });
    const bad = engine.stressTest({ monthly, years, drop: 0.2 });
    return `Markets do fall, sometimes sharply. Imagine the worst timing: the fund loses 20% right at the end of your ${years} years. With ${fmt(monthly)} lei a month it would end near ${fmt(bad.fund)} lei in this simulation instead of ${fmt(sim.fund)} lei, while cash would be worth ${fmt(sim.cashReal)} lei. Nothing is guaranteed though: in a long bad stretch you could end with less than the ${fmt(sim.contributed)} lei you paid in. That’s why the money is spread across many markets, and why you should only invest what you won’t need soon.`;
  },
  withdraw() {
    const f = products.byId('diversified-fund');
    return `With the Diversified Fund, yes: you can sell your units any day and the money reaches your account in about ${f.settlementDays} working days (demo value, confirmed when you activate). A term deposit and the voluntary pension are built to stay put, so I’ll point that out before you choose them.`;
  },
  fees() {
    const f = products.byId('diversified-fund');
    return `In this demo the Diversified Fund has no entry fee and about ${f.annualFeePct}% a year in running costs. These are demo values. You’ll see the confirmed fees on the activation screen before you agree to anything.`;
  },
  how_fund() {
    return 'A fund pools money from many people. A professional team spreads it across lots of companies and bonds, so you own a small slice of everything instead of betting on one thing. You can start with as little as 100 lei a month and see your balance in the app at any time.';
  },
  min() { return 'You can start from 100 lei a month, and change or stop the plan whenever you like.'; },
  inflation() {
    const pts = engine.cashShrink(10000, 5);
    return `Prices rise about 5.5% a year in this simulation, so cash buys less every year: 10,000 lei today buys what ${fmt(pts[5].value)} lei would in 5 years.`;
  },
  tax() {
    const p = products.byId('voluntary-pension');
    return `${p.name} is the long-term option and its contributions are tax-deductible. Tax rules depend on your situation, so check the details with an adviser before choosing it.`;
  },
};

const INTENTS = [
  ['human', /\b(human|adviser|advisor|agent|person|someone|call me|talk to|complain)/i],
  ['withdraw', /withdraw|take (it |my money )?out|access|liquid|locked|lock |anytime|redeem|sell my/i],
  ['fees', /\b(fee|fees|cost|costs|commission|charge|charges|price)\b/i],
  ['product:voluntary-pension', /pension/i],
  ['product:term-deposit', /deposit/i],
  ['product:bond-fund', /bond/i],
  ['product:stocks-etfs', /stock|etf|shares/i],
  ['how_fund', /how.*(fund|work|invest)|what.*(fund|etf)|explain|understand|stock market|jargon/i],
  ['market_drop', /drop|crash|fall|lose|loss|down|market|risk|afraid|scared|safe|guarantee|worst/i],
  ['min', /minimum|least|smallest|start with|how little/i],
  ['inflation', /inflation|prices|cash|shrink|worth/i],
  ['tax', /\btax/i],
];

function matchIntent(text) {
  const hit = INTENTS.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
}

function productAnswer(id) {
  const p = products.byId(id);
  return `${p.name}: ${p.blurb} It’s ${p.riskLabel}${p.redeemable ? ' and you can withdraw when you need to' : ' and designed to stay invested for the agreed period'}.`;
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
  if (reply) { say(journey, reply, [faqChips()]); return; }
  say(journey, 'I can help with how a fund works, what happens if the market drops, withdrawing your money, fees and which product could suit you. What would you like to know?', [faqChips()]);
}

function answerIntent(journey, intent, ctx) {
  const p = journey.coach.profile;
  if (intent === 'human') return handoff(journey, ctx);
  if (intent.startsWith('product:')) return say(journey, productAnswer(intent.slice(8)), [faqChips()]);
  say(journey, FAQ[intent](p), [faqChips()]);
}

function handoff(journey, ctx) {
  if (ctx.user) {
    const h = ctx.createHandoff({ phone: ctx.user.phone, name: `${ctx.user.firstName} ${ctx.user.lastName}` });
    return say(journey, `Done. An adviser will call you on ${ctx.user.phone}. They’ll see this whole conversation, so you won’t need to repeat anything. (Request ${h.id.slice(0, 8)})`);
  }
  say(journey, 'Of course. Leave your phone number and a Raiffeisen adviser will call you. They’ll see this conversation, so you won’t need to repeat anything.', [{ type: 'handoff_form' }]);
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
    say(journey, `You’re in, ${user.firstName}! I kept everything: ${fmt(p.monthly)} lei/month, ${WORRY_LABEL[p.worry] || 'your choices'}, ${p.years} years.`);
    c.step = 'ask_risk';
    askRisk(journey);
  } else {
    say(journey, `Welcome, ${user.firstName}! Let’s set up your first investment.`);
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
  say(journey, `I’d start with ${rec.tag.toLowerCase()}: ${fmt(p.monthly)} lei a month into the ${rec.name}, ${rec.riskLabel}${rec.redeemable ? ', withdraw anytime' : ''}. Want to hear about the other options?`, [{
    type: 'products', monthly: p.monthly, recommended: rec.id,
    items: products.PRODUCTS.map((x) => ({
      id: x.id, name: x.name, tag: x.tag, riskLabel: x.riskLabel, blurb: x.blurb, allowed: allowed.includes(x.id),
      reason: allowed.includes(x.id) ? null : `Above the comfort level you chose (${x.riskLabel})`,
    })),
    disclaimer: DISCLAIMER,
  }]);
}

function onActivated(store, journey, plan) {
  const product = products.byId(plan.productId);
  say(journey, `Done ✓ Your ${fmt(plan.monthly)} lei a month into the ${product.name} starts on ${plan.nextDebit}. I’ll check in every month.`, [faqChips()]);
  journey.coach.step = 'active';
  store.save();
}

function onDebit(store, journey, plan, account) {
  const product = products.byId(plan.productId);
  say(journey, `Your ${fmt(plan.monthly)} lei went into the ${product.name}. Invested so far: ${fmt(plan.invested)} lei across ${plan.debits} ${plan.debits === 1 ? 'month' : 'months'}. Next debit: ${plan.nextDebit}. Balance: ${fmt(account.balance)} lei.`);
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
    if (!started) { userSaid(journey, `${fmt(v)} lei a month`); track('chat_started'); } else if (c.step === 'open') userSaid(journey, `${fmt(v)} lei a month`);
    return amountStep(store, journey, v, before);
  } else if (input.type === 'choice') {
    const id = String(input.id || '');
    if (!started) track('chat_started');
    userSaid(journey, labelOf(id));
    if (id.startsWith('faq_')) { const k = id.slice(4); if (FAQ[k]) say(journey, FAQ[k](p), [faqChips()]); }
    else if (id === 'human') handoff(journey, ctx);
    else if (/^a\d+$/.test(id) && ['ask_amount', 'open'].includes(c.step)) return amountStep(store, journey, Number(id.slice(1)), before);
    else if (c.step === 'ask_worry' && ['fear_loss', 'withdraw', 'understand', 'other'].includes(id)) {
      p.worry = id;
      const replies = {
        fear_loss: 'Fair. I’ll keep it balanced: a diversified fund spreads your money across many markets, so one bad company can’t sink it. It can still lose value in a bad year, and I’ll show you what that looks like.',
        withdraw: `Good thing to check. With a fund you can sell any day and the money arrives in about ${products.byId('diversified-fund').settlementDays} working days (demo value). I’ll tell you which products are not like that.`,
        understand: FAQ.how_fund(),
        other: 'Great, then let’s keep it simple.',
      };
      say(journey, replies[id]);
      c.step = 'ask_years';
      askYears(journey);
    } else if (/^y(3|5|10)$/.test(id) && ['ask_years', 'open'].includes(c.step)) {
      p.years = Number(id.slice(1));
      if (c.stage === 'app') { c.step = 'ask_risk'; askRisk(journey); }
      else if (c.step === 'ask_years') { c.step = 'open'; track('questions_answered'); simMessage(journey, 'Here’s your picture.'); showOpen(journey); }
      else simMessage(journey, 'Updated.');
    } else if (c.step === 'ask_risk' && RISK_OF[id]) {
      p.risk = RISK_OF[id];
      recommend(journey, ctx);
    } else if (id === 'show_all' && c.stage === 'app') recommend(journey, ctx);
    else say(journey, 'Let me know how I can help.', [faqChips()]);
  } else if (input.type === 'state') {
    return { messages: [] };
  }
  store.save();
  return { messages: journey.messages.slice(before) };
}

function amountStep(store, journey, v, before) {
  const c = journey.coach, p = c.profile;
  if (!Number.isFinite(v) || v < engine.LIMITS.minMonthly || v > engine.LIMITS.maxMonthly) {
    say(journey, `I can simulate between ${engine.LIMITS.minMonthly} and ${fmt(engine.LIMITS.maxMonthly)} lei a month. What amount works for you?`, [chips('amount', AMOUNTS.map((a) => ({ id: `a${a}`, label: `${fmt(a)} lei` })), { slider: { min: 100, max: 2000, step: 50, value: 500 } })]);
  } else {
    p.monthly = Math.round(v);
    if (c.step === 'open') simMessage(journey, 'Updated.');
    else if (c.stage === 'app') { c.step = p.years ? 'ask_risk' : 'ask_years'; p.years ? askRisk(journey) : askYears(journey); }
    else { c.step = 'ask_worry'; askWorry(journey); }
  }
  store.save();
  return { messages: journey.messages.slice(before) };
}

module.exports = { start, handle, enterApp, onActivated, onDebit, DISCLAIMER };
