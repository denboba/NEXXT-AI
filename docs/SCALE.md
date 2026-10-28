# Scale evidence

Measured with `npm run loadtest -- --concurrency=10 --journeys=20`.

```json
{
  "timestamp": "2026-10-28T16:49:21.146Z",
  "baseCommit": "78e94d2dd2ad920fa0d3b1c4a7f36b638600593d",
  "node": "v24.19.0",
  "platform": "linux/x64",
  "cpu": "AMD EPYC 9V74 80-Core Processor",
  "visibleLogicalCpus": 5,
  "availableParallelism": 4,
  "hostMemoryMiB": 34088,
  "cgroupCpuMax": "400000 100000",
  "cgroupMemoryMax": "34359738368",
  "concurrency": 10,
  "journeys": 20,
  "completed": 20,
  "failed": 0,
  "requests": 80,
  "elapsedMs": 219.5,
  "requestsPerSecond": 364.47,
  "requestLatencyMs": {
    "p50": 13.6,
    "p95": 58.93,
    "p99": 83.78
  },
  "statuses": {
    "200": 80
  },
  "failures": {},
  "rateLimitsEnabled": true,
  "scope": "Four synthetic personas; profile/spending/capacity/comparison/proposal through the offline agent endpoint. Loopback HTTP; generator and app share one Node process. Temporary JSON-file store. No provider, TLS, browser, real bank, confirmation or debit load."
}
```

These are local measurements of the loadtest working tree based on the recorded base commit, not a production capacity claim. Each journey uses four real HTTP requests, visits one of the four personas, analyzes context and reaches a validated proposal through the offline planner. It does not confirm a plan or execute a debit. The latency percentiles include errors when present. An incomplete journey makes the runner exit nonzero. Current shared-IP limits allow 20 persona switches and 60 agent requests per minute; larger bursts from this single loopback IP hit HTTP 429. Do not bypass these limits to advertise higher throughput. This short run does not establish steady-state throughput or concurrent-customer capacity.

## Scaling path and current limits

- `Store` exposes `db`, `save()` and `flush()`, but application code still mutates the in-process object directly. A database migration needs scoped repository methods, transactions, uniqueness constraints and idempotency before horizontal scaling. JSON flush rewrites the complete dataset; concurrent writers are unsupported.
- HTTP handlers can move behind a load balancer after session, onboarding and rate-limit state moves to shared storage. Currently the limiter is process-local and trusts the socket IP; do not trust arbitrary forwarded IP headers.
- Provider calls have six tool iterations, a twelve-second deadline and a total-token cap per turn. Agent requests have a session rate limit. Production still needs shared global/per-user monetary budgets and provider-specific retry/backoff and circuit breakers; current errors fall back immediately. Offline tools continue without a provider.
- Cache deterministic simulations by amount, horizon and assumptions version. Never share cached customer data across sessions. Keep authorization outside the cache and confirm every proposed plan through the server.

## Rate-limit stress check

The separate run below deliberately exceeded the shared-IP persona budget. It exited 1; the ten HTTP 429 responses and incomplete journeys are failures. This earlier run used the same rate limits, prior to final guard/protocol refinements; its embedded timestamp is preserved.

```text

> nexxt-ai-investment-coach@1.0.0 loadtest
> node scripts/loadtest.js --concurrency=30 --journeys=30

{
  "timestamp": "2026-10-28T16:27:54.387Z",
  "baseCommit": "not supplied",
  "node": "v24.19.0",
  "platform": "linux/x64",
  "cpu": "AMD EPYC 9V74 80-Core Processor",
  "visibleLogicalCpus": 5,
  "availableParallelism": 4,
  "hostMemoryMiB": 34088,
  "cgroupCpuMax": "400000 100000",
  "cgroupMemoryMax": "34359738368",
  "concurrency": 30,
  "journeys": 30,
  "completed": 20,
  "failed": 10,
  "requests": 100,
  "elapsedMs": 251.71,
  "requestsPerSecond": 397.28,
  "requestLatencyMs": {
    "p50": 12.43,
    "p95": 183.19,
    "p99": 200.65
  },
  "statuses": {
    "200": 90,
    "429": 10
  },
  "failures": {
    "HTTP 429": 10
  },
  "rateLimitsEnabled": true,
  "scope": "Four synthetic personas; profile/spending/capacity/comparison/proposal through the offline agent endpoint. Loopback HTTP; generator and app share one Node process. Temporary JSON-file store. No provider, TLS, browser, real bank, confirmation or debit load."
}
npm notice
npm notice New major version of npm available! 11.9.0 -> 12.2.1
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.1
npm notice To update run: npm install -g npm@12.2.1
npm notice
```
