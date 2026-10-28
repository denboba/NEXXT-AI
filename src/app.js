'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const engine = require('./engine');
const products = require('./products');
const analytics = require('./analytics');
const bank = require('./bank');
const coach = require('./coach');
const agent = require('./agent/agent');
const { language } = require('./i18n');
const { select } = require('./agent/provider');

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const PAGES = { '/': 'index.html', '/ad': 'ad.html', '/admin': 'admin.html' };
const COOKIE = 'sid';
const MAX_BODY = 20 * 1024;

function createApp({ store, env = process.env, fetchImpl, provider }) {
  const demo = env.DEMO_MODE !== '0';
  bank.seedClients(store);
  require('./data/personas').seed(store);
  const hits = new Map();
  const busy = new Set();

  const limited = (ip, group, max) => {
    const now = Date.now(), key = ip + group;
    const arr = (hits.get(key) || []).filter((t) => now - t < 60000);
    arr.push(now); hits.set(key, arr);
    return arr.length > max;
  };

  // ---------- helpers ----------
  const send = (res, status, body, headers = {}) => {
    const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
    res.writeHead(status, { 'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(isJson ? JSON.stringify(body) : body);
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0, over = false; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (over) return;
      if (size > MAX_BODY) { over = true; chunks.length = 0; reject(Object.assign(new Error('Request too large'), { status: 413 })); } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]));
  const secure = (req) => req.headers['x-forwarded-proto'] === 'https';

  const newJourney = (data) => {
    const j = { id: crypto.randomUUID(), source: data.source || 'direct', campaign: data.campaign || null, userId: null, createdAt: new Date().toISOString() };
    store.db.journeys[j.id] = j;
    analytics.track(store, j, 'ad_click');
    return j;
  };
  const clean = (s) => String(s || '').replace(/[^\w.\- ]/g, '').slice(0, 40) || null;

  const publicUser = (u) => u && { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, kind: u.kind };
  const snapshot = (j) => {
    const user = j.userId ? store.db.users[j.userId] : null;
    return { journeyId: j.id, source: j.source, stage: j.coach ? j.coach.stage : 'web', step: j.coach ? j.coach.step : 'ask_amount',
      profile: j.coach ? j.coach.profile : {}, messages: j.messages || [], user: publicUser(user), language: j.language || 'en', ...(j.lastAgent || {}) };
  };
  const ctxFor = (j) => {
    const user = j.userId ? store.db.users[j.userId] : null;
    return { user, env, fetchImpl, createHandoff: ({ phone, name }) => createHandoff(j, { phone, name }) };
  };
  const createHandoff = (j, { phone, name }) => {
    const h = { id: crypto.randomUUID(), journeyId: j.id, phone, name: name || null, at: new Date().toISOString(),
      transcript: (j.messages || []).slice(-40).map((m) => ({ role: m.role, text: m.text })) };
    store.db.handoffs.push(h); store.save();
    return h;
  };
  const completeAuth = (j, user, kind) => {
    analytics.track(store, j, 'account_ready', { kind });
    coach.start(store, j);
    coach.enterApp(store, j, user);
  };
  const requireUser = (j) => {
    const user = j && j.userId && store.db.users[j.userId];
    if (!user) throw new bank.BankError('Please log in or open an account first.', 401);
    return user;
  };
  const me = (user) => {
    const account = bank.accountOf(store, user.id);
    return {
      user: publicUser(user), account,
      portfolio: bank.portfolio(store, user.id),
      ledger: store.db.ledger.filter((l) => l.userId === user.id).slice(-20).reverse(),
      demoMode: demo,
    };
  };
  const adminOk = (req) => {
    if (env.ADMIN_TOKEN) {
      const a = Buffer.from(String(req.headers['x-admin-token'] || '')), b = Buffer.from(env.ADMIN_TOKEN);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    return env.NODE_ENV !== 'production';
  };

  // ---------- routes ----------
  // handler({ req, body, query, j, ip, params }) -> object | { status, body }
  const routes = [];
  const route = (method, pattern, opts, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), opts, handler });

  route('GET', '/api/config', {}, () => ({ demoMode: demo, llm: Boolean(select({env,fetchImpl})), synthetic: true, limits: engine.LIMITS, assumptions: engine.DEFAULTS }));
  route('GET', '/api/simulate', {}, ({ query }) => engine.simulate({ monthly: Number(query.get('monthly')), years: Number(query.get('years') || 5) }));
  route('GET', '/api/shrink', {}, ({ query }) => ({ amount: 10000, points: engine.cashShrink(10000, Number(query.get('years') || 5)), inflation: engine.DEFAULTS.inflation }));

  route('POST', '/api/journey', {}, ({ body, j, res, req }) => {
    if (!j) {
      j = newJourney({ source: clean(body.source), campaign: clean(body.campaign) });
      j.language = language(body.language || req.headers['accept-language']);
      res.setHeader('set-cookie', `${COOKIE}=${j.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure(req) ? '; Secure' : ''}`);
    }
    coach.start(store, j);
    return snapshot(j);
  });
  route('GET', '/api/journey', { journey: true }, ({ j }) => snapshot(j));
  route('POST', '/api/language', { journey: true }, ({ j, body }) => {
    if (!['en','ro'].includes(body.language)) throw new bank.BankError('Unsupported language.');
    j.language = body.language; store.save(); return snapshot(j);
  });

  route('GET', '/api/personas', {}, () => {
    if (!demo) throw new bank.BankError('Persona switching is available only in demo mode.', 403);
    return { personas: require('./data/personas').DEFINITIONS.map(({ id, firstName, lastName, description }) => ({ id, name: firstName + ' ' + lastName, description })) };
  });
  route('POST', '/api/persona', { journey: true, rate: ['persona', 20] }, ({ j, body }) => {
    if (!demo) throw new bank.BankError('Persona switching is available only in demo mode.', 403);
    const user = store.db.users['persona-' + body.persona];
    if (!user?.personaId) throw new bank.BankError('Unknown demo persona.', 404);
    if (busy.has(j.id)) throw new bank.BankError('Wait for this conversation to finish.', 409);
    j.userId = user.id; j.coach = null; j.messages = []; j.msgSeq = 0; j.memory = {}; j.lastAgent = null;
    coach.start(store, j);
    completeAuth(j, user, 'existing');
    return { ...me(user), ...snapshot(j) };
  });

  route('POST', '/api/chat', { journey: true, rate: ['chat', 60] }, async ({ body, j }) => {
    if ((body.type === 'text' && (store.db.customers[j.userId] || select({env,fetchImpl}))) || (store.db.customers[j.userId] && ['r_low','r_medium','r_high'].includes(body.id))) return agentTurn(j, body.type === 'choice' ? {text:body.id.slice(2)} : body);
    const input = ['choice', 'amount', 'text'].includes(body.type) ? body : { type: 'state' };
    const r = await coach.handle(store, j, input, ctxFor(j));
    return { ...snapshot(j), messages: r.messages, history: j.messages };
  });
  async function agentTurn(j, body) {
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 500) throw new bank.BankError('Enter a message of up to 500 characters.');
    if (limited(j.id, 'agent', 20)) throw new bank.BankError('Too many agent requests. Please wait a minute.', 429);
    if (busy.has(j.id)) throw new bank.BankError('Wait for this conversation to finish.', 409);
    busy.add(j.id);
    try {
      const result = await agent.run({store,journey:j,text:body.text,env,fetchImpl,provider});
      const at = new Date().toISOString();
      j.messages.push({id:++j.msgSeq,role:'user',text:require('./agent/safety').clean(body.text),at});
      const message = {id:++j.msgSeq,role:'coach',text:result.text,widgets:result.cards,at};
      j.messages.push(message);
      const {text,...meta} = result;
      j.lastAgent = meta;
      analytics.track(store,j,'chat_started');
      if (result.cards.some(card=>card.type==='compare')) analytics.track(store,j,'questions_answered');
      store.save();
      return {...snapshot(j),messages:[message],history:j.messages,...meta};
    } finally { busy.delete(j.id); }
  }
  route('POST', '/api/agent', { journey: true, rate: ['agent-ip', 60] }, ({body,j}) => agentTurn(j,body));

  route('POST', '/api/handoff', { journey: true, rate: ['handoff', 5] }, ({ body, j }) => {
    const user = j.userId && store.db.users[j.userId];
    const phone = user ? user.phone : String(body.phone || '').replace(/[\s().-]/g, '');
    if (!/^\+?\d{9,15}$/.test(phone)) throw new bank.BankError('Please enter a valid phone number.');
    const h = createHandoff(j, { phone, name: user ? `${user.firstName} ${user.lastName}` : null });
    coach.start(store, j);
    j.messages.push({ id: ++j.msgSeq, role: 'coach', text: `Thank you. An adviser will call ${phone}. They’ll see this conversation. (Request ${h.id.slice(0, 8)})`, at: new Date().toISOString() });
    store.save();
    return { id: h.id, messages: j.messages.slice(-1) };
  });

  // new customers
  route('POST', '/api/signup/details', { journey: true, rate: ['signup', 20] }, ({ body, j }) => ({ step: bank.startOnboarding(store, j, body).step }));
  route('POST', '/api/signup/id', { journey: true }, ({ body, j }) => ({ step: bank.submitId(store, j, body).step }));
  route('POST', '/api/signup/selfie', { journey: true }, ({ body, j }) => ({ step: bank.submitSelfie(store, j, body).step }));
  route('POST', '/api/signup/otp/request', { journey: true, rate: ['otp', 5] }, ({ j }) => bank.requestOtp(store, j, { demo }));
  route('POST', '/api/signup/otp/verify', { journey: true, rate: ['otpv', 10] }, ({ body, j }) => {
    const { user } = bank.verifyOtp(store, j, body.code);
    completeAuth(j, user, 'new');
    return { ...me(user), ...snapshot(j) };
  });

  // existing clients
  route('POST', '/api/login/request', { journey: true, rate: ['login', 10] }, ({ body, j }) => bank.requestLogin(store, j, body.identifier));
  route('GET', '/api/login/status', { journey: true }, ({ query, j }) => {
    const wasIn = j.userId;
    const s = bank.loginStatus(store, j, query.get('requestId'));
    if (s.status === 'approved' && !wasIn) completeAuth(j, store.db.users[j.userId], 'existing');
    return { status: s.status, ...(s.status === 'approved' ? { ...me(store.db.users[j.userId]), ...snapshot(j) } : {}) };
  });
  // Demo stand-in for tapping "Approve" in the Raiffeisen app on the client's phone.
  route('POST', '/api/login/approve', { journey: true, rate: ['approve', 20] }, ({ body, j }) => {
    if (!demo) throw new bank.BankError('Approval happens in the Raiffeisen app.', 403);
    const req = store.db.loginRequests[body.requestId];
    if (!req || req.journeyId !== j.id) throw new bank.BankError('Login request not found.', 404);
    return { status: bank.approveLogin(store, body.requestId, body.approve !== false).status };
  });
  route('POST', '/api/logout', { journey: true }, ({ j, res }) => {
    j.userId = null; store.save();
    res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  // inside the account
  route('GET', '/api/me', { journey: true }, ({ j }) => ({ ...me(requireUser(j)), ...snapshot(j) }));
  route('POST', '/api/me/topup', { journey: true }, ({ body, j }) => {
    if (!demo) throw new bank.BankError('Top-ups are a demo feature.', 403);
    const user = requireUser(j);
    bank.topUp(store, user.id, body.amount);
    return me(user);
  });
  route('POST', '/api/plans', { journey: true, rate: ['plans', 20] }, ({ body, j }) => {
    requireUser(j);
    if (busy.has(j.id)) throw new bank.BankError('Wait for this conversation to finish.', 409);
    const proposal = bank.proposePlan(store, j, { productId: body.productId, monthly: body.monthly });
    return {proposal,ui:{type:'plan_proposal',proposal}};
  });
  route('POST', '/api/proposals/:id/confirm', { journey: true, rate: ['confirm', 20] }, ({ body, j, params }) => {
    const user = requireUser(j);
    if (busy.has(j.id)) throw new bank.BankError('Wait for this conversation to finish.', 409);
    const plan = bank.confirmProposal(store, j, params.id, body.confirmed);
    analytics.track(store, j, 'plan_activated', { productId: plan.productId });
    const before = j.messages.length;
    coach.onActivated(store, j, plan);
    return { plan, ...me(user), messages: j.messages.slice(before) };
  });
  route('POST', '/api/plans/:id/run-debit', { journey: true, rate: ['debit', 20] }, ({ params, j }) => {
    const user = requireUser(j);
    // Demo stand-in for the scheduled debit on the plan date.
    if (!demo) throw new bank.BankError('Debits run on their scheduled date.', 403);
    const r = bank.runDebit(store, params.id, user.id);
    if (r.first) analytics.track(store, j, 'first_debit_executed', { productId: r.plan.productId });
    const before = j.messages.length;
    coach.onDebit(store, j, r.plan, r.account);
    return { ...me(user), messages: j.messages.slice(before) };
  });
  route('POST', '/api/plans/:id/stop', { journey: true }, ({ params, j }) => {
    const user = requireUser(j);
    const plan = store.db.plans[params.id];
    if (!plan || plan.userId !== user.id) throw new bank.BankError('Plan not found.', 404);
    plan.status = 'stopped'; store.save();
    return me(user);
  });

  // admin
  route('GET', '/api/admin/metrics', { admin: true }, ({ query }) => analytics.funnel(store, { source: query.get('source') || undefined }));
  route('GET', '/api/admin/handoffs', { admin: true }, () => ({ handoffs: store.db.handoffs.slice(-50).reverse() }));

  // ---------- server ----------
  const SECURITY = {
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin',
    'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  };

  const serveStatic = (req, res, pathname) => {
    const file = PAGES[pathname] || pathname.replace(/^\/+/, '');
    const full = path.normalize(path.join(PUBLIC, file));
    if (!full.startsWith(PUBLIC + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return send(res, 404, 'Not found', SECURITY);
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache', ...SECURITY });
    fs.createReadStream(full).pipe(res);
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ip = req.socket.remoteAddress || '';
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') return send(res, 405, 'Method not allowed', SECURITY);
        return serveStatic(req, res, url.pathname);
      }
      if (limited(ip, 'all', 300)) return send(res, 429, { error: 'Too many requests. Please slow down.' });
      let match = null, params = {};
      for (const r of routes) {
        const m = r.re.exec(url.pathname);
        if (m && r.method === req.method) { match = r; params = m.groups || {}; break; }
      }
      if (!match) return send(res, 404, { error: 'Not found' });
      if (match.opts.admin && !adminOk(req)) return send(res, 401, { error: 'Admin token required.' });
      if (match.opts.rate && limited(ip, match.opts.rate[0], match.opts.rate[1])) return send(res, 429, { error: 'Too many attempts. Please wait a minute.' });
      const body = req.method === 'POST' ? await readBody(req) : {};
      const sid = cookies(req)[COOKIE];
      let j = sid && store.db.journeys[sid] || null;
      if (match.opts.journey && !j) return send(res, 401, { error: 'No active conversation. Reload the page.' });
      if (j) coach.start(store, j);
      const out = await match.handler({ req, res, body, query: url.searchParams, j, ip, params });
      send(res, 200, out);
    } catch (e) {
      if (e.status === 413) { res.on('finish', () => req.destroy()); return send(res, 413, { error: e.message }, { connection: 'close' }); }
      if (e instanceof bank.BankError || e instanceof RangeError || e.status) return send(res, e.status || 400, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Something went wrong on our side. Please try again.' });
    }
  });
}

module.exports = { createApp };
