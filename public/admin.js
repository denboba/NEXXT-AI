'use strict';
const t = (key, values) => I18n.t(key, values);
const root = document.getElementById('root');
const fmt = (n) => Math.round(n).toLocaleString(I18n.locale);
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
  if (!res.ok) throw Object.assign(new Error(d.error || t("failed")), { status: res.status });
  return d;
}

async function load() {
  try {
    const [m, hd, agent] = await Promise.all([get('/api/admin/metrics' + (source ? `?source=${encodeURIComponent(source)}` : '')), get('/api/admin/handoffs'),get('/api/admin/agent-metrics'+(source?`?source=${encodeURIComponent(source)}`:''))]);
    draw(m, hd.handoffs, agent);
  } catch (e) {
    if (e.status === 401) return askToken(e.message);
    root.replaceChildren(h('p', { class: 'err' }, e.message));
  }
}

function askToken(msg) {
  const input = h('input', { type: 'password', placeholder: t("adminToken"), 'aria-label': t("adminToken") });
  root.replaceChildren(h('section', { class: 'card narrow' }, h('h2', null, t("adminAccess")), h('p', { style: 'color:var(--mute)' }, msg),
    h('form', { onsubmit: (e) => { e.preventDefault(); token = input.value; try { sessionStorage.setItem('adminToken', token); } catch {} load(); } },
      h('div', { class: 'field' }, input), h('button', { class: 'btn', type: 'submit' }, t("open")))));
}

function draw(m, handoffs, agent) {
  const top = m.steps[0].count, last = m.steps[m.steps.length - 1].count;
  const select = h('select', { 'aria-label': t("filterSource"), onchange: (e) => { source = e.target.value; load(); } },
    h('option', { value: '' }, t("allSources")), m.sources.map((s) => h('option', { value: s, selected: s === source ? 'selected' : null }, s)));
  select.value = source;
  root.replaceChildren(
    h('div', { class: 'tools' }, h('b', null, t("channel")), select),
    h('div', { class: 'kpis' },
      h('div', { class: 'card kpi' }, h('b', null, fmt(top)), h('span', null, t("adClicks"))),
      h('div', { class: 'card kpi' }, h('b', null, `${fmt(m.newCustomers)} / ${fmt(m.existingClients)}`), h('span', null, t("customerCounts"))),
      h('div', { class: 'card kpi yellow' }, h('b', null, fmt(last)), h('span', null, t("firstDebits") + (top ? " · " + t("clickShare", {percent:pct(last/top)}) : ""))),
      h('div', { class: 'card kpi' }, h('b', null, fmt(m.handoffs)), h('span', null, t("handoffs")))),
    h('section', { class: 'card' }, h('p', { class: 'eyebrow' }, t("funnelTitle")),
      m.steps.map((s, i) => h('div', { class: `frow ${i === m.steps.length - 1 ? 'last' : ''}` },
        h('b', null, `${i + 1} · ${s.label}`),
        h('div', { class: 'bar' }, h('i', { style: `width:${top ? Math.max(0, s.ofTop * 100) : 0}%` })),
        h('div', null, h('div', { class: 'n' }, fmt(s.count)), h('small', null, i ? t("previousShare", {previous:pct(s.ofPrevious),top:pct(s.ofTop)}) : t("start")))))),
    agentSection(agent),
    h('section', { class: 'card', style: 'margin-top:20px' }, h('p', { class: 'eyebrow' }, t("handoffs")),
      handoffs.length ? handoffs.map((x) => h('details', { class: 'ho' }, h('summary', null, `${x.name || t("visitor")} · ${x.phone} · ${new Date(x.at).toLocaleString()}`),
        h('pre', null, x.transcript.map((message) => `${message.role === 'user' ? t("customer") : t("coachLabel")}: ${message.text}`).join('\n')))) : h('p', { style: 'color:var(--mute)' }, t("noneYet"))));
}

function agentSection(data) {
 const cost=value=>value==null?t('unpriced'):'$'+value.toFixed(6);
 const statistic=(label,value)=>h('div',{class:'kv'},h('span',null,label),h('b',null,value));
 return h('section',{class:'card',style:'margin-top:20px'},h('h2',null,t('agentMetrics')),
  statistic(t('conversations'),fmt(data.conversations)),
  statistic(t('modeSplit'),`agent ${data.modeSplit.agent} / offline ${data.modeSplit.offline}`),
  h('p',{class:'disc'},t('modeSplitDefinition')),
  statistic(t('avgTools'),data.averageToolCallsPerConversation.toFixed(2)),
  statistic(t('costConversation'),cost(data.estimatedModelCostPerConversationUsd)),
  statistic(t('costPlan'),cost(data.estimatedModelCostPerActivatedPlanUsd)),
  statistic(t('conversion'),data.confirmedPlans+' / '+data.proposals+' · '+(data.proposalToConfirmationRate==null?'—':pct(data.proposalToConfirmationRate))),
  h('h3',null,t('dailyConversations')),h('ul',null,Object.entries(data.conversationsPerDay).map(([day,count])=>h('li',null,day+' · '+count))),
  h('h3',null,t('topTools')),h('ol',null,data.topTools.map(item=>h('li',null,item.name+' · '+item.count))),
  h('h3',null,t('topRefusals')),h('ul',null,data.topRefusalReasons.map(item=>h('li',null,item.name+' · '+item.count))),
  h('details',null,h('summary',null,t('audit')),h('ul',null,data.audit.map(entry=>h('li',null,[entry.at,entry.personaId,entry.tool || '',entry.decision,entry.reason || ''].join(' · '))))));
}

I18n.init().then(() => { document.querySelector("header nav").append(I18n.selector(load)); load(); setInterval(load, 10000); });
