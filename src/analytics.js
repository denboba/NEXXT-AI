'use strict';
// Funnel events. Each journey records a stage once; the first time wins.
const STAGES = [
  ['ad_click', 'Ad click'],
  ['chat_started', 'Chat started'],
  ['questions_answered', '3 questions answered'],
  ['account_ready', 'Account opened / logged in'],
  ['plan_activated', 'Plan activated'],
  ['first_debit_executed', 'First debit executed'],
];

function track(store, journey, type, extra = {}) {
  const db = store.db;
  if (db.events.some((e) => e.journeyId === journey.id && e.type === type)) return false;
  db.events.push({ journeyId: journey.id, type, at: new Date().toISOString(), source: journey.source, campaign: journey.campaign, ...extra });
  store.save();
  return true;
}

function funnel(store, { source } = {}) {
  const events = store.db.events.filter((e) => !source || e.source === source);
  const reached = {};
  for (const [type] of STAGES) reached[type] = new Set();
  for (const e of events) if (reached[e.type]) reached[e.type].add(e.journeyId);
  const top = reached.ad_click.size || 0;
  let prev = null;
  const steps = STAGES.map(([type, label]) => {
    const count = reached[type].size;
    const step = { type, label, count, ofPrevious: prev === null ? null : prev ? count / prev : 0, ofTop: top ? count / top : 0 };
    prev = count;
    return step;
  });
  const accountEvents = events.filter((e) => e.type === 'account_ready');
  const sources = [...new Set(store.db.events.map((e) => e.source).filter(Boolean))];
  return {
    steps,
    sources,
    newCustomers: accountEvents.filter((e) => e.kind === 'new').length,
    existingClients: accountEvents.filter((e) => e.kind === 'existing').length,
    handoffs: store.db.handoffs.length,
  };
}

module.exports = { STAGES, track, funnel };
