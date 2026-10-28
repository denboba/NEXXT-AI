'use strict';
const root = document.getElementById('root');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (x) => (x == null ? '' : `${(x * 100).toFixed(x >= 0.1 ? 0 : 1)}%`);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
let source = '';
let token = ''; try { token = sessionStorage.getItem('adminToken') || ''; } catch {}

async function get(path) {
  const res = await fetch(path, { headers: token ? { 'x-admin-token': token } : {} });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d.error || 'Failed'), { status: res.status });
  return d;
}

async function load() {
  try {
    const [m, hd] = await Promise.all([get('/api/admin/metrics' + (source ? `?source=${encodeURIComponent(source)}` : '')), get('/api/admin/handoffs')]);
    draw(m, hd.handoffs);
  } catch (e) {
    if (e.status === 401) return askToken(e.message);
    root.replaceChildren(h('p', { class: 'err' }, e.message));
  }
}

function askToken(msg) {
  const input = h('input', { type: 'password', placeholder: 'Admin token', 'aria-label': 'Admin token' });
  root.replaceChildren(h('section', { class: 'card narrow' }, h('h2', null, 'Admin access'), h('p', { style: 'color:var(--mute)' }, msg),
    h('form', { onsubmit: (e) => { e.preventDefault(); token = input.value; try { sessionStorage.setItem('adminToken', token); } catch {} load(); } },
      h('div', { class: 'field' }, input), h('button', { class: 'btn', type: 'submit' }, 'Open'))));
}

function draw(m, handoffs) {
  const top = m.steps[0].count, last = m.steps[m.steps.length - 1].count;
  const select = h('select', { 'aria-label': 'Filter by source', onchange: (e) => { source = e.target.value; load(); } },
    h('option', { value: '' }, 'All sources'), m.sources.map((s) => h('option', { value: s, selected: s === source ? 'selected' : null }, s)));
  select.value = source;
  root.replaceChildren(
    h('div', { class: 'tools' }, h('b', null, 'Channel'), select),
    h('div', { class: 'kpis' },
      h('div', { class: 'card kpi' }, h('b', null, fmt(top)), h('span', null, 'Ad clicks')),
      h('div', { class: 'card kpi' }, h('b', null, `${fmt(m.newCustomers)} / ${fmt(m.existingClients)}`), h('span', null, 'New customers / existing clients')),
      h('div', { class: 'card kpi yellow' }, h('b', null, fmt(last)), h('span', null, `First debits executed${top ? ` · ${pct(last / top)} of clicks` : ''}`)),
      h('div', { class: 'card kpi' }, h('b', null, fmt(m.handoffs)), h('span', null, 'Adviser call requests'))),
    h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Funnel: ad click to first investment'),
      m.steps.map((s, i) => h('div', { class: `frow ${i === m.steps.length - 1 ? 'last' : ''}` },
        h('b', null, `${i + 1} · ${s.label}`),
        h('div', { class: 'bar' }, h('i', { style: `width:${top ? Math.max(0, s.ofTop * 100) : 0}%` })),
        h('div', null, h('div', { class: 'n' }, fmt(s.count)), h('small', null, i ? `${pct(s.ofPrevious)} of previous · ${pct(s.ofTop)} of clicks` : 'start'))))),
    h('section', { class: 'card', style: 'margin-top:20px' }, h('p', { class: 'eyebrow' }, 'Adviser call requests'),
      handoffs.length ? handoffs.map((x) => h('details', { class: 'ho' }, h('summary', null, `${x.name || 'Visitor'} · ${x.phone} · ${new Date(x.at).toLocaleString()}`),
        h('pre', null, x.transcript.map((t) => `${t.role === 'user' ? 'Customer' : 'Coach'}: ${t.text}`).join('\n')))) : h('p', { style: 'color:var(--mute)' }, 'None yet.')));
}

load();
setInterval(load, 10000);
