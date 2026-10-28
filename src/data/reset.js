'use strict';
const { DEFINITIONS, seed } = require('./personas');

function reset(store, currentJourneyId) {
  const db = store.db;
  const users = new Set(DEFINITIONS.map(persona => 'persona-' + persona.id));
  const journeys = new Set(Object.values(db.journeys)
    .filter(journey => users.has(journey.userId) || users.has(journey.sampleCustomerId))
    .map(journey => journey.id));
  journeys.add(currentJourneyId);
  for (const key of ['plans', 'proposals', 'accounts', 'customers', 'users', 'confirmations']) {
    for (const [id, record] of Object.entries(db[key] || {})) {
      if (users.has(record.userId) || users.has(id) || journeys.has(record.journeyId)) delete db[key][id];
    }
  }
  db.ledger = db.ledger.filter(entry => !users.has(entry.userId));
  db.events = db.events.filter(entry => !journeys.has(entry.journeyId));
  db.turns = db.turns.filter(entry => !journeys.has(entry.journeyId));
  db.handoffs = db.handoffs.filter(entry => !journeys.has(entry.journeyId));
  for (const key of ['loginRequests', 'onboardings']) {
    for (const [id, record] of Object.entries(db[key])) {
      if (users.has(record.userId) || journeys.has(record.journeyId)) delete db[key][id];
    }
  }
  for (const id of journeys) delete db.journeys[id];
  seed(store);
  db.audit.push({ at: new Date().toISOString(), personaId: 'demo', decision: 'reset' });
  store.save();
}

module.exports = { reset };
