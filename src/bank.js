'use strict';
// Stand-ins for the bank's own systems: customer records, eKYC, SMS signing, accounts, cards, plans, ledger.
// In production each function here is replaced by a call to the real system; the coach never moves money itself.
const crypto = require('crypto');
const products = require('./products');

class BankError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const uid = () => crypto.randomUUID();
const digits = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');
const normPhone = (p) => String(p || '').replace(/[\s().-]/g, '');
const OTP_TTL_MS = 5 * 60 * 1000;
const LOGIN_TTL_MS = 3 * 60 * 1000;

function seedClients(store) {
  const db = store.db;
  if (Object.values(db.users).some((u) => u.seed)) return;
  const id = uid();
  db.users[id] = { id, seed: true, firstName: 'Ioana', lastName: 'Popescu', email: 'ioana.popescu@example.com',
    phone: '+40722000111', kind: 'existing', createdAt: new Date().toISOString() };
  openAccount(store, id, 2500);
}

function openAccount(store, userId, openingBalance = 0) {
  const db = store.db;
  const id = uid();
  const acct = {
    id, userId, iban: `RO00DEMO${digits(16)}`, currency: 'RON', balance: openingBalance,
    card: { type: 'Yellow virtual card', last4: digits(4), wallets: ['Apple Pay', 'Google Pay'] },
  };
  db.accounts[id] = acct;
  if (openingBalance) addLedger(store, acct, 'credit', openingBalance, 'Opening balance');
  return acct;
}

function addLedger(store, acct, kind, amount, label, extra = {}) {
  const entry = { id: uid(), accountId: acct.id, userId: acct.userId, kind, amount, label, at: new Date().toISOString(), ...extra };
  store.db.ledger.push(entry);
  store.save();
  return entry;
}

const accountOf = (store, userId) => Object.values(store.db.accounts).find((a) => a.userId === userId);

// ---------- Onboarding (new customers) ----------
const STEPS = ['details', 'id', 'selfie', 'sign', 'done'];

function startOnboarding(store, journey, d) {
  const first = String(d.firstName || '').trim(), last = String(d.lastName || '').trim();
  const email = String(d.email || '').trim().toLowerCase(), phone = normPhone(d.phone);
  if (!first || !last) throw new BankError('Please enter your first and last name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BankError('Please enter a valid email address.');
  if (!/^\+?\d{9,15}$/.test(phone)) throw new BankError('Please enter a valid phone number, e.g. +40 722 000 000.');
  const taken = Object.values(store.db.users).find((u) => u.phone === phone || u.email === email);
  if (taken) throw new BankError('You already have a Raiffeisen profile. Please use "I\'m already a client" instead.', 409);
  const o = { id: uid(), journeyId: journey.id, step: 'id', details: { firstName: first, lastName: last, email, phone }, otpAttempts: 0 };
  store.db.onboardings[o.id] = o;
  journey.onboardingId = o.id;
  store.save();
  return o;
}

function getOnboarding(store, journey) {
  const o = store.db.onboardings[journey.onboardingId];
  if (!o) throw new BankError('Start by entering your details.', 409);
  return o;
}

function submitId(store, journey, d) {
  const o = getOnboarding(store, journey);
  if (STEPS.indexOf(o.step) < STEPS.indexOf('id')) throw new BankError('Complete the previous step first.', 409);
  const idNumber = String(d.idNumber || '').toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]{2}\d{6}$/.test(idNumber)) throw new BankError('ID card number looks like two letters and six digits, e.g. RX123456.');
  o.idLast4 = idNumber.slice(-4); // the full number and the image are not stored
  if (STEPS.indexOf(o.step) < STEPS.indexOf('selfie')) o.step = 'selfie';
  store.save();
  return o;
}

function submitSelfie(store, journey, d) {
  const o = getOnboarding(store, journey);
  if (STEPS.indexOf(o.step) < STEPS.indexOf('selfie')) throw new BankError('Scan your ID card first.', 409);
  if (!d.captured) throw new BankError('Please take a selfie to continue.');
  if (STEPS.indexOf(o.step) < STEPS.indexOf('sign')) o.step = 'sign';
  store.save();
  return o;
}

function requestOtp(store, journey, { demo }) {
  const o = getOnboarding(store, journey);
  if (o.step !== 'sign') throw new BankError('Complete the previous steps first.', 409);
  o.otp = digits(6);
  o.otpExpires = Date.now() + OTP_TTL_MS;
  o.otpAttempts = 0;
  store.save();
  // Real deployments hand o.otp to the SMS provider. In demo mode we hand it back so the flow can be tried.
  return { sentTo: o.details.phone.replace(/\d(?=\d{3})/g, '•'), demoCode: demo ? o.otp : undefined };
}

function verifyOtp(store, journey, code) {
  const o = getOnboarding(store, journey);
  if (o.step !== 'sign' || !o.otp) throw new BankError('Request a code first.', 409);
  if (Date.now() > o.otpExpires) throw new BankError('That code expired. Request a new one.', 410);
  if (o.otpAttempts >= 5) throw new BankError('Too many attempts. Request a new code.', 429);
  o.otpAttempts++;
  if (String(code).trim() !== o.otp) { store.save(); throw new BankError('That code is not right.'); }
  const user = { id: uid(), ...o.details, kind: 'new', idLast4: o.idLast4, createdAt: new Date().toISOString(), signedAt: new Date().toISOString() };
  store.db.users[user.id] = user;
  const account = openAccount(store, user.id, 0);
  o.step = 'done'; o.otp = null;
  journey.userId = user.id;
  store.save();
  return { user, account };
}

// ---------- Login (existing clients) ----------
function requestLogin(store, journey, identifier) {
  const id = String(identifier || '').trim().toLowerCase();
  const phone = normPhone(id);
  const user = Object.values(store.db.users).find((u) => u.email === id || u.phone === phone);
  if (!user) throw new BankError('We could not find that client. Check the phone number or email.', 404);
  const req = { id: uid(), journeyId: journey.id, userId: user.id, status: 'pending', expires: Date.now() + LOGIN_TTL_MS };
  store.db.loginRequests[req.id] = req;
  store.save();
  return { requestId: req.id, firstName: user.firstName };
}

// The "phone" side: in production this is a push approval inside the Raiffeisen app.
function approveLogin(store, requestId, approve = true) {
  const req = store.db.loginRequests[requestId];
  if (!req) throw new BankError('Login request not found.', 404);
  if (Date.now() > req.expires) req.status = 'expired';
  else if (req.status === 'pending') req.status = approve ? 'approved' : 'denied';
  store.save();
  return req;
}

function loginStatus(store, journey, requestId) {
  const req = store.db.loginRequests[requestId];
  if (!req || req.journeyId !== journey.id) throw new BankError('Login request not found.', 404);
  if (req.status === 'pending' && Date.now() > req.expires) req.status = 'expired';
  if (req.status === 'approved') { journey.userId = req.userId; store.save(); }
  return { status: req.status, user: req.status === 'approved' ? store.db.users[req.userId] : undefined };
}

// ---------- Accounts, plans, debits ----------
function topUp(store, userId, amount) {
  const acct = accountOf(store, userId);
  const n = Number(amount);
  if (!acct) throw new BankError('No account found.', 404);
  if (!Number.isFinite(n) || n <= 0 || n > 50000) throw new BankError('Enter an amount between 1 and 50,000 lei.');
  acct.balance += n;
  addLedger(store, acct, 'credit', n, 'Top-up (demo transfer)');
  return acct;
}

function nextFifth(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 5));
  if (d <= from) d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function validatePlan(store, user, { productId, monthly, risk }) {
  const product = products.byId(productId);
  if (!product) throw new BankError('Unknown product.', 404);
  const amount = Number(monthly);
  if (!Number.isInteger(amount) || amount < product.minMonthly || amount > 10000) {
    throw new BankError(`Choose a whole monthly amount from ${product.minMonthly} to 10,000 lei.`);
  }
  if (!risk) throw new BankError('Answer the short risk question first so we can check this product suits you.', 409);
  if (!products.allowedFor(risk).some((p) => p.id === product.id)) {
    throw new BankError(`${product.name} is ${product.riskLabel}, above the comfort level you chose.`, 403);
  }
  const existing = Object.values(store.db.plans).find((p) => p.userId === user.id && p.productId === productId && p.status === 'active');
  if (existing) throw new BankError('You already have an active plan in this product.', 409);
  const acct = accountOf(store, user.id);
  if (!acct) throw new BankError('No account found.', 404);
  return { product, amount, acct };
}

function proposePlan(store, journey, { productId, monthly }) {
  const user = store.db.users[journey.userId];
  if (!user) throw new BankError('Please log in or open an account first.', 401);
  const risk = journey.coach?.profile.risk;
  const { product, amount, acct } = validatePlan(store, user, { productId, monthly, risk });
  const customer = store.db.customers[user.id];
  if (!customer) throw new BankError('Spending history is required before proposing a plan.', 409);
  if (product.segment !== customer.segment) throw new BankError('This product is for a different customer segment.', 403);
  const cap = require('./tools/finance').capacity(customer, acct.balance);
  const microSaving = product.id === 'buffer-savings' && amount === cap.microSaving;
  if (!cap.bufferReady && !microSaving) throw new BankError('Build your emergency buffer before investing.', 409);
  if (amount > cap.safeMonthly && !microSaving) throw new BankError('That amount exceeds the safe monthly capacity.', 409);
  const horizon = journey.memory?.horizonYears || customer.horizonYears;
  if (horizon < product.minHorizonYears) throw new BankError('This product does not fit your goal horizon.', 409);
  const proposal = Object.freeze({ id: uid(), userId: user.id, journeyId: journey.id, productId, monthly: amount, risk, version: journey.proposalVersion || 0, expires: Date.now() + 10 * 60 * 1000, createdAt: new Date().toISOString() });
  store.db.proposals[proposal.id] = proposal; store.save();
  return proposal;
}

function activatePlan(store, user, { productId, monthly, risk }) {
  const { amount, acct } = validatePlan(store, user, { productId, monthly, risk });
  const plan = { id: uid(), userId: user.id, accountId: acct.id, productId, monthly: amount, status: 'active',
    nextDebit: nextFifth(), invested: 0, debits: 0, createdAt: new Date().toISOString() };
  store.db.plans[plan.id] = plan;
  store.save();
  return plan;
}

function runDebit(store, planId, userId) {
  const plan = store.db.plans[planId];
  if (!plan || plan.userId !== userId) throw new BankError('Plan not found.', 404);
  if (plan.status !== 'active') throw new BankError('This plan is not active.', 409);
  const acct = store.db.accounts[plan.accountId];
  const product = products.byId(plan.productId);
  if (acct.balance < plan.monthly) {
    addLedger(store, acct, 'failed', 0, `Plan debit skipped: balance below ${plan.monthly} lei`, { planId });
    throw new BankError(`Your balance (${acct.balance} lei) is below this month's ${plan.monthly} lei. Add money and try again.`, 402);
  }
  acct.balance -= plan.monthly;
  plan.invested += plan.monthly;
  plan.debits += 1;
  const first = plan.debits === 1;
  const executedFor = plan.nextDebit;
  const d = new Date(plan.nextDebit + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1);
  plan.nextDebit = d.toISOString().slice(0, 10);
  addLedger(store, acct, 'debit', plan.monthly, `Monthly plan: ${product.name}`, { planId, for: executedFor });
  store.save();
  return { plan, account: acct, first };
}

function portfolio(store, userId) {
  const plans = Object.values(store.db.plans).filter((p) => p.userId === userId)
    .map((p) => ({ ...p, product: products.byId(p.productId) }));
  return { plans, invested: plans.reduce((s, p) => s + p.invested, 0) };
}

module.exports = {
  BankError, seedClients, accountOf, startOnboarding, submitId, submitSelfie, requestOtp, verifyOtp,
  requestLogin, approveLogin, loginStatus, topUp, activatePlan, runDebit, portfolio, nextFifth, proposePlan, validatePlan,
};
