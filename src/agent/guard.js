'use strict';
// Runs before EVERY tool execution (model loop and offline planner). A rejected call is never
// executed; the rejection is returned to the model as the tool result.
const { SPECS, NOT_MODEL_CALLABLE, PRECONDITIONS, valid } = require('../tools');
const CODES = Object.freeze(['UNKNOWN_TOOL', 'NOT_MODEL_CALLABLE', 'INVALID_ARGS', 'PRECONDITION_NOT_MET', 'DUPLICATE_CALL']);
const CHECKS = {
  risk_answered: ({ journey }) => Boolean(journey?.coach?.profile?.risk),
  capacity_computed: ({ results }) => Boolean(results.find_savings_capacity && !results.find_savings_capacity.error),
};
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}
const key = call => call.name + ' ' + canonical(call.input ?? {});
const reject = (code, detail) => ({ status: 'REJECTED', code, detail });
function check({ call, specs = SPECS, results = {}, journey, seen = new Set() }) {
  const name = call?.name;
  const spec = specs.find(item => item.name === name);
  if (!spec) {
    return NOT_MODEL_CALLABLE.includes(name)
      ? reject('NOT_MODEL_CALLABLE', 'This operation needs explicit customer confirmation in the app; the model cannot call it.')
      : reject('UNKNOWN_TOOL', 'No tool with that name exists. Use only the listed tools.');
  }
  if (!valid(call.input ?? {}, spec.inputSchema)) {
    return reject('INVALID_ARGS', 'Arguments do not match the tool schema. Customer identifiers and unknown fields are never accepted.');
  }
  const missing = (PRECONDITIONS[name] || []).filter(id => !CHECKS[id]({ results, journey }));
  if (missing.length) return reject('PRECONDITION_NOT_MET', 'Missing precondition: ' + missing.join(', ') + '.');
  if (seen.has(key(call))) return reject('DUPLICATE_CALL', 'An identical call already ran this turn. Reuse its result.');
  return null;
}
// Records a successfully executed call so an identical repeat is rejected as a duplicate.
function remember(seen, call) { seen.add(key(call)); }
module.exports = { check, remember, canonical, CODES };
