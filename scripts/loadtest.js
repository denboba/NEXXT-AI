'use strict';
// Dependency-free, isolated HTTP load generator. It never calls a model provider
// or touches the demo database. Existing server rate limits remain enabled.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { createApp } = require('../src/app');

function option(name, fallback) {
  const arg = process.argv.slice(2).find(value => value.startsWith('--' + name + '='));
  const value = arg ? Number(arg.split('=')[1]) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > 10000) throw new Error(name + ' must be an integer from 1 to 10000');
  return value;
}
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
const round = n => n === null ? null : Number(n.toFixed(2));

async function main() {
  const concurrency = option('concurrency', 10), journeys = option('journeys', 20);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexxt-loadtest-'));
  const store = new Store(path.join(dir, 'db.json'));
  const server = createApp({ store, env: { DEMO_MODE: '1', ADMIN_TOKEN: 'loadtest-only' } });
  const timings = [], statuses = {}, failures = {};
  let completed = 0, next = 0;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:' + server.address().port;
    const start = performance.now();
    async function journey(index) {
      let cookie = '';
      async function post(route, body) {
        const began = performance.now();
        let response;
        try {
          response = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
          const data = await response.json();
          const setCookie = response.headers.get('set-cookie');
          if (setCookie) cookie = setCookie.split(';')[0];
          statuses[response.status] = (statuses[response.status] || 0) + 1;
          if (response.status !== 200) throw new Error('HTTP ' + response.status);
          return data;
        } finally { timings.push(performance.now() - began); }
      }
      await post('/api/journey', { source: 'loadtest', campaign: 'offline' });
      const persona=['ioana','andrei','mihai','elena'][index%4];
      await post('/api/persona',{persona});
      await post('/api/agent',{text:"I don't know where to start"});
      const result=await post('/api/agent',{text:['andrei','elena'].includes(persona)?'low':'medium'});
      assert.equal(result.mode,'offline');
      assert.ok(result.cards.some(card=>card.type==='capacity'),'capacity card is required');
      const proposal=result.cards.find(card=>card.type==='plan_proposal')?.proposal;
      assert.ok(proposal,'journey must reach a validated proposal');
      if(persona==='andrei') assert.equal(proposal.productId,'buffer-savings');
      completed++;
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, journeys) }, async () => {
      while (next < journeys) {
        const index=next++;
        try { await journey(index); } catch (error) { failures[error.message] = (failures[error.message] || 0) + 1; }
      }
    }));
    store.flush();
    const elapsedMs = performance.now() - start;
    const readLimit = file => { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return 'unavailable'; } };
    const report = {
      timestamp: new Date().toISOString(), baseCommit: process.env.LOADTEST_COMMIT || 'not supplied',
      node: process.version, platform: os.platform() + '/' + os.arch(), cpu: os.cpus()[0]?.model,
      visibleLogicalCpus: os.cpus().length, availableParallelism: os.availableParallelism(),
      hostMemoryMiB: Math.round(os.totalmem() / 1024 ** 2), cgroupCpuMax: readLimit('/sys/fs/cgroup/cpu.max'), cgroupMemoryMax: readLimit('/sys/fs/cgroup/memory.max'),
      concurrency, journeys, completed, failed: journeys - completed, requests: timings.length,
      elapsedMs: round(elapsedMs), requestsPerSecond: round(timings.length / (elapsedMs / 1000)),
      requestLatencyMs: { p50: round(percentile(timings, .50)), p95: round(percentile(timings, .95)), p99: round(percentile(timings, .99)) },
      statuses, failures, rateLimitsEnabled: true,
      scope: 'Four synthetic personas; profile/spending/capacity/comparison/proposal through the offline agent endpoint. Loopback HTTP; generator and app share one Node process. Temporary JSON-file store. No provider, TLS, browser, real bank, confirmation or debit load.'
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.argv.includes('--write-report')) {
      const destination = path.join(__dirname, '../docs/SCALE.md');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, '# Scale evidence\n\nMeasured with `npm run loadtest -- --concurrency=' + concurrency + ' --journeys=' + journeys + '`.\n\n```json\n' + JSON.stringify(report, null, 2) + '\n```\n\n' +
        'These are local measurements of the loadtest working tree based on the recorded base commit, not a production capacity claim. Each journey uses four real HTTP requests, visits one of the four personas, analyzes context and reaches a validated proposal through the offline planner. It does not confirm a plan or execute a debit. The latency percentiles include errors when present. An incomplete journey makes the runner exit nonzero. Current shared-IP limits allow 20 persona switches and 60 agent requests per minute; larger bursts from this single loopback IP hit HTTP 429. Do not bypass these limits to advertise higher throughput. This short run does not establish steady-state throughput or concurrent-customer capacity.\n\n' +
        '## Scaling path and current limits\n\n' +
        '- `Store` exposes `db`, `save()` and `flush()`, but application code still mutates the in-process object directly. A database migration needs scoped repository methods, transactions, uniqueness constraints and idempotency before horizontal scaling. JSON flush rewrites the complete dataset; concurrent writers are unsupported.\n' +
        '- HTTP handlers can move behind a load balancer after session, onboarding and rate-limit state moves to shared storage. Currently the limiter is process-local and trusts the socket IP; do not trust arbitrary forwarded IP headers.\n' +
        '- Provider calls have six tool iterations, a twelve-second deadline and a total-token cap per turn. Agent requests have a session rate limit. Production still needs shared global/per-user monetary budgets and provider-specific retry/backoff and circuit breakers; current errors fall back immediately. Offline tools continue without a provider.\n' +
        '- Cache deterministic simulations by amount, horizon and assumptions version. Never share cached customer data across sessions. Keep authorization outside the cache and confirm every proposed plan through the server.\n');
    }
    if (completed !== journeys) process.exitCode = 1;
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (store.timer) clearTimeout(store.timer);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
