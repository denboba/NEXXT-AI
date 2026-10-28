# Scale evidence

Measured with `npm run loadtest -- --concurrency=10 --journeys=20`.

```json
{
  "timestamp": "2026-10-28T15:51:54.958Z",
  "baseCommit": "e9e173f850b7f0c120a22bb98b3d907060b39f9d",
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
  "elapsedMs": 159.34,
  "requestsPerSecond": 502.07,
  "requestLatencyMs": {
    "p50": 8.68,
    "p95": 70.29,
    "p99": 81.65
  },
  "statuses": {
    "200": 80
  },
  "failures": {},
  "rateLimitsEnabled": true,
  "scope": "Loopback HTTP; load generator and app share one Node process. Temporary JSON-file store; no provider, TLS, browser, real bank, or activation load."
}
```

These are local measurements, not a production capacity claim. Twenty journeys exercise eighty real HTTP requests through the offline three-question path. The latency percentiles include errors when present. An incomplete journey makes the runner exit nonzero. The current shared-IP chat limiter allows 60 chat requests per minute; larger bursts from this single loopback IP hit HTTP 429. Do not bypass it to advertise higher throughput. This short run does not establish steady-state throughput or concurrent-customer capacity.

## Scaling path and current limits

- `Store` exposes `db`, `save()` and `flush()`, but application code still mutates the in-process object directly. A database migration needs scoped repository methods, transactions, uniqueness constraints and idempotency before horizontal scaling. JSON flush rewrites the complete dataset; concurrent writers are unsupported.
- HTTP handlers can move behind a load balancer after session, onboarding and rate-limit state moves to shared storage. Currently the limiter is process-local and trusts the socket IP; do not trust arbitrary forwarded IP headers.
- Provider deployments need bounded tool loops, per-user and global budgets, timeouts and retry/backoff for rate limits. Those agent features are not implemented in this baseline. Scripted answers continue without a provider.
- Cache deterministic simulations by amount, horizon and assumptions version. Never share cached customer data across sessions. Keep authorization outside the cache and confirm every proposed plan through the server.

## Rate-limit stress check

The separate run below intentionally exceeds the shared-IP chat budget. It returned exit status 1; the 12 HTTP 429 responses are failures, not successful conversations. Source at measurement: the loadtest working tree based on the commit above.

```text

> nexxt-ai-investment-coach@1.0.0 loadtest
> node scripts/loadtest.js --concurrency=30 --journeys=30

{
  "timestamp": "2026-10-28T15:52:14.942Z",
  "commit": "not supplied",
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
  "completed": 18,
  "failed": 12,
  "requests": 102,
  "elapsedMs": 237.64,
  "requestsPerSecond": 429.22,
  "requestLatencyMs": {
    "p50": 8.25,
    "p95": 183.64,
    "p99": 193.73
  },
  "statuses": {
    "200": 90,
    "429": 12
  },
  "failures": {
    "HTTP 429": 12
  },
  "rateLimitsEnabled": true,
  "scope": "Loopback HTTP; load generator and app share one Node process. Temporary JSON-file store; no provider, TLS, browser, real bank, or activation load."
}
```
