'use strict';
const t = (key, values) => I18n.t(key, values);
// Single-page client. All numbers shown come from the server (engine / bank); this file only renders them.

const fmt = (n) => Math.round(n).toLocaleString(I18n.locale);
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
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'accept-language': I18n.language }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || t("error")), { status: res.status });
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
  config: {},
  personas: [],
  agent: { mode: 'offline', trace: [], usage: {} },
  progress: null,
  progressTimer: null,
  activityOpen: null,
};

// ---------- boot ----------
async function boot() {
  await I18n.init();
  const q = new URLSearchParams(location.search);
  try {
    S.config = await api('GET', '/api/config');
    if (S.config.demoMode) S.personas = (await api('GET', '/api/personas')).personas;
    S.snap = await api('POST', '/api/journey', { source: q.get('src'), campaign: q.get('cmp'), language: I18n.language });
    S.agent = { ...S.agent, ...pick(S.snap, ['mode','trace','decisions','usage','estimatedCostUsd','fallbackReason']) };
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
  S.snap = { ...S.snap, ...pick(d, ['messages', 'profile', 'stage', 'step', 'user', 'sampleProfile', 'requiresReplan', 'proposalVersion']) };
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

async function refreshPanel() {
  const p = S.snap.profile;
  if (p.monthly) {
    try { S.panelSim = await api('GET', `/api/simulate?monthly=${p.monthly}&years=${p.years || S.years}`); } catch { S.panelSim = null; }
  } else { S.panelSim = null; const data=await api('GET','/api/shrink');shrinkData=data.points;S.shrinkInfo=data; }
}

// ---------- chat ----------
async function send(input, path = '/api/chat') {
  if (S.pending) return;
  S.pending = true; S.error = null; S.progress = null; render();
  const turnId = window.crypto?.randomUUID?.();
  S.progress = { events: [], state: 'running', elapsedMs: 0 };
  const poll = async () => {
    if (!S.pending) return;
    try {
      S.progress = await api('GET', '/api/agent/status' + (turnId ? '?turnId=' + turnId : ''));
      const panel = document.getElementById('activity');
      if (panel) {
        const open = panel.open;
        const next = activityPanel(); next.open = open; panel.replaceWith(next);
      }
    } catch {}
    if (S.pending) S.progressTimer = setTimeout(poll, 750);
  };
  S.progressTimer = setTimeout(poll, 200);
  try {
    const r = await api('POST', path, { ...input, turnId });
    S.agent = { ...S.agent, ...pick(r, ['mode','trace','decisions','usage','estimatedCostUsd','fallbackReason','providerCalls','refusalReason']) };
    S.snap = { ...S.snap, ...pick(r, ['profile', 'stage', 'step', 'user', 'proposalVersion', 'sampleProfile', 'requiresReplan']), messages: r.history };
    if (S.snap.profile.years) S.years = S.snap.profile.years;
    await refreshPanel();
  } catch (e) { S.error = e.message; }
  clearTimeout(S.progressTimer); S.pending = false; S.progress = null; render();
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
  const persona = S.snap.user?.personaId || S.snap.sampleProfile?.id;
  const list = h('div', { class: 'msgs', id: 'msgs' });
  ms.forEach((m, i) => {
    const bubble = h('div', { class: `msg ${m.role}` }, m.text);
    (m.widgets || []).forEach((w) => bubble.append(renderWidget(w, { active: i === activeIdx || (w.type !== 'chips' && i === lastIdx) || w.type === 'cta' || w.type === 'sim', i })));
    list.append(bubble);
  });
  if (S.pending) list.append(h('div', { class: 'typing', role: 'status' }, t('working')));
  if (S.error) list.append(h('p', { class: 'err' }, S.error));

  const input = h('input', { type: 'text', placeholder: t("askPlaceholder"), maxlength: 300, 'aria-label': t("message"), id: 'msg-input' });
  const form = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); if (t) { input.value = ''; send({ type: 'text', text: t }); } } },
    input, h('button', { class: 'btn', type: 'submit', disabled: S.pending }, t("send")));

  return h('section', { class: 'card chat' },
    h('div', { class: 'chat-head' }, h('b', null, t("coach")), h('span', {class:'mode', 'aria-label':t('answerMode')}, S.agent.mode)),
    persona ? h('div',{class:'suggestions'},
      ['prompt_', 'whatif_', 'question_'].map(prefix => h('button', { class: 'chip', disabled: S.pending,
        onclick: () => send({ type: 'text', text: t(prefix + persona) }) }, t(prefix + persona))),
      !S.snap.profile.risk ? ['low','medium','high'].map(risk=>h('button',{class:'chip',disabled:S.pending,onclick:()=>send({type:'text',text:risk})},t('risk_'+risk))) : null) : null,
    list, form);
}

function renderWidget(w, { active }) {
  if (w.type === 'chips') {
    const row = h('div', { class: 'chips widget' }, w.options.map((o) => h('button', { class: 'chip', type: 'button', disabled: !active || S.pending, onclick: () => send({ type: 'choice', id: o.id }) }, o.label)));
    if (w.slider) {
      const out = h('b', null, `${fmt(w.slider.value)} lei`);
      const r = h('input', { type: 'range', min: w.slider.min, max: w.slider.max, step: w.slider.step, value: w.slider.value, disabled: !active || S.pending, 'aria-label': t("monthlyAmount"),
        oninput: () => { out.textContent = `${fmt(r.value)} lei`; }, onchange: () => send({ type: 'amount', value: Number(r.value) }) });
      return h('div', { class: 'widget' }, row, h('div', { class: 'slider' }, h('label', null, h('span', null, t("slideAmount")), out), r));
    }
    return row;
  }
  if (w.type === 'sim') {
    const s = w.sim;
    return h('div', { class: 'widget' },
      h('div', { class: 'simcard' },
        h('div', { class: 'stat cash' }, h('small', null, t("cashReal")), h('div', { class: 'n' }, `${fmt(s.cashReal)} lei`), h('small', null, t("savedOf", {amount: fmt(s.contributed)}))),
        h('div', { class: 'stat fund' }, h('small', null, t("fundRate", {rate: (s.assumptions.fundReturn * 100).toLocaleString(I18n.locale)})), h('div', { class: 'n' }, `${fmt(s.fund)} lei`), h('small', null, t("investedSavings")))),
      h('p', { class: 'disc' }, w.disclaimer));
  }
  if (w.type === 'cta') {
    return h('div', { class: 'cta widget' },
      h('button', { class: 'btn alt', onclick: () => go('signup') }, w.options[0].label + ' →'),
      h('button', { class: 'btn ghost', onclick: () => go('login') }, w.options[1].label));
  }
  if (w.type === 'connect_context') {
    const select = h('select', { 'aria-label': t('chooseSample') }, S.personas.map(persona =>
      h('option', { value: persona.id }, persona.name + ' · ' + persona.description)));
    return h('div', { class: 'widget sample-connect' }, h('p', null, t('samplePreview')), select,
      h('button', { class: 'btn', disabled: S.pending || Boolean(S.snap.sampleProfile) || Boolean(S.snap.user?.synthetic),
        onclick: () => send({ persona: select.value }, '/api/context/connect') }, t('connectDemo')));
  }
  if (w.type === 'products') return productsWidget(w, active);
  if (w.type === 'handoff_form') return handoffForm();
  if (['budget','capacity','compare','simulation','plan_proposal','what_if','auth','handoff','risk_set','rules'].includes(w.type)) return agentCard(w);
  return document.createTextNode('');
}

function productsWidget(w, active) {
  const wrap = h('div', { class: 'widget' });
  const amount = h('input', { type: 'number', min: 100, max: 10000, step: 50, value: w.monthly, 'aria-label': t("monthlyLei"), style: 'width:110px;padding:6px 10px;border:2px solid var(--line);border-radius:10px' });
  const note = h('p', { class: 'err', style: 'display:none' });
  const activate = async (p, btn) => {
    btn.disabled = true; note.style.display = 'none';
    try {
      const r = await api('POST', '/api/plans', { productId: p.id, monthly: Number(amount.value) });
      S.me = { ...S.me, ...r };
      S.snap.proposalVersion=r.proposalVersion;
      S.snap.messages = [...S.snap.messages, ...r.messages];
      render();
    } catch (e) { note.textContent = e.message; note.style.display = 'block'; btn.disabled = false; }
  };
  wrap.append(h('div', { class: 'row', style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px' }, h('span', null, t("monthlyLabel")), amount, h('span', null, 'lei')));
  const items = [...w.items].sort((a, b) => (b.id === w.recommended) - (a.id === w.recommended));
  for (const p of items) {
    const rec = p.id === w.recommended;
    const btn = h('button', { class: `btn ${rec ? '' : 'ghost'}`, type: 'button', disabled: !active || !p.allowed, onclick: (e) => activate(p, e.currentTarget) }, rec ? t("activate") : t("choose"));
    wrap.append(h('div', { class: `prod ${rec ? 'rec' : ''} ${p.allowed ? '' : 'off'}` },
      h('div', { class: 'row' }, h('h4', null, p.name), rec ? h('span', { class: 'tag' }, t("picked")) : h('span', { class: 'tag' }, p.tag)),
      h('p', null, `${p.riskLabel} · ${p.blurb}`),
      p.allowed ? h('div', { class: 'row', style: 'margin-top:10px' }, btn) : h('p', { class: 'err' }, p.reason)));
  }
  wrap.append(note, h('p', { class: 'disc' }, w.disclaimer));
  return wrap;
}

function handoffForm() {
  const phone = h('input', { type: 'tel', placeholder: '+40 7xx xxx xxx', 'aria-label': t("phone"), style: 'padding:8px 12px;border:2px solid var(--line);border-radius:10px' });
  const note = h('p', { class: 'err', style: 'display:none' });
  const form = h('form', { class: 'widget', style: 'display:flex;gap:8px;flex-wrap:wrap', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/handoff', { phone: phone.value });
      S.snap.messages = [...S.snap.messages, ...r.messages]; render();
    } catch (err) { note.textContent = err.message; note.style.display = 'block'; }
  } }, phone, h('button', { class: 'btn', type: 'submit' }, t("call")), note);
  return form;
}

// ---------- side panels ----------
function sideChat() {
  const p = S.snap.profile;
  const side = h('aside', { class: 'side' });
  if (!S.panelSim) {
    side.append(h('section', { class: 'card dark' },
      h('p', { class: 'eyebrow' }, t("opportunity")),
      h('h2', null, t("cashShrinks")),
      h('p', { style: 'color:#C8C6BE' }, t("cashIllustration",{amount:fmt(S.shrinkInfo.amount),rate:(S.shrinkInfo.inflation*100).toLocaleString(I18n.locale)})),
      shrinkChart(),
      h('div', { style: 'display:flex;gap:12px;align-items:baseline;margin-top:8px' }, h('span', { class: 'big y' }, fmt(shrinkData.at(-1).value)+' lei'), h('span', { style: 'color:#C8C6BE' }, t("remaining")))));
    side.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t("barriers")),
      h('ul', { style: 'margin:0;padding-left:20px' }, h('li', null, t("fearLoss")), h('li', null, t("fearAccess")), h('li', null, t("fearUnderstanding"))),
      h('p', { class: 'disc' }, t("plainAnswers"))));
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
    const g = svg('svg', { viewBox: `0 0 ${W} ${H + 26}`, class: 'chart', role: 'img', 'aria-label': t("chartShrink", {amount: fmt(pts[5].value)}) });
    pts.forEach((p, i) => {
      const bh = (p.value / max) * H;
      g.append(svg('rect', { x: i * (bw + gap), y: H - bh, width: bw, height: bh, rx: 6, fill: i === 0 ? '#FFE11A' : '#D2553F' }));
    });
    box.replaceChildren(g, h('div', { class: 'chart-axis' },
      pts.map((point, i) => h('span', null, i === 0 ? t('today') : t('year', { years: i })))));
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
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': t("chartSim", {years: sim.years, fund:fmt(sim.fund), cash:fmt(sim.cashReal)}) });
  g.append(svg('line', { x1: L, x2: W - L, y1: H - B, y2: H - B, stroke: '#E2DED3', 'stroke-width': 2 }));
  g.append(svg('path', { d: path('contributed'), fill: 'none', stroke: '#9A978E', 'stroke-width': 2, 'stroke-dasharray': '5 5' }));
  g.append(svg('path', { d: path('cashReal'), fill: 'none', stroke: '#B3321F', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  g.append(svg('path', { d: path('fund'), fill: 'none', stroke: '#121212', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  const last = pts.length - 1;
  g.append(svg('circle', { cx: x(last), cy: y(sim.fund), r: 6, fill: '#FFE11A', stroke: '#121212', 'stroke-width': 3 }));
  return h('div', null, g, h('div', { class: 'chart-axis' },
    [0, Math.floor(last / 2), last].map(i => h('span', null, i === 0 ? t('today') : t('year', { years: pts[i].year })))));
}

function simPanel(sim, profile) {
  const out = h('b', null, `${fmt(sim.monthly)} lei`);
  const r = h('input', { type: 'range', min: 100, max: 2000, step: 50, value: sim.monthly, 'aria-label': t("monthlyAmount"), disabled: S.snap.stage === 'app' && profile.risk,
    oninput: () => { out.textContent = `${fmt(r.value)} lei`; }, onchange: () => send({ type: 'amount', value: Number(r.value) }) });
  const seg = h('div', { class: 'seg' }, [3, 5, 10].map((y) => h('button', { class: `chip ${y === sim.years ? 'on' : ''}`, type: 'button', onclick: () => send({ type: 'choice', id: `y${y}` }) }, t("years", {years:y}))));
  return h('section', { class: 'card' },
    h('p', { class: 'eyebrow' }, t("liveNumbers")),
    h('div', { class: 'simcard' },
      h('div', { class: 'stat cash' }, h('small', null, t("cash")), h('div', { class: 'n' }, `${fmt(sim.cashReal)} lei`), h('small', null, t("realSaved", {amount: fmt(sim.contributed)}))),
      h('div', { class: 'stat fund' }, h('small', null, t("fundRate", {rate: (sim.assumptions.fundReturn * 100).toLocaleString(I18n.locale)})), h('div', { class: 'n' }, `${fmt(sim.fund)} lei`), h('small', null, t("investedSavings")))),
    h('div', { class: 'card dark', style: 'margin-top:12px;padding:14px 18px' }, t("afterYears", {years:sim.years}), h('b', { style: 'color:var(--y)' }, `+${fmt(sim.advantage)} lei`), t("betterOff")),
    h('div', { style: 'margin-top:14px' }, lineChart(sim)),
    h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background:#121212' }), t("fund")), h('span', null, h('i', { style: 'background:#B3321F' }), t("cashLegend")), h('span', null, h('i', { style: 'background:#9A978E' }), t("paidIn"))),
    h('div', { class: 'slider' }, h('label', null, h('span', null, t("monthlyAmount")), out), r),
    seg,
    h('p', { class: 'disc' }, t("assumptions",{inflation:(sim.assumptions.inflation*100).toLocaleString(I18n.locale),rate:(sim.assumptions.fundReturn*100).toLocaleString(I18n.locale)})));
}

function sideAccount() {
  const m = S.me, a = m.account;
  const side = h('aside', { class: 'side' });
  side.append(h('section', { class: 'card dark' },
    h('p', { class: 'eyebrow' }, t("currentAccount")),
    h('div', { class: 'bal' }, `${fmt(a.balance)} lei`),
    h('p', { class: 'bank', style: 'color:#C8C6BE;margin:6px 0 12px' }, a.iban),
    h('div', { class: 'kv', style: 'border-color:#333' }, h('span', null, a.card.type), h('span', null, `•••• ${a.card.last4}`)),
    h('div', { class: 'kv', style: 'border-color:#333' }, h('span', null, t("readyIn")), h('span', null, a.card.wallets.join(' / '))),
    m.demoMode ? topUpForm() : null));
  const plans = m.portfolio.plans;
  const sec = h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t("investments")),
    h('div', { class: 'bal' }, `${fmt(m.portfolio.invested)} lei`), h('p', { class: 'disc', style: 'margin-top:0' }, t("investedSoFar")));
  if (!plans.length) sec.append(h('p', { style: 'color:var(--mute)' }, t("noPlan")));
  for (const p of plans) sec.append(planCard(p));
  side.append(sec);
  side.append(h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t("recent")), ledgerTable(m.ledger)));
  return side;
}

function topUpForm() {
  const amt = h('input', { type: 'number', min: 1, value: 1000, 'aria-label': t("topupAmount"), style: 'width:100px;padding:6px 10px;border-radius:10px;border:0' });
  const note = h('p', { class: 'err', style: 'display:none;margin:6px 0 0' });
  return h('form', { style: 'margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap', onsubmit: async (e) => {
    e.preventDefault();
    try { S.me = { ...S.me, ...(await api('POST', '/api/me/topup', { amount: Number(amt.value) })) }; render(); } catch (err) { note.textContent = err.message; note.style.display = 'block'; }
  } }, h('span', { style: 'font-size:16px;color:#C8C6BE' }, t("demoTransfer")), amt, h('button', { class: 'btn alt', type: 'submit', style: 'padding:6px 14px' }, t("addMoney")), note);
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
    h('div', { class: 'row', style: 'display:flex;justify-content:space-between;gap:8px' }, h('b', null, t('product_'+p.productId)), h('span', { class: 'tag' }, active ? t("active") : t("stopped"))),
    h('div', { class: 'kv' }, h('span', null, t("monthly")), h('span', null, `${fmt(p.monthly)} lei`)),
    h('div', { class: 'kv' }, h('span', null, t("invested")), h('span', null, t("debitCount", {amount:fmt(p.invested),count:p.debits}))),
    active ? h('div', { class: 'kv' }, h('span', null, t("nextDebit")), h('span', null, p.nextDebit)) : null,
    active ? h('div', { class: 'row' },
      S.me.demoMode ? h('button', { class: 'btn alt', type: 'button', onclick: () => act(`/api/plans/${p.id}/run-debit`) }, t("runDebit")) : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => confirm(t("stopQuestion")) && act(`/api/plans/${p.id}/stop`) }, t("stopPlan"))) : null,
    note);
}

function ledgerTable(rows) {
  if (!rows.length) return h('p', { style: 'color:var(--mute)' }, t("nothingYet"));
  return h('table', { class: 'led' }, h('tbody', null, rows.map((r) => h('tr', null,
    h('td', null, r.label, h('br'), h('small', { style: 'color:var(--mute)' }, new Date(r.at).toLocaleString())),
    h('td', { class: r.kind === 'credit' ? 'pos' : r.kind === 'debit' ? 'neg' : '' }, r.kind === 'failed' ? t("skipped") : `${r.kind === 'credit' ? '+' : '−'}${fmt(r.amount)} lei`)))));
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
    body.append(h('h2', null, t("openAccount")),
      h('p', { style: 'color:var(--mute)' }, p.monthly ? t("savedPlan", {amount:fmt(p.monthly)}) : t("fewDetails")),
      h('form', { onsubmit: (e) => { e.preventDefault(); const f = e.target;
        su.data = { firstName: val(f, 'firstName'), lastName: val(f, 'lastName'), email: val(f, 'email'), phone: val(f, 'phone') };
        run(async () => { await api('POST', '/api/signup/details', su.data); su.step = 'id'; render(); }); } },
        h('div', { class: 'two' }, field(t("firstName"), 'firstName', { autocomplete: 'given-name', required: true }), field(t("lastName"), 'lastName', { autocomplete: 'family-name', required: true })),
        field(t("email"), 'email', { type: 'email', autocomplete: 'email', required: true }),
        field(t("mobile"), 'phone', { type: 'tel', autocomplete: 'tel', placeholder: '+40 7xx xxx xxx', required: true }),
        h('button', { class: 'btn', type: 'submit' }, t("continue"))));
  } else if (su.step === 'id') {
    const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', 'aria-label': t("idPhoto"), onchange: (e) => { const f = e.target.files[0]; if (f) { su.idPreview = URL.createObjectURL(f); render(); } } });
    body.append(h('h2', null, t("scanId")),
      h('p', { style: 'color:var(--mute)' }, t("idDemo")),
      h('div', { class: 'upload' }, file, su.idPreview ? h('img', { src: su.idPreview, alt: t("idPreview") }) : null),
      h('form', { style: 'margin-top:16px', onsubmit: (e) => { e.preventDefault(); run(async () => { await api('POST', '/api/signup/id', { idNumber: val(e.target, 'idNumber') }); su.step = 'selfie'; render(); }); } },
        field(t("idNumber"), 'idNumber', { placeholder: 'RX123456', maxlength: 10, required: true }),
        h('button', { class: 'btn', type: 'submit' }, t("continue"))));
  } else if (su.step === 'selfie') {
    const file = h('input', { type: 'file', accept: 'image/*', capture: 'user', 'aria-label': t("selfie"), onchange: (e) => { const f = e.target.files[0]; if (f) { su.selfiePreview = URL.createObjectURL(f); render(); } } });
    body.append(h('h2', null, t("takeSelfie")), h('p', { style: 'color:var(--mute)' }, t("selfieInstructions")),
      h('div', { class: 'upload' }, file, su.selfiePreview ? h('img', { src: su.selfiePreview, alt: t("selfiePreview") }) : null),
      h('div', { style: 'display:flex;gap:10px;margin-top:16px;flex-wrap:wrap' },
        h('button', { class: 'btn', type: 'button', disabled: !su.selfiePreview, onclick: () => run(async () => { await api('POST', '/api/signup/selfie', { captured: true }); su.step = 'sign'; su.demoCode = null; render(); }) }, t("continue")),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => run(async () => { await api('POST', '/api/signup/selfie', { captured: true }); su.step = 'sign'; render(); }) }, t("demoSelfie"))));
  } else if (su.step === 'sign') {
    const needCode = !su.sentTo;
    body.append(h('h2', null, t("sign")), h('p', { style: 'color:var(--mute)' }, t("signInstructions")));
    if (needCode) body.append(h('button', { class: 'btn', type: 'button', onclick: () => run(async () => { const r = await api('POST', '/api/signup/otp/request'); su.sentTo = r.sentTo; su.demoCode = r.demoCode; render(); }) }, t("textCode")));
    else {
      body.append(h('p', null, t("sentTo", {phone:su.sentTo})),
        su.demoCode ? h('div', { class: 'sms' }, t("demoSms"), h('b', null, su.demoCode)) : null,
        h('form', { onsubmit: (e) => { e.preventDefault(); run(async () => {
          const d = await api('POST', '/api/signup/otp/verify', { code: val(e.target, 'code') });
          S.me = d; S.snap = { ...S.snap, ...pick(d, ['messages', 'profile', 'stage', 'step', 'user', 'sampleProfile', 'requiresReplan', 'proposalVersion']) };
          S.signup = { step: 'details', data: {}, demoCode: null, sentTo: null }; S.view = 'chat'; render();
          if (S.snap.requiresReplan) await send({ type: 'text', text: t('authenticatedReplan') }); }); } },
          field(t("sixCode"), 'code', { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', required: true }),
          h('button', { class: 'btn', type: 'submit' }, t("signOpen"))));
    }
  }
  body.append(fail);
  return h('div', { class: 'narrow' },
    h('button', { class: 'back', onclick: () => go('chat') }, t("back")),
    h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t("signupStep", {step:idx+1})), h('div', { class: 'steps' }, STEP_ORDER.map((_, i) => h('div', { class: i <= idx ? 'on' : '' }))), body));
}

// ---------- login (existing clients) ----------
function loginView() {
  const L = S.login;
  const fail = h('p', { class: 'err', style: 'display:none' });
  const body = h('div');
  if (!L.requestId) {
    const id = h('input', { id: 'f-id', placeholder: '+40 722 000 111 or ioana.popescu@example.com', required: true, autocomplete: 'username' });
    body.append(h('h2', null, t("loginTitle")),
      h('p', { style: 'color:var(--mute)' }, t("loginIntro")),
      h('form', { onsubmit: async (e) => { e.preventDefault(); fail.style.display = 'none';
        try { const r = await api('POST', '/api/login/request', { identifier: id.value }); L.requestId = r.requestId; L.firstName = r.firstName; L.status = 'pending'; render(); pollLogin(); }
        catch (err) { fail.textContent = err.message; fail.style.display = 'block'; } } },
        h('div', { class: 'field' }, h('label', { for: 'f-id' }, t("phoneEmail")), id),
        h('p', { class: 'disc' }, t("demoClient")),
        h('button', { class: 'btn', type: 'submit' }, t("sendLogin"))));
  } else {
    body.append(h('h2', null, t("approveName", {name:L.firstName})), h('p', { style: 'color:var(--mute)' }, t("waiting")),
      h('div', { class: 'phone' }, h('p', { style: 'margin:0 0 8px;font-weight:700' }, t("bankApp")), h('p', { style: 'margin:0 0 12px;font-size:16px' }, t("approveQuestion")),
        h('button', { class: 'btn alt', type: 'button', onclick: () => api('POST', '/api/login/approve', { requestId: L.requestId }).then(pollLogin).catch((e) => { fail.textContent = e.message; fail.style.display = 'block'; }) }, t("approve")),
        h('button', { class: 'btn ghost', type: 'button', style: 'color:#F4F2EC;border-color:#555', onclick: () => api('POST', '/api/login/approve', { requestId: L.requestId, approve: false }).then(pollLogin) }, t("deny"))),
      h('p', { class: 'disc' }, t("demoPhone")),
      L.status && L.status !== 'pending' ? h('p', { class: 'err' }, L.status === 'denied' ? t("loginDenied") : t("loginExpired")) : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { clearTimeout(L.timer); S.login = { requestId: null, status: null, timer: null }; render(); } }, t("startOver")));
  }
  body.append(fail);
  return h('div', { class: 'narrow' }, h('button', { class: 'back', onclick: () => { clearTimeout(L.timer); go('chat'); } }, t("back")), h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t("existingClient")), body));
}

async function pollLogin() {
  const L = S.login;
  clearTimeout(L.timer);
  if (!L.requestId || S.view !== 'login') return;
  try {
    const r = await api('GET', `/api/login/status?requestId=${L.requestId}`);
    L.status = r.status;
    if (r.status === 'approved') {
      S.me = r; S.snap = { ...S.snap, ...pick(r, ['messages', 'profile', 'stage', 'step', 'user', 'sampleProfile', 'requiresReplan', 'proposalVersion']) };
      S.login = { requestId: null, status: null, timer: null }; S.view = 'chat'; render();
      if (S.snap.requiresReplan) await send({ type: 'text', text: t('authenticatedReplan') });
      return;
    }
    if (r.status === 'pending') L.timer = setTimeout(pollLogin, 1500);
    else render();
  } catch (e) { L.timer = setTimeout(pollLogin, 3000); }
}

// ---------- shell ----------
function go(view) { S.view = view; render(); window.scrollTo(0, 0); }

function renderNav() {
  nav.replaceChildren(I18n.selector(async language => {
    S.snap = await api("POST", "/api/language", {language});
    render();
  }));
  if (S.config.demoMode) {
    const selector=h('select',{'aria-label':t('persona'),class:'persona',disabled:S.pending,onchange:async event=>{
      if(!event.target.value) return;
      try {
        const result=await api('POST','/api/persona',{persona:event.target.value});
        S.snap=result; S.me=result; S.view='chat'; S.agent={mode:'offline',trace:[],usage:{}};
        S.years=5; await refreshPanel(); render();
      } catch(error) {S.error=error.message;render();}
    }},h('option',{value:''},t('choosePersona')),S.personas.map(persona=>h('option',{value:persona.id},t('persona_'+persona.id))));
    selector.value=S.snap.user?.personaId || '';
    nav.append(selector);
    nav.append(h('button', { type: 'button', disabled: S.pending, onclick: async () => {
      if (!confirm(t('resetWarning'))) return;
      try {
        await api('POST', '/api/demo/reset');
        S.me = null; S.agent = { mode: 'offline', trace: [], usage: {} }; S.view = 'chat';
        await boot();
      } catch (error) { S.error = error.message; render(); }
    } }, t('resetDemo')));
  }
  if (S.snap && S.snap.user) {
    nav.append(h('span', { class: 'chip-user' }, `${S.snap.user.firstName} ${S.snap.user.lastName}`),
      h('button', { type: 'button', onclick: async () => { await api('POST', '/api/logout'); location.href = '/'; } }, t("logout")));
  } else {
    nav.append(h('button', { type: 'button', onclick: () => go('login') }, t("alreadyClient")));
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
      !logged && !S.snap.profile.monthly ? h('div', { class: 'hero' }, h('p', { class: 'eyebrow' }, t("heroEyebrow")), h('h1', null, t("heroTitle")), h('p', null, t("heroIntro"))) : null,
      h('p',{class:'demo-banner'},t('syntheticData')),
      h('div', { class: 'grid' }, chatCard(), h('aside',{class:'side'},activityPanel(),logged ? sideAccount() : sideChat())));
  }
  app.replaceChildren(view);
  const msgs = document.getElementById('msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function activityPanel() {
  const usage=S.agent.usage || {};
  return h('details',{id:'activity',class:'card activity',open: S.activityOpen ?? (S.config.demoMode && !matchMedia('(max-width: 600px)').matches),
    ontoggle: event => { S.activityOpen = event.currentTarget.open; }},
    h('summary',null,t('activity'),' · ',h('span',{class:'mode'},S.agent.mode)),
    h('p',{class:'disc'},S.pending?t('working'):t('activityExplanation')),
    S.pending ? h('p',{role:'status',class:'progress-live'},
      t('elapsed',{seconds:Math.floor((S.progress?.elapsedMs || 0)/1000)}),
      h('ol',null,(S.progress?.events || []).filter(event=>['tool_start','provider_start','provider_retry','fallback'].includes(event.type))
        .map(event=>h('li',null,event.type==='tool_start'?t('progress_'+event.tool)
          :event.type==='fallback'?t('progress_fallback'):event.type==='provider_retry'?t('progress_retry'):t('progress_provider'))))) : null,
    h('p',null,t('tokens')+': '+(usage.complete===false?t('unknownUsage'):((usage.inputTokens || 0)+(usage.outputTokens || 0))), ' · ',t('estimatedCost')+': '+(S.agent.estimatedCostUsd==null?t('unpriced'):'$'+S.agent.estimatedCostUsd.toFixed(6))),
    S.agent.fallbackReason && !S.agent.refusalReason ? h('p', { class: 'disc', role: 'status' },
      t(['auth', 'timeout', 'throttled', 'guard_rejection'].includes(S.agent.fallbackReason)
        ? 'fallback_' + S.agent.fallbackReason : 'fallbackProvider')) : null,
    !S.pending && !S.agent.trace?.length ? h('p', { class: 'disc' }, t('emptyActivity')) : null,
    S.agent.trace?.length ? h('p', { class: 'timeline-head' },
      t('timelineMode') + ': ' + (S.agent.mode === 'agent' ? t('modeAgent') : t('modeOffline'))
      + (S.agent.fallbackReason ? ' · ' + t('timelineFallback') + ': ' + S.agent.fallbackReason : '')
      + ' · ' + t('timelineProviderCalls') + ': ' + (S.agent.providerCalls || []).length
      + ' · ' + t('timelineSteps') + ': ' + S.agent.trace.filter(item => item.kind !== 'provider').length) : null,
    decisionGraph(S.agent.decisions),
    h('ol',{class:'timeline'},(S.agent.trace || []).map(item=>{
      const why = item.why ? t('why_' + item.why) : '';
      const input = JSON.stringify(item.input || {});
      return h('li',{class:'tl-step' + (item.error ? ' tl-error' : '')},
        h('span',{class:'tl-badge'},item.kind === 'provider' ? '!' : String(item.step ?? '')),
        h('div',{class:'tl-body'},
          h('b',null,item.tool), item.iteration ? h('small',null,' · '+t('timelineIteration')+' '+item.iteration+(item.source?' · '+item.source:'')) : null,
          why ? h('p',{class:'tl-why'},t('timelineWhy')+': '+(why === 'why_' + item.why ? item.why : why)) : null,
          h('code',null,input.length > 140 ? input.slice(0, 140) + '…' : input),
          item.guard ? h('p',{class:'tl-guard',role:'note'},t('timelineGuard')+': '+item.guard+' · '+t('guard_'+item.guard)) : null,
          item.result ? h('p',{class:'tl-result'},t('timelineResult')+': '+item.result) : null,
          h('span',null,(item.error?t('rejected'):t('completed'))+' · '+item.summary+' · '+item.ms+' ms')));
    })));
}

// Vertical decision flow: intent, decision diamonds (question = answer), tools, outcome.
function decisionGraph(nodes) {
  if (!nodes?.length) return null;
  const label = (prefix, value) => { const text = t(prefix + value); return text === prefix + value ? value : text; };
  return h('div', { class: 'dgraph', role: 'group', 'aria-label': t('decisionGraph') },
    h('p', { class: 'timeline-head' }, t('decisionGraph')),
    h('ol', null, nodes.map(node => h('li', { class: 'dg-node dg-' + node.kind + (node.error ? ' tl-error' : '') },
      node.kind === 'decision' ? h('span', { class: 'dg-diamond', 'aria-hidden': 'true' }, '◆') : null,
      h('b', null, node.kind === 'tool' ? node.question : label('dq_', node.question)),
      node.kind === 'tool' ? null : h('span', null, ': ' + label('da_', node.answer)),
      node.kind === 'decision' && node.outcome ? h('small', null, ' → ' + label('da_', node.outcome)) : null,
      node.kind === 'decision' && node.notTaken
        ? h('small', { class: 'dg-skip', title: t('decisionNotTaken') }, ' ✕ ' + label('da_', node.notTaken)) : null))));
}

function agentCard(card) {
  const secondary = ['budget', 'capacity', 'compare', 'simulation', 'risk_set'].includes(card.type);
  const content = agentCardContent(card);
  if (!secondary) return content;
  return h('details', { class: 'card-detail', 'aria-label': t('card_' + card.type) },
    h('summary', { title: t('cardDetails') }, t('card_' + card.type)), content);
}

function agentCardContent(card) {
  const type=card.type;
  const box=h('section',{class:'agent-card '+type,'aria-label':t('card_'+type)},h('h3',null,t('card_'+type)));
  const row=(label,value)=>h('div',{class:'kv'},h('span',null,label),h('b',null,value));
  const money=value=>fmt(value)+' lei';
  const required = { budget: 'categories', capacity: 'asOf', compare: 'products', simulation: 'sim',
    plan_proposal: 'proposal', what_if: 'after', rules: 'rules' }[type];
  if (card.error || required && !card[required]) {
    box.append(h('p', { role: 'status' }, t(card.error ? 'cardError' : 'cardEmpty')));
    return box;
  }
  if(type==='budget') {
    box.append(row(t('monthlyIncome'),money(card.monthlyIncome)),row(t('monthlySpend'),money(card.monthlySpend)),row(t('surplus'),money(card.monthlySurplus)));
    const max=Math.max(1,...Object.values(card.categories));
    for(const [category,value] of Object.entries(card.categories)) box.append(h('div',{class:'budget-bar'},
      h('span',null,t('category_'+category)),h('span',null,money(value/card.months)),
      h('meter',{min:0,max,value,'aria-label':t('category_'+category)},String(value))));
    box.append(h('h4',null,t('recurring')),h('ul',null,card.recurringBills.map(bill=>h('li',null,bill.merchant+' · '+money(bill.monthly)))));
  } else if(type==='capacity') {
    box.append(row(t('asOf'),card.asOf));
    for(const [key,label] of [['balance','balance'],['buffer','buffer'],['obligationTotal','obligations'],['cashFlowLowReserve','lowReserve'],['idleCash','idleCash'],['safeMonthly','safeMonthly']]) box.append(row(t(label),money(card[key])));
    if(!card.bufferReady) box.append(h('p',null,t('bufferPriority')),row(t('microSaving'),money(card.microSaving)),row(t('readyMonths'),String(card.readyInMonths)));
    if(card.ladder) box.append(h('h4',null,t('ladder')),card.ladder.map(rung=>row(t('monthNumber',{month:rung.month}),money(rung.amount))));
  } else if(type==='compare') {
    const table=h('table',{class:'comparison'},h('thead',null,h('tr',null,[t('product'),t('fit'),t('why')].map(label=>h('th',{scope:'col'},label)))),h('tbody',null,card.products.map(product=>h('tr',null,
      h('th',{scope:'row'},t('product_'+product.id)),
      h('td',null,product.eligible?t('fits'):t('notFit')),
      h('td',null,h('ul',null,[...product.why,...product.whyNot].map(reason=>h('li',null,t('reason_'+reason)))),h('small',null,t('liquidity')+': '+t('liquidity_'+product.liquidity)+' · '+t('minimumHorizon')+': '+product.minHorizonYears.toLocaleString(I18n.locale)+' · '+t('annualFee')+': '+product.annualFeePct.toLocaleString(I18n.locale)+'%'+(product.protection?' · '+t('protection')+': '+t('protection_'+product.protection):'')))))));
    box.append(h('div',{class:'table-wrap',tabindex:0,'aria-label':t('comparisonScroll')},table),h('p',{class:'disc'},t('illustrativeFees')));
  } else if(type==='rules') {
    // Rule text is tool data: rendered through text nodes only.
    box.append(h('p',null,t('rulesTopic_'+card.topic)+(card.product?' · '+t('product_'+card.product.id)+' · '+t('protection_'+card.product.protection):'')),
      h('ul',{class:'rules-list'},card.rules.map(rule=>h('li',null,h('b',null,rule.title),h('p',null,rule.statement),
        rule.exception?h('p',{class:'disc'},t('ruleException')+': '+rule.exception):null,
        h('small',null,t('ruleSource')+': '+rule.source+' · '+t('ruleVerify',{asOf:rule.asOf}))))),
      card.disclaimer?h('p',{class:'disc'},card.disclaimer):null);
  } else if(type==='simulation') {
    box.append(row(t('paidIn'),money(card.sim.contributed)),row(t('fund'),money(card.sim.fund)),row(t('cashReal'),money(card.sim.cashReal)),row(t('stressCase'),money(card.stressFund)),lineChart(card.sim),h('p',{class:'disc'},t('assumptions',{inflation:(card.sim.assumptions.inflation*100).toLocaleString(I18n.locale),rate:(card.sim.assumptions.fundReturn*100).toLocaleString(I18n.locale)})));
  } else if(type==='plan_proposal') {
    const p=card.proposal,confirmed=S.me?.portfolio?.plans?.some(plan=>plan.proposalId===p.id);
    const stale=p.version!==S.snap.proposalVersion || Date.now()>=p.expires;
    box.append(h('p',null,t('product_'+p.productId)),
      p.replacesPlanId ? row(t('previousMonthly'),money(p.previousMonthly)) : null,
      row(t('monthlyAmount'),money(p.monthly)),row(t('expires'),new Date(p.expires).toLocaleTimeString(I18n.locale)),
      h('p',{class:'disc'},t(confirmed?'planActiveNoDebit':p.replacesPlanId?'replacementOnly':'proposalOnly')));
    if (p.preview) {
      box.append(h('p', null, t('previewOnly')), h('div', { class: 'proposal-actions' },
        h('button', { class: 'btn', disabled: stale || S.pending, onclick: () => go('login') }, t('loginTitle')),
        h('button', { class: 'btn ghost', disabled: stale || S.pending, onclick: () => go('signup') }, t('openAccount'))));
      return box;
    }
    const fail=h('p',{class:'err',role:'status'});
    box.append(h('div',{class:'proposal-actions'},h('button',{class:'btn',disabled:confirmed || stale || S.pending,onclick:async event=>{
      const button=event.currentTarget;button.disabled=true;
      try {
        const result=await api('POST','/api/proposals/'+encodeURIComponent(p.id)+'/confirm',{confirmed:true});
        S.me={...S.me,...result};S.snap.messages.push(...result.messages);render();
      } catch(error) {fail.textContent=error.message;button.disabled=false;}
    }},confirmed?t('active'):stale?t('superseded'):t('confirm')),
    h('button',{class:'btn ghost',disabled:S.pending,onclick:()=>{const input=document.getElementById('msg-input');input.value=t('changePrompt');input.focus();}},t('change'))),fail);
  } else if(type==='what_if') {
    box.append(h('p',null,t('hypothetical')),row(t('horizonDiff'),card.previousHorizonYears+' → '+card.horizonYears),row(t('monthlyDiff'),money(card.before.safeMonthly)+' → '+money(card.after.safeMonthly)),row(t('idleDiff'),money(card.before.idleCash)+' → '+money(card.after.idleCash)),h('p',null,t('oldProposalInvalid')));
  } else if(type==='auth') box.append(h('button',{class:'btn',onclick:()=>go(card.kind==='signup'?'signup':'login')},t(card.kind==='signup'?'openAccount':'loginTitle')));
  else if(type==='handoff') box.append(h('p',null,t('adviserRequested')));
  else if(type==='risk_set') box.append(h('p',null,t('risk_'+card.risk)));
  return box;
}

boot();
