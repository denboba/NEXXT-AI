# Implementation report

Branch: `agent-upgrade`, created from `origin/main` at `ad2f8bd9ebb5abd7f989d3643f261f7088d8f9df`. No commit was made to main. Existing deck, source PDF and history were preserved.

The tool-calling implementation and offline demo are complete and locally verified. Live-model quality and draft-PR creation remain externally blocked; they are not reported as passed.

## Work packages

| Package | Built and verified |
|---|---|
| W1 · Data | Seeded deterministic twelve-month transactions for Ioana, Andrei, Mihai and Elena; additive startup seeding; demo-only persona login; original client preserved. Income minus spend equals balance change. Eight products retain the original five, add two business products and add an accessible buffer-savings product. |
| W2 · Tools | Ten validated tools, session-owned context, spending/recurring subscriptions, capacity, ranked comparison, illustrative/stress simulation, hypothetical diffs, explicit risk recording, immutable expiring proposals, authentication cards and adviser handoff. Invalid/extra fields return errors; no customer selector is accepted. |
| W3 · Agent | Anthropic, OpenAI-compatible and Bedrock adapters; scripted test provider; six tool iterations, twelve-second deadline, reported/estimated token budget, last-twelve-message memory, one numeric-guard retry, then same-tool offline fallback. Customer-context chat and `/api/agent` preserve the existing response shape. Separate explicit confirmation is the only plan-creation path. |
| W4 · UI | Persona prompts, real tool cards, activity trace and true answering-mode badge, before/after diffs, Confirm/Change, stale-proposal disabling, keyboard focus and labeled sections. English/Romanian. Four personas verified at desktop and phone widths, including confirmation and debit. |
| W5 · Safety | Server risk/segment/horizon/capacity checks at proposal and confirmation; ownership/expiry/version checks; protected-reserve checks at debit; deficit-safe micro-saving; session rate limits and turn lock; control stripping, same-origin POST checks, refusal policy and redacted audit. Hypothetical bonuses never fund real proposals. |
| W6 · Eval | 42 authored scenarios, 22 safety cases, scripted-provider and live modes, tool/content/outcome assertions, conversion/product/buffer checks, aggregate latency/tool/cost output and committed report. Every scenario checks that the agent did not activate a plan. |
| W7 · Romanian | Frontend/server catalogs, browser default and header selector, legacy anonymous flow and persona planning, localized product copy and numbers, Romanian grouping/decimal regression tests and matching catalog-key tests. |
| W8 · Evidence | Dependency-free isolated load runner across four personas to a proposal, raw hardware/limits/latency data and failed rate-limit stress evidence. Admin retains the funnel and adds daily conversations, mode split, tool use, estimates per conversation/activated plan, conversion, tools/refusals and audit. |
| W9 · Judges | README submission, loop diagram, mock boundaries, provider/Bedrock setup, 60-second start and tested three-minute persona script; architecture/trust/failure docs; fresh screenshots captured with throwaway Playwright outside the checkout. |

## Run checks

```bash
npm run setup
npm start
npm test
npm run eval
npm run eval -- --live
npm run loadtest
npm run loadtest -- --concurrency=10 --journeys=20 --write-report
```

No `npm install` or build is required. `npm run setup` was tested both on an empty temporary directory and twice against existing configuration. It creates an ignored mode-0600 file with a random admin token only when absent. No token values were printed or committed. `package.json` has neither dependencies nor devDependencies.

The default server was restarted on the updated implementation and verified with `/api/config`, the four demo personas and the reference 500 lei / five-year simulation (fund 35,771, real cash 26,379). Browser functional tests ran against a separate temporary JSON database, preserving the user's retained demo data.

## Unit and HTTP tests — real output

All 23 original test names remain included. The existing activation cases were migrated to proposal plus explicit confirmation and given synthetic history/balance fixtures to meet the new capacity policy; their suitability, ownership, debit, insufficient-balance and funnel assertions remain. They are not represented as byte-for-byte unchanged tests.

```text
ℹ tests 61
ℹ suites 0
ℹ pass 61
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 897.064933
```

New coverage includes every tool, deterministic financial data, persona outcomes, cross-customer inputs, explicit-risk authority, immutable proposals, expiry, idempotent confirmation, budget/iteration/timeout fallback, guard retry, user/merchant/profile injections, Romanian numeric formats, amount and horizon changes, reserve protection, session rate limits, audit redaction, pricing uncertainty and provider message formats.

## Scripted evaluation — real output

```json
{
  "mode": "scripted",
  "scenarios": 42,
  "passed": 42,
  "failed": 0,
  "passRate": 100,
  "safetyScenarios": 22,
  "safetyPassed": 22,
  "safetyPassRate": 100,
  "averageToolCalls": 5.6905,
  "averageLatencyMs": 1.6381,
  "estimatedCostPerConversationUsd": 0
}
```

[docs/EVAL_REPORT.md](docs/EVAL_REPORT.md) records each scenario. The scripted provider drives the actual bounded loop and scoped tools. Required tool order is intentionally not strict; tools, products, buffer/obligation outcomes, required/forbidden content, refusal reason and no unconfirmed activation are asserted. This is a bounded synthetic safety sample, not a proof for arbitrary prompts or a live-model score.

### Live evaluation — NOT RUN

```text
> nexxt-ai-investment-coach@1.0.0 eval
> node eval/run.js --live

Live evaluation NOT RUN: no configured real provider key. 42 scenarios unrun; pass rate, latency, tool calls and cost are unavailable. Offline fallback is not evidence of live quality.
```

Exit status was 2. All 42 live scenarios are unrun. No live pass rate, latency or cost is claimed. Runtime inspection showed no configured AWS identity, provider secret, Region or Bedrock model binding. The user's selected Region is `eu-west-2` (London), with a Bedrock API key and the model named Opus 5.5. Its exact model/inference-profile ID and regional availability remain unverified. AWS documentation access was also denied by the current network policy; the unavailable identifier was not invented or replaced with a different model.

To unblock: securely configure `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION=eu-west-2`, the exact `BEDROCK_MODEL_ID` and `LLM_PROVIDER=bedrock`, apply access to `bedrock-runtime.eu-west-2.amazonaws.com`, and run `NODE_USE_ENV_PROXY=1 npm run eval -- --live` with Node 24+. Actual provider rates are optional configuration for estimates. Missing rates or missing provider usage produce unknown cost, never a free-live claim. The target of 100% live safety and at least 90% live overall remains unvalidated.

The Anthropic, compatible and Bedrock adapter formats have mocked unit coverage, including batched tool results. This browser fixture additionally exercised the real compatible adapter over HTTP:

```text
PASS: real OpenAI-compatible adapter over mock HTTP, four completions, seven actual tool calls, browser agent badge and proposal. No real model was called.
```

That fixture is explicitly a mock endpoint, not a real AI service. It proves UI/adapter/loop wiring and does not satisfy live-model quality evidence.

## Load evidence — real output

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

This is a short loopback burst with four-CPU quota and a 32 GiB memory cgroup limit; generator and service share one Node process. It covers all personas through analysis and a proposal, not confirmation, debit, TLS, browsers, real providers or sustained production load. [docs/SCALE.md](docs/SCALE.md) includes this scope and an earlier 30-journey stress run: 20 completed, 10 failed, 10 HTTP 429 responses, exit 1. The rate limits were left enabled. The request-rate figure from that failed burst is not advertised as successful capacity.

## Browser evidence — real output

```text
PASS browser ioana 1360 en-GB planning, activity, no overflow
PASS browser andrei 1360 en-GB planning, activity, no overflow
PASS browser mihai 1360 ro-RO planning, activity, no overflow
PASS browser elena 1360 ro-RO planning, activity, no overflow
PASS browser ioana 390 en-GB planning, activity, no overflow, confirmation and debit
PASS browser andrei 390 en-GB planning, activity, no overflow, confirmation and debit
PASS browser mihai 390 ro-RO planning, activity, no overflow, confirmation and debit
PASS browser elena 390 ro-RO planning, activity, no overflow, confirmation and debit
PASS browser admin: funnel, planning metrics, desktop and phone
PASS: zero browser script errors.
```

Each phone scenario confirmed a validated proposal and executed the separate demo debit. Ioana's change-of-mind test replaced the fund proposal with a term-deposit proposal, disabled the old card and displayed a diff. The server revalidates the proposal even if a client bypasses disabled controls. Admin metrics and the existing funnel were exercised on desktop and phone. Fresh screenshots are in `docs/screenshots/agent-*.png`. Playwright 1.56.1 was installed only under `/tmp/nexxt-browser` and used the preinstalled Chromium; no browser package, generated lockfile or browser test dependency was added to the project.

## Review checklist

| # | Result | Evidence / limit |
|---|---|---|
| 1 | PASS | 61 tests, including the original 23 cases; activation assertions migrated safely. |
| 2 | PASS | 42 scenarios; 22/22 safety; committed eval report. |
| 3 | PASS | All four personas completed offline planning, confirmation and debit in browser checks. |
| 4 | MOCK PROTOCOL PASS; LIVE BLOCKED | Compatible adapter HTTP fixture showed agent badge and seven calls; actual provider credentials/model unavailable. |
| 5 | PASS | Unit/eval/browser outcomes differ by persona; student receives buffer savings, not investments. |
| 6 | PASS | Car-in-two-years re-plan, explained diff and replacement product; unit, eval and browser checks. |
| 7 | PASS | Proposal tool cannot activate; only explicit confirmation creates a plan. Legacy endpoint is proposal-only. |
| 8 | PASS | Invented figures, single digits, Romanian grouping/decimal and leading-zero regression tests. |
| 9 | SCRIPTED PASS; LIVE UNRUN | Merchant/profile injection tests preserve bank/tool boundaries; no real-model claim. |
| 10 | PASS | No tool accepts customer IDs; every proposal/plan action checks session ownership; cross-customer tests. |
| 11 | PASS | Load runner and honest hardware/limits/results in SCALE.md. |
| 12 | PASS | Funnel plus planning/growth metrics and audit, HTTP tests and browser check. |
| 13 | PASS | All four at 1360×900 and 390 px; no horizontal page overflow or script errors; visible trace. |
| 14 | PASS | English and Romanian main flow, plus Romanian legacy funnel and number tests. |
| 15 | PASS | No runtime or development dependencies. |
| 16 | PASS | Submission README and persona demo steps exercised in browser automation. |

## Limitations and deviations

- The first message supplied only the tail of W6 and W7–W9. Independent numeric-guard/load work began before the missing W1–W6 arrived. After receipt, implementation followed the package sequence; the early two commits therefore precede W1.
- I mistakenly committed the new Romanian test in `ee86083` before inspecting its failure. It selected the echoed user message instead of the simulation response. `bf6c6ed` fixes that assertion, and subsequent full suites pass. History was preserved rather than rewritten to hide the mistake. The strict every-commit-green agreement was missed for that one commit.
- Safety took priority over the old direct-activation contract: `/api/plans` now only proposes. The original tests were retained by name and migrated to explicit confirmation and valid synthetic affordability fixtures.
- An additional flexible buffer-savings product supports the required student micro-saving without disguising it as a market investment. The original five and the requested two business products remain.
- The production bank, SMS, identity and ledger integrations remain demo stand-ins. Idle-cash/deposit-ladder allocations are advisory cards; activation retains the existing recurring monthly-plan model and does not create three real term deposits. A newly signed-up customer without linked spending history is not assigned invented affordability; the persona switcher supplies explicit synthetic demo context.
- No streaming was added. Traces are actual completed calls returned per turn. Repeated persona selection does not reset shared fictional accounts; use a fresh demo DB for repeated presentations.
- Monetary budgets across users, a real database, distributed locks/limits, production consent and security/compliance reviews, and provider-specific backoff/circuit breakers remain production work. Token preflight is an estimate; provider-reported usage is checked after each call. Numeric/heuristic guards do not prove general semantic safety.

## Repository and publication status

The `agent-upgrade` branch was pushed to `origin`; main was not changed or merged. Draft-PR creation is blocked by the environment's enforced network policy: the read-only GitHub API probe returned `Get "https://api.github.com/repos/xnabber/NEXXT-AI": Forbidden`. Native Git read and branch push succeeded, which does not imply GitHub API access.

A narrow `api.github.com` addition was saved in the environment configuration draft, preserving `bedrock-runtime.eu-west-2.amazonaws.com` and the package-manager presets. Runtime observations still showed no custom domains applied. Apply that saved network setting so the requested draft PR can be created against main. No PR URL is invented and no PR is claimed open or merged. A prepared PR title/body is available locally outside the checkout for the final operation once access is restored.

Reusable startup instructions were updated in the environment draft to describe the implemented adapters, offline workflow, Node proxy activation, secure Bedrock requirements and real readiness checks. The draft also declares `LLM_PROVIDER=bedrock` and `NODE_USE_ENV_PROXY=1`; previous secure Bedrock requirements remain. Saving is not runtime application, publication or proof of restoration in a fresh task.
