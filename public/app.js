'use strict';
// Single-page client. All numbers shown come from the server (engine / bank); this file only renders them.

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const app = document.getElementById('app');
const nav = document.getElementById('nav');

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const svg = (tag, attrs, ...kids) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  kids.flat().forEach((k) => k && el.append(k));
  return el;
};

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status });
  return data;
}

const S = {
  snap: null,      // journey snapshot: messages, profile, user, stage
  me: null,        // account data when logged in
  view: 'chat',    // chat | signup | login
  signup: { step: 'details', data: {}, demoCode: null, sentTo: null, idPreview: null, selfiePreview: null },
  login: { requestId: null, status: null, timer: null },
  pending: false,
  panelSim: null,
  years: 5,
  error: null,
};

// ---------- boot ----------
async function boot() {
  const q = new URLSearchParams(location.search);
  try {
    S.snap = await api('POST', '/api/journey', { source: q.get('src'), campaign: q.get('cmp') });
    if (q.has('src')) history.replaceState(null, '', '/');
    if (S.snap.user) await loadMe();
    S.years = S.snap.profile.years || 5;
    await refreshPanel();
  } catch (e) {
    app.replaceChildren(h('p', { class: 'err' }, e.message));
    return;
  }
  render();
}

async function loadMe() {
  const d = await api('GET', '/api/me');
  S.me = d;
  S.snap = { ...S.snap, ...pick(d, ['messages', 'profile', 'stage', 'step', 'user']) };
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

async function refreshPanel() {
  const p = S.snap.profile;
  if (p.monthly) {
    try { S.panelSim = await api('GET', `/api/simulate?monthly=${p.monthly}&years=${p.years || S.years}`); } catch { S.panelSim = null; }
  } else S.panelSim = null;
}

// ---------- chat ----------
async function send(input) {
  if (S.pending) return;
  S.pending = true; S.error = null; render();
  try {
    const r = await api('POST', '/api/chat', input);
    S.snap = { ...S.snap, ...pick(r, ['profile', 'stage', 'step', 'user']), messages: r.history };
    if (S.snap.profile.years) S.years = S.snap.profile.years;
    await refreshPanel();
  } catch (e) { S.error = e.message; }
  S.pending = false; render();
}

function lastCoachWithWidgetIndex() {
  const ms = S.snap.messages;
  for (let i = ms.length - 1; i >= 0; i--) if (ms[i].role === 'coach' && ms[i].widgets && ms[i].widgets.some((w) => w.type === 'chips' || w.type === 'products')) return i;
  return -1;
}

function chatCard() {
  const ms = S.snap.messages;
  const activeIdx = lastCoachWithWidgetIndex();
  const lastIdx = ms.length - 1;
  const list = h('div', { class: 'msgs', id: 'msgs' });
  ms.forEach((m, i) => {
    const bubble = h('div', { class: `msg ${m.role}` }, m.text);
    (m.widgets || []).forEach((w) => bubble.append(renderWidget(w, { active: i === activeIdx || (w.type !== 'chips' && i === lastIdx) || w.type === 'cta' || w.type === 'sim', i })));
    list.append(bubble);
  });
  if (S.pending) list.append(h('div', { class: 'typing' }, 'Coach is typing…'));
  if (S.error) list.append(h('p', { class: 'err' }, S.error));

  const input = h('input', { type: 'text', placeholder: 'Ask anything, e.g. “what if the market drops?”', maxlength: 300, 'aria-label': 'Message', id: 'msg-input' });
  const form = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); if (t) { input.value = ''; send({ type: 'text', text: t }); } } },
    input, h('button', { class: 'btn', type: 'submit', disabled: S.pending }, 'Send'));

  return h('section', { class: 'card chat' },
    h('div', { class: 'chat-head' }, h('b', null, 'Your investment coach'), h('span', null, S.snap.stage === 'app' ? 'Inside your account' : 'In the browser · ~2 min')),
    list, form);
}

function renderWidget(w, { active }) {
  if (w.type === 'chips') {
    const row = h('div', { class: 'chips widget' }, w.options.map((o) => h('button', { class: 'chip', type: 'button', disabled: !active || S.pending, onclick: () => send({ type: 'choice', id: o.id }) }, o.label)));
    if (w.slider) {
      const out = h('b', null, `${fmt(w.slider.value)} lei`);
      const r = h('input', { type: 'range', min: w.slider.min, max: w.slider.max, step: w.slider.step, value: w.slider.value, disabled: !active || S.pending, 'aria-label': 'Monthly amount',
        oninput: () => { out.textContent = `${fmt(r.value)} lei`; }, onchange: () => send({ type: 'amount', value: Number(r.value) }) });
      return h('div', { class: 'widget' }, row, h('div', { class: 'slider' }, h('label', null, h('span', null, 'Or slide to any amount'), out), r));
    }
    return row;
  }
  if (w.type === 'sim') {
    const s = w.sim;
    return h('div', { class: 'widget' },
      h('div', { class: 'simcard' },
        h('div', { class: 'stat cash' }, h('small', null, 'Left as cash (real value)'), h('div', { class: 'n' }, `${fmt(s.cashReal)} lei`), h('small', null, `of ${fmt(s.contributed)} lei saved`)),
        h('div', { class: 'stat fund' }, h('small', null, `Diversified fund (~${(s.assumptions.fundReturn * 100).toFixed(1)}%/yr)`), h('div', { class: 'n' }, `${fmt(s.fund)} lei`), h('small', null, 'same savings, invested'))),
      h('p', { class: 'disc' }, w.disclaimer));
  }
  if (w.type === 'cta') {
    return h('div', { class: 'cta widget' },
      h('button', { class: 'btn alt', onclick: () => go('signup') }, w.options[0].label + ' →'),
      h('button', { class: 'btn ghost', onclick: () => go('login') }, w.options[1].label));
  }
  if (w.type === 'products') return productsWidget(w, active);
  if (w.type === 'handoff_form') return handoffForm();
  return document.createTextNode('');
}

function productsWidget(w, active) {
  const wrap = h('div', { class: 'widget' });
  const amount = h('input', { type: 'number', min: 100, max: 10000, step: 50, value: w.monthly, 'aria-label': 'Monthly amount in lei', style: 'width:110px;padding:6px 10px;border:2px solid var(--line);border-radius:10px' });
  const note = h('p', { class: 'err', style: 'display:none' });
  const activate = async (p, btn) => {
    btn.disabled = true; note.style.display = 'none';
    try {
      const r = await api('POST', '/api/plans', { productId: p.id, monthly: Number(amount.value) });
      S.me = { ...S.me, ...r };
      S.snap.messages = [...S.snap.messages, ...r.messages];
      render();
    } catch (e) { note.textContent = e.message; note.style.display = 'block'; btn.disabled = false; }
  };
  wrap.append(h('div', { class: 'row', style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px' }, h('span', null, 'Monthly amount:'), amount, h('span', null, 'lei')));
  const items = [...w.items].sort((a, b) => (b.id === w.recommended) - (a.id === w.recommended));
  for (const p of items) {
    const rec = p.id === w.recommended;
    const btn = h('button', { class: `btn ${rec ? '' : 'ghost'}`, type: 'button', disabled: !active || !p.allowed, onclick: (e) => activate(p, e.currentTarget) }, rec ? 'Activate with one tap →' : 'Choose');
    wrap.append(h('div', { class: `prod ${rec ? 'rec' : ''} ${p.allowed ? '' : 'off'}` },
      h('div', { class: 'row' }, h('h4', null, p.name), rec ? h('span', { class: 'tag' }, 'Picked for you') : h('span', { class: 'tag' }, p.tag)),
      h('p', null, `${p.riskLabel} · ${p.blurb}`),
      p.allowed ? h('div', { class: 'row', style: 'margin-top:10px' }, btn) : h('p', { class: 'err' }, p.reason)));
  }
  wrap.append(note, h('p', { class: 'disc' }, w.disclaimer));
  return wrap;
}

function handoffForm() {
  const phone = h('input', { type: 'tel', placeholder: '+40 7xx xxx xxx', 'aria-label': 'Phone number', style: 'padding:8px 12px;border:2px solid var(--line);border-radius:10px' });
  const note = h('p', { class: 'err', style: 'display:none' });
  const form = h('form', { class: 'widget', style: 'display:flex;gap:8px;flex-wrap:wrap', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/handoff', { phone: phone.value });
      S.snap.messages = [...S.snap.messages, ...r.messages]; render();
    } catch (err) { note.textContent = err.message; note.style.display = 'block'; }
  } }, phone, h('button', { class: 'btn', type: 'submit' }, 'Call me'), note);
  return form;
}

// ---------- side panels ----------
function sideChat() {
  const p = S.snap.profile;
  const side = h('aside', { class: 'side' });
  if (!S.panelSim) {
    side.append(h('section', { class: 'card dark' },
      h('p', { class: 'eyebrow' }, 'The opportunity'),
      h('h2', null, 'Money in a current account quietly shrinks'),
      h('p', { style: 'color:#C8C6BE' }, 'What 10,000 lei in cash will buy, at ~5.5% inflation a year:'),
      shrinkChart(),
      h('div', { style: 'display:flex;gap:12px;align-items:baseline;margin-top:8px' }, h('span', { class: 'big y' }, '7,651 lei'), h('span', { style: 'color:#C8C6BE' }, 'left after 5 years'))));
    side.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Why people don’t invest'),
      h('ul', { style: 'margin:0;padding-left:20px' }, h('li', null, '“I’m afraid of losing my money.”'), h('li', null, '“I want to be able to take it out anytime.”'), h('li', null, '“I don’t understand how the stock market works.”')),
      h('p', { class: 'disc' }, 'The coach answers exactly these three worries, in plain words.')));
    return side;
  }
  side.append(simPanel(S.panelSim, p));
  return side;
}

let shrinkData = null;
function shrinkChart() {
  const box = h('div', { style: 'min-height:160px' });
  const draw = (pts) => {
    const W = 520, H = 170, bw = 60, gap = (W - 6 * bw) / 5, max = pts[0].value;
    const g = svg('svg', { viewBox: `0 0 ${W} ${H + 26}`, class: 'chart', role: 'img', 'aria-label': `10,000 lei falls to ${fmt(pts[5].value)} lei of real value over five years` });
    pts.forEach((p, i) => {
      const bh = (p.value / max) * H;
      g.append(svg('rect', { x: i * (bw + gap), y: H - bh, width: bw, height: bh, rx: 6, fill: i === 0 ? '#FFE11A' : '#D2553F' }));
      const t = svg('text', { x: i * (bw + gap) + bw / 2, y: H + 18, 'text-anchor': 'middle', fill: '#9A978E', 'font-size': 13 }); t.textContent = i === 0 ? 'today' : `yr ${i}`; g.append(t);
    });
    box.replaceChildren(g);
  };
  if (shrinkData) draw(shrinkData);
  else api('GET', '/api/shrink').then((d) => { shrinkData = d.points; draw(shrinkData); }).catch(() => {});
  return box;
}

function lineChart(sim) {
  const W = 560, H = 230, L = 8, B = 26, T = 10;
  const pts = sim.series;
  const max = Math.max(...pts.map((p) => Math.max(p.fund, p.contributed, p.cashReal))) * 1.05 || 1;
  const x = (i) => L + (i / (pts.length - 1)) * (W - L * 2), y = (v) => T + (1 - v / max) * (H - T - B);
  const path = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `After ${sim.years} years: fund ${fmt(sim.fund)} lei, cash ${fmt(sim.cashReal)} lei in today's money` });
  g.append(svg('line', { x1: L, x2: W - L, y1: H - B, y2: H - B, stroke: '#E2DED3', 'stroke-width': 2 }));
  g.append(svg('path', { d: path('contributed'), fill: 'none', stroke: '#9A978E', 'stroke-width': 2, 'stroke-dasharray': '5 5' }));
  g.append(svg('path', { d: path('cashReal'), fill: 'none', stroke: '#B3321F', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  g.append(svg('path', { d: path('fund'), fill: 'none', stroke: '#121212', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  const last = pts.length - 1;
  g.append(svg('circle', { cx: x(last), cy: y(sim.fund), r: 6, fill: '#FFE11A', stroke: '#121212', 'stroke-width': 3 }));
  [0, Math.floor(last / 2), last].forEach((i) => { const t = svg('text', { x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === last ? 'end' : 'middle', fill: '#6B685F', 'font-size': 13 }); t.textContent = i === 0 ? 'today' : `yr ${pts[i].year}`; g.append(t); });
  return g;
}

function simPanel(sim, profile) {
  const out = h('b', null, `${fmt(sim.monthly)} lei`);
  const r = h('input', { type: 'range', min: 100, max: 2000, step: 50, value: sim.monthly, 'aria-label': 'Monthly amount', disabled: S.snap.stage === 'app' && profile.risk,
    oninput: () => { out.textContent = `${fmt(r.value)} lei`; }, onchange: () => send({ type: 'amount', value: Number(r.value) }) });
  const seg = h('div', { class: 'seg' }, [3, 5, 10].map((y) => h('button', { class: `chip ${y === sim.years ? 'on' : ''}`, type: 'button', onclick: () => send({ type: 'choice', id: `y${y}` }) }, `${y} years`)));
  return h('section', { class: 'card' },
    h('p', { class: 'eyebrow' }, 'Your numbers, live'),
    h('div', { class: 'simcard' },
      h('div', { class: 'stat cash' }, h('small', null, 'Left as cash'), h('div', { class: 'n' }, `${fmt(sim.cashReal)} lei`), h('small', null, `real value of ${fmt(sim.contributed)} lei saved`)),
      h('div', { class: 'stat fund' }, h('small', null, `Diversified fund (~${(sim.assumptions.fundReturn * 100).toFixed(1)}%/yr)`), h('div', { class: 'n' }, `${fmt(sim.fund)} lei`), h('small', null, 'same savings, invested'))),
    h('div', { class: 'card dark', style: 'margin-top:12px;padding:14px 18px' }, `After ${sim.years} years: `, h('b', { style: 'color:var(--y)' }, `+${fmt(sim.advantage)} lei`), ' better off than keeping cash.'),
    h('div', { style: 'margin-top:14px' }, lineChart(sim)),
    h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:#121212' }), 'Fund'), h('span', null, h('i', { style: 'background:#B3321F' }), 'Cash (real value)'), h('span', null, h('i', { style: 'background:#9A978E' }), 'Paid in')),
    h('div', { class: 'slider' }, h('label', null, h('span', null, 'Monthly amount'), out), r),
    seg,
    h('p', { class: 'disc' }, 'Simulation only · past returns don’t guarantee future results. Assumes 5.5% inflation and a 7.2% yearly fund return.'));
}

function sideAccount() {
  const m = S.me, a = m.account;
  const side = h('aside', { class: 'side' });
  side.append(h('section', { class: 'card dark' },
    h('p', { class: 'eyebrow' }, 'Current account'),
    h('div', { class: 'bal' }, `${fmt(a.balance)} lei`),
    h('p', { class: 'bank', style: 'color:#C8C6BE;margin:6px 0 12px' }, a.iban),
    h('div', { class: 'kv', style: 'border-color:#333' }, h('span', null, a.card.type), h('span', null, `•••• ${a.card.last4}`)),
    h('div', { class: 'kv', style: 'border-color:#333' }, h('span', null, 'Ready in'), h('span', null, a.card.wallets.join(' / '))),
    m.demoMode ? topUpForm() : null));
  const plans = m.portfolio.plans;
  const sec = h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Your investments'),
    h('div', { class: 'bal' }, `${fmt(m.portfolio.invested)} lei`), h('p', { class: 'disc', style: 'margin-top:0' }, 'invested so far'));
  if (!plans.length) sec.append(h('p', { style: 'color:var(--mute)' }, 'No plan yet. Answer the coach’s questions and activate your first plan.'));
  for (const p of plans) sec.append(planCard(p));
  side.append(sec);
  side.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Recent activity'), ledgerTable(m.ledger)));
  return side;
}

function topUpForm() {
  const amt = h('input', { type: 'number', min: 1, value: 1000, 'aria-label': 'Top-up amount', style: 'width:100px;padding:6px 10px;border-radius:10px;border:0' });
  const note = h('p', { class: 'err', style: 'display:none;margin:6px 0 0' });
  return h('form', { style: 'margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap', onsubmit: async (e) => {
    e.preventDefault();
    try { S.me = { ...S.me, ...(await api('POST', '/api/me/topup', { amount: Number(amt.value) })) }; render(); } catch (err) { note.textContent = err.message; note.style.display = 'block'; }
  } }, h('span', { style: 'font-size:14px;color:#C8C6BE' }, 'Demo transfer in:'), amt, h('button', { class: 'btn alt', type: 'submit', style: 'padding:6px 14px' }, 'Add money'), note);
}

function planCard(p) {
  const note = h('p', { class: 'err', style: 'display:none;margin:6px 0 0' });
  const act = async (path) => {
    try {
      const r = await api('POST', path);
      S.me = { ...S.me, ...r };
      if (r.messages) S.snap.messages = [...S.snap.messages, ...r.messages];
      render();
    } catch (e) { note.textContent = e.message; note.style.display = 'block'; }
  };
  const active = p.status === 'active';
  return h('div', { class: 'plan' },
    h('div', { class: 'row', style: 'display:flex;justify-content:space-between;gap:8px' }, h('b', null, p.product.name), h('span', { class: 'tag' }, active ? 'Active' : 'Stopped')),
    h('div', { class: 'kv' }, h('span', null, 'Monthly'), h('span', null, `${fmt(p.monthly)} lei`)),
    h('div', { class: 'kv' }, h('span', null, 'Invested'), h('span', null, `${fmt(p.invested)} lei · ${p.debits} ${p.debits === 1 ? 'debit' : 'debits'}`)),
    active ? h('div', { class: 'kv' }, h('span', null, 'Next debit'), h('span', null, p.nextDebit)) : null,
    active ? h('div', { class: 'row' },
      S.me.demoMode ? h('button', { class: 'btn alt', type: 'button', onclick: () => act(`/api/plans/${p.id}/run-debit`) }, 'Run this month’s debit (demo)') : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => confirm('Stop this plan? You can start a new one at any time.') && act(`/api/plans/${p.id}/stop`) }, 'Stop plan')) : null,
    note);
}

function ledgerTable(rows) {
  if (!rows.length) return h('p', { style: 'color:var(--mute)' }, 'Nothing yet.');
  return h('table', { class: 'led' }, h('tbody', null, rows.map((r) => h('tr', null,
    h('td', null, r.label, h('br'), h('small', { style: 'color:var(--mute)' }, new Date(r.at).toLocaleString())),
    h('td', { class: r.kind === 'credit' ? 'pos' : r.kind === 'debit' ? 'neg' : '' }, r.kind === 'failed' ? 'skipped' : `${r.kind === 'credit' ? '+' : '−'}${fmt(r.amount)} lei`)))));
}

// ---------- sign-up (new customers) ----------
const STEP_ORDER = ['details', 'id', 'selfie', 'sign'];
function signupView() {
  const su = S.signup, idx = STEP_ORDER.indexOf(su.step);
  const body = h('div');
  const fail = h('p', { class: 'err', style: 'display:none' });
  const run = async (fn) => { fail.style.display = 'none'; try { await fn(); } catch (e) { fail.textContent = e.message; fail.style.display = 'block'; } };
  const field = (label, name, props = {}) => h('div', { class: 'field' }, h('label', { for: `f-${name}` }, label), h('input', { id: `f-${name}`, name, value: su.data[name] || '', ...props }));
  const val = (f, n) => f.elements[n].value.trim();

  if (su.step === 'details') {
    const p = S.snap.profile;
    body.append(h('h2', null, 'Open a free account in ~3 minutes'),
      h('p', { style: 'color:var(--mute)' }, p.monthly ? `Your plan (${fmt(p.monthly)} lei a month) is saved and will be waiting for you.` : 'Just a few details.'),
      h('form', { onsubmit: (e) => { e.preventDefault(); const f = e.target;
        su.data = { firstName: val(f, 'firstName'), lastName: val(f, 'lastName'), email: val(f, 'email'), phone: val(f, 'phone') };
        run(async () => { await api('POST', '/api/signup/details', su.data); su.step = 'id'; render(); }); } },
        h('div', { class: 'two' }, field('First name', 'firstName', { autocomplete: 'given-name', required: true }), field('Last name', 'lastName', { autocomplete: 'family-name', required: true })),
        field('Email', 'email', { type: 'email', autocomplete: 'email', required: true }),
        field('Mobile phone', 'phone', { type: 'tel', autocomplete: 'tel', placeholder: '+40 7xx xxx xxx', required: true }),
        h('button', { class: 'btn', type: 'submit' }, 'Continue')));
  } else if (su.step === 'id') {
    const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', 'aria-label': 'Photo of your ID card', onchange: (e) => { const f = e.target.files[0]; if (f) { su.idPreview = URL.createObjectURL(f); render(); } } });
    body.append(h('h2', null, 'Scan your ID card'),
      h('p', { style: 'color:var(--mute)' }, 'Take a photo of the front of your ID card. In this demo the image stays on your device and only the card number is checked.'),
      h('div', { class: 'upload' }, file, su.idPreview ? h('img', { src: su.idPreview, alt: 'Your ID card preview' }) : null),
      h('form', { style: 'margin-top:16px', onsubmit: (e) => { e.preventDefault(); run(async () => { await api('POST', '/api/signup/id', { idNumber: val(e.target, 'idNumber') }); su.step = 'selfie'; render(); }); } },
        field('ID card number (2 letters, 6 digits)', 'idNumber', { placeholder: 'RX123456', maxlength: 10, required: true }),
        h('button', { class: 'btn', type: 'submit' }, 'Continue')));
  } else if (su.step === 'selfie') {
    const file = h('input', { type: 'file', accept: 'image/*', capture: 'user', 'aria-label': 'Selfie', onchange: (e) => { const f = e.target.files[0]; if (f) { su.selfiePreview = URL.createObjectURL(f); render(); } } });
    body.append(h('h2', null, 'Take a quick selfie'), h('p', { style: 'color:var(--mute)' }, 'We compare it with your ID photo. Face the camera in good light.'),
      h('div', { class: 'upload' }, file, su.selfiePreview ? h('img', { src: su.selfiePreview, alt: 'Your selfie preview' }) : null),
      h('div', { style: 'display:flex;gap:10px;margin-top:16px;flex-wrap:wrap' },
        h('button', { class: 'btn', type: 'button', disabled: !su.selfiePreview, onclick: () => run(async () => { await api('POST', '/api/signup/selfie', { captured: true }); su.step = 'sign'; su.demoCode = null; render(); }) }, 'Continue'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => run(async () => { await api('POST', '/api/signup/selfie', { captured: true }); su.step = 'sign'; render(); }) }, 'Use a demo selfie')));
  } else if (su.step === 'sign') {
    const needCode = !su.sentTo;
    body.append(h('h2', null, 'Sign electronically'), h('p', { style: 'color:var(--mute)' }, 'We’ll text you a 6-digit code to sign your account opening.'));
    if (needCode) body.append(h('button', { class: 'btn', type: 'button', onclick: () => run(async () => { const r = await api('POST', '/api/signup/otp/request'); su.sentTo = r.sentTo; su.demoCode = r.demoCode; render(); }) }, 'Text me the code'));
    else {
      body.append(h('p', null, `Code sent to ${su.sentTo}.`),
        su.demoCode ? h('div', { class: 'sms' }, 'Demo SMS from Raiffeisen: your code is ', h('b', null, su.demoCode)) : null,
        h('form', { onsubmit: (e) => { e.preventDefault(); run(async () => {
          const d = await api('POST', '/api/signup/otp/verify', { code: val(e.target, 'code') });
          S.me = d; S.snap = { ...S.snap, ...pick(d, ['messages', 'profile', 'stage', 'step', 'user']) };
          S.signup = { step: 'details', data: {}, demoCode: null, sentTo: null }; S.view = 'chat'; render(); }); } },
          field('6-digit code', 'code', { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', required: true }),
          h('button', { class: 'btn', type: 'submit' }, 'Sign and open my account')));
    }
  }
  body.append(fail);
  return h('div', { class: 'narrow' },
    h('button', { class: 'back', onclick: () => go('chat') }, '← Back to the chat'),
    h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, `Step ${idx + 1} of 4 · New to Raiffeisen`), h('div', { class: 'steps' }, STEP_ORDER.map((_, i) => h('div', { class: i <= idx ? 'on' : '' }))), body));
}

// ---------- login (existing clients) ----------
function loginView() {
  const L = S.login;
  const fail = h('p', { class: 'err', style: 'display:none' });
  const body = h('div');
  if (!L.requestId) {
    const id = h('input', { id: 'f-id', placeholder: '+40 722 000 111 or ioana.popescu@example.com', required: true, autocomplete: 'username' });
    body.append(h('h2', null, 'Log in with the Raiffeisen app'),
      h('p', { style: 'color:var(--mute)' }, 'No forms, no paperwork: approve the login on your phone and your answers and simulation come with you.'),
      h('form', { onsubmit: async (e) => { e.preventDefault(); fail.style.display = 'none';
        try { const r = await api('POST', '/api/login/request', { identifier: id.value }); L.requestId = r.requestId; L.firstName = r.firstName; L.status = 'pending'; render(); pollLogin(); }
        catch (err) { fail.textContent = err.message; fail.style.display = 'block'; } } },
        h('div', { class: 'field' }, h('label', { for: 'f-id' }, 'Phone number or email'), id),
        h('p', { class: 'disc' }, 'Demo client: +40 722 000 111'),
        h('button', { class: 'btn', type: 'submit' }, 'Send login request')));
  } else {
    body.append(h('h2', null, `Approve on your phone, ${L.firstName}`), h('p', { style: 'color:var(--mute)' }, 'We sent a login request to your Raiffeisen app. Waiting for approval…'),
      h('div', { class: 'phone' }, h('p', { style: 'margin:0 0 8px;font-weight:700' }, 'Raiffeisen app'), h('p', { style: 'margin:0 0 12px;font-size:15px' }, 'Approve login to the AI Investment Coach?'),
        h('button', { class: 'btn alt', type: 'button', onclick: () => api('POST', '/api/login/approve', { requestId: L.requestId }).then(pollLogin).catch((e) => { fail.textContent = e.message; fail.style.display = 'block'; }) }, 'Approve'),
        h('button', { class: 'btn ghost', type: 'button', style: 'color:#F4F2EC;border-color:#555', onclick: () => api('POST', '/api/login/approve', { requestId: L.requestId, approve: false }).then(pollLogin) }, 'Deny')),
      h('p', { class: 'disc' }, 'Demo phone: in production this approval happens in the real Raiffeisen app.'),
      L.status && L.status !== 'pending' ? h('p', { class: 'err' }, L.status === 'denied' ? 'Login was denied.' : 'The request expired. Please try again.') : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { clearTimeout(L.timer); S.login = { requestId: null, status: null, timer: null }; render(); } }, 'Start over'));
  }
  body.append(fail);
  return h('div', { class: 'narrow' }, h('button', { class: 'back', onclick: () => { clearTimeout(L.timer); go('chat'); } }, '← Back to the chat'), h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Already a client'), body));
}

async function pollLogin() {
  const L = S.login;
  clearTimeout(L.timer);
  if (!L.requestId || S.view !== 'login') return;
  try {
    const r = await api('GET', `/api/login/status?requestId=${L.requestId}`);
    L.status = r.status;
    if (r.status === 'approved') {
      S.me = r; S.snap = { ...S.snap, ...pick(r, ['messages', 'profile', 'stage', 'step', 'user']) };
      S.login = { requestId: null, status: null, timer: null }; S.view = 'chat'; render(); return;
    }
    if (r.status === 'pending') L.timer = setTimeout(pollLogin, 1500);
    else render();
  } catch (e) { L.timer = setTimeout(pollLogin, 3000); }
}

// ---------- shell ----------
function go(view) { S.view = view; render(); window.scrollTo(0, 0); }

function renderNav() {
  nav.replaceChildren();
  if (S.snap && S.snap.user) {
    nav.append(h('span', { class: 'chip-user' }, `${S.snap.user.firstName} ${S.snap.user.lastName}`),
      h('button', { type: 'button', onclick: async () => { await api('POST', '/api/logout'); location.href = '/'; } }, 'Log out'));
  } else {
    nav.append(h('button', { type: 'button', onclick: () => go('login') }, 'I’m already a client'));
  }
}

function render() {
  renderNav();
  const logged = Boolean(S.snap.user && S.me);
  let view;
  if (!logged && S.view === 'signup') view = signupView();
  else if (!logged && S.view === 'login') view = loginView();
  else {
    view = h('div', null,
      !logged && !S.snap.profile.monthly ? h('div', { class: 'hero' }, h('p', { class: 'eyebrow' }, 'Raiffeisen AI Investment Coach'), h('h1', null, 'Turn idle cash into a first investment.'), h('p', null, 'A friendly chat that shows what your cash is doing, answers your worries in plain words, and helps you start, right inside your account.')) : null,
      h('div', { class: 'grid' }, chatCard(), logged ? sideAccount() : sideChat()));
  }
  app.replaceChildren(view);
  const msgs = document.getElementById('msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

boot();
