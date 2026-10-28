'use strict';
const { loadLocalEnv } = require('../src/config');
const { select } = require('../src/agent/provider');
const { Store } = require('../src/store');
const { createApp } = require('../src/app');

const PROMPTS = [
  ['ioana', 'I have some spare cash, what should I do?'],
  ['andrei', "I don't know where to start saving"],
  ['mihai', 'Help me plan around my tax bill and irregular income'],
  ['elena', 'Help plan my business surplus after payroll'],
  ['ioana', 'I need the money for a car in 2 years'],
];

async function main() {
  const env = loadLocalEnv();
  const provider = select({ env });
  const missingModel = provider?.name === 'bedrock' && (!env.AWS_REGION || !env.BEDROCK_MODEL_ID);
  if (!provider || missingModel) {
    console.error('Live smoke NOT RUN: configure a real provider key and its model first. Five prompts are unrun.');
    console.error('Bedrock needs AWS_BEARER_TOKEN_BEDROCK, AWS_REGION and the exact BEDROCK_MODEL_ID in secure settings.');
    console.error('With Node 24 and the managed proxy, start with NODE_USE_ENV_PROXY=1 npm run smoke:live.');
    process.exitCode = 2;
    return;
  }
  const store = new Store(null);
  const server = createApp({ store, env: { ...env, DEMO_MODE: '1' } });
  const clients = new Map();
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    async function post(persona, route, body) {
      const response = await fetch(base + route, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: clients.get(persona) || '' },
        body: JSON.stringify(body || {}),
      });
      if (response.headers.get('set-cookie')) clients.set(persona, response.headers.get('set-cookie').split(';')[0]);
      const data = await response.json();
      if (!response.ok) throw new Error('Local app HTTP ' + response.status);
      return data;
    }
    const rows = [];
    for (const [persona, prompt] of PROMPTS) {
      if (!clients.has(persona)) {
        await post(persona, '/api/journey', {});
        await post(persona, '/api/persona', { persona });
      }
      const result = await post(persona, '/api/agent', { text: prompt });
      const pass = result.mode === 'agent' && ['passed', 'retried'].includes(result.guardOutcome);
      const tools = result.trace.filter(item => item.kind !== 'provider').map(item => item.tool);
      rows.push({ persona, result: pass ? 'PASS' : 'FAIL', mode: result.mode,
        tools: tools.join(' → '), totalMs: result.latencyMs, guard: result.guardOutcome });
      console.log(JSON.stringify({ persona, mode: result.mode, tools, totalMs: result.latencyMs,
        providerCalls: result.providerCalls, usage: result.usage, guard: result.guardOutcome,
        error: result.fallbackReason, hint: result.fallbackHint, estimatedCostUsd: result.estimatedCostUsd }, null, 2));
      if (!pass) process.exitCode = 1;
    }
    console.table(rows);
    console.log('Synthetic local app only; no plan confirmation or bank operation was invoked.');
  } finally { await new Promise(resolve => server.close(resolve)); }
}

main().catch(() => { console.error('Live smoke failed in the local harness. Check secure configuration.'); process.exitCode = 1; });
