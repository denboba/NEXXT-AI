# Implementation report

The original Task 1 record below is historical, and so are the Task 2 counts. The **Submission readiness** section at the end records that work and its counts at the time (120 tests). The **Live AI path (Homeward pattern)** section after it records the current counts (154 tests, 86/86 scenarios, 25/25 safety, 11 tools); no live pass is claimed.

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


## Task 2

Branch: `agent-polish`, created from latest `origin/main` at `acb3fb0513209e489eb37c000c0f58a90fc80006`. Task 1 and reviewer fixes were preserved. No commit was made to main; no merge is authorized. The final delivery is a draft PR against main, linked in the task attachment.

The model-driven agent is integrated into authenticated chat and anonymous connected-sample previews. The real provider chooses tools through the bounded loop; the deterministic planner remains an explicitly labeled fallback. **Live Bedrock readiness is not passed:** the configured service returned HTTP 403 `AccessDeniedException` for all five smoke prompts. No successful model response, live quality score or model cost is claimed.

### Work packages

| Package | What changed and evidence |
|---|---|
| T1 · One identity | Phone/email login and persona selection now use canonical Ioana, account balance 18,400 lei and the same history. Migration archives duplicate seed records, preserves net account activity and updates references; it is repeatable. Approved ordinary login enters agent chat. |
| T2 · Conversation | Focused English/Romanian greeting, thanks, fees, liquidity, market stress, fund/minimum/inflation/tax/product/crypto/profile/why answers use scoped tools. Informational turns preserve proposals; explicit amount/horizon/risk changes return a diff and replacement. Repeated questions cannot end with identical consecutive assistant messages. Added 32 conversational evals, bringing the total from 42 to 74. |
| T3 · Repeatability | Demo-only same-origin, rate-limited audited reset restores all four financial profiles and affected journeys. Active-plan amount changes need a new proposal and explicit confirmation. HTTP and browser tests complete two successive four-persona runs. |
| T4 · Live path | All three adapters normalize errors, redact raw failures, retry transient 429/5xx/reset once within deadlines and accept configured model IDs. Default per-call limit 20 seconds; total 30 seconds, maximum 60. Owned polling exposes real events while the POST is pending; normal POST still returns the complete answer/cards/trace. Smoke runner and LIVE_RUNBOOK added. Real access denial and no-key exit 2 are recorded below; mock protocol/error/progress tests pass. |
| T5 · Readability | Manually expanded source; no formatter or new dependency. Zero JavaScript lines over 140 characters in src. Before/after test and scenario outcomes/tool counts identical; prompt/data/calculation hash identical. |
| T6 · First minute | Three suggested prompts per persona, separate risk choices, dominant proposal and collapsible supporting cards. Activity defaults open on desktop and closed on phones. Empty/error/loading/fallback states, clear provider-failure copy, 16px minimum tested text, visible focus and measured contrast. Updated screenshots and fixed adviser-transcript rendering in admin. |
| T7 · Connected acquisition | Simulation offers explicit synthetic sample connection. Anonymous agent analysis creates an immutable preview after risk, then offers authentication. Preview has no Confirm in UI and cannot confirm through HTTP or bank layer. Login invalidates preview; a fresh proposal uses the actual authenticated balance. New accounts may link sample history explicitly but retain zero balance. Added context_connected funnel step and scoped offline/scripted-provider integration tests. |
| T8 · Impact | Dependency-free CLI calculates explicitly hypothetical funnel, funding, monthly contributions, USD model cost per activated plan and sensitivity. IMPACT_MODEL separates assumptions from real measurements and explains bank value and production scaling work. |

### Commands and results

Run from the repository root with Node 20+; Node 24.19.0 was used here. No install/build is needed. `npm run setup` was run twice and preserved existing local configuration. `NODE_USE_ENV_PROXY=1 npm start` was exercised; a real local simulation request returned the expected fund 35,771 and cash-real 26,379 values for 500 lei over five years. A provider-configured flag was not treated as successful inference.

`npm test` — real final output:

```text
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2763.762145
```

All existing tests remain included, including the prior acquisition, approval, ownership and funnel assertions. The new funnel expectation includes context_connected. No test was disabled. There are no runtime or development dependency declarations and no lockfile/package addition. The branch diff was checked against configured credential values without printing them; none occurred.

`npm run eval` — real final output (scripted provider, free, no external inference):

```json
{
  "mode": "scripted",
  "scenarios": 74,
  "passed": 74,
  "failed": 0,
  "passRate": 100,
  "safetyScenarios": 22,
  "safetyPassed": 22,
  "safetyPassRate": 100,
  "averageToolCalls": 10.1892,
  "averageLatencyMs": 2.7858,
  "estimatedCostPerConversationUsd": 0
}
```

The full scenario table is committed in [docs/EVAL_REPORT.md](docs/EVAL_REPORT.md). All 22 safety scenarios pass. This is not the live 90% quality target. Every scenario also checks that the agent did not activate a plan; conversational cases check proposal stability and no repeated consecutive replies.

### Readability before/after evidence

```text
Before: 105 tests; 105 pass; 0 fail
After:  105 tests; 105 pass; 0 fail
All 74 scenario results and tool counts identical before/after formatting.
Legacy system prompt byte-identical: true
Source JavaScript lines over 140 characters: 0
```

The same 105-test working tree included impact tests during both format checks; the additional connected-preview provider integration test was added afterwards, yielding the final 106. Timing naturally varies. SHA-256 over the exported versioned system prompt, catalogue, all generated transactions, spending summaries and capacities was identical before/after:

```text
dda965f970ca309fde347a8825566e8c7c77d01b8579fa8b3fd6f96fb9c76f4b
```

No formatter tooling was used. Application behavior and the zero-dependency contract remain.

### Live smoke — actual failed access and no-key behavior

`npm run smoke:live` used the injected Bedrock binding, London Region and configured model. It exited **1**. Safe classification was `auth`; a minimal diagnostic confirmed HTTP **403 AccessDeniedException**. Raw provider errors, credentials and request headers were not logged.

| Prompt/persona | Mode | Provider call ms | Total ms | Guard | Result |
|---|---|---:|---:|---|---|
| Ioana spare cash | offline | 794 | 809.46 | not_completed | FAIL |
| Andrei saving | offline | 293 | 294.29 | not_completed | FAIL |
| Mihai tax/irregular income | offline | 260 | 261.70 | not_completed | FAIL |
| Elena payroll | offline | 274 | 275.41 | not_completed | FAIL |
| Ioana car in two years | offline | 324 | 325.94 | not_completed | FAIL |

All five executed the scoped offline tools after denial. Usage was incomplete and model cost unknown; there were zero successful live model responses. Smoke invoked no confirmation or debit. The configured model identifier did not match the requested Opus model. Secure credential/model access and the exact supported model or inference-profile identifier must be corrected in environment settings. No model was silently substituted. Full live eval was not repeatedly run against the known access denial; its quality target remains unvalidated. [LIVE_RUNBOOK](docs/LIVE_RUNBOOK.md) explains the retry procedure.

The separate command below removed provider-key variables only for that child process and exited **2**:

```bash
env -u AWS_BEARER_TOKEN_BEDROCK -u ANTHROPIC_API_KEY -u COMPAT_API_KEY npm run smoke:live
```

Real output:

```text
Live smoke NOT RUN: configure a real provider key and its model first. Five prompts are unrun.
Bedrock needs AWS_BEARER_TOKEN_BEDROCK, AWS_REGION and the exact BEDROCK_MODEL_ID in secure settings.
With Node 24 and the managed proxy, start with NODE_USE_ENV_PROXY=1 npm run smoke:live.
```

Mocked tests cover 429, 503, 401, 404, 400, network resets and ignored-abort timeouts for Anthropic, compatible and Bedrock, plus Bedrock model/profile formats, protocol normalization, redaction and batched tool results. Browser progress uses a clearly mocked delayed scripted provider; it is not claimed as real inference.

### Load — real output

Command: `LOADTEST_COMMIT=$(git rev-parse HEAD) npm run loadtest` at the recorded base commit:

```json
{
  "timestamp": "2026-10-28T18:18:56.208Z",
  "baseCommit": "575bcc18aca640f3cba1af94fd130d67eb6d4d83",
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
  "elapsedMs": 195.37,
  "requestsPerSecond": 409.49,
  "requestLatencyMs": {
    "p50": 13.3,
    "p95": 65.78,
    "p99": 92.04
  },
  "statuses": {
    "200": 80
  },
  "failures": {},
  "rateLimitsEnabled": true,
  "scope": "Four synthetic personas; profile/spending/capacity/comparison/proposal through the offline agent endpoint. Loopback HTTP; generator and app share one Node process. Temporary JSON-file store. No provider, TLS, browser, real bank, confirmation or debit load."
}
```

[docs/SCALE.md](docs/SCALE.md) discloses hardware and limits. This short same-process loopback run exercises offline analysis to proposals, with real rate limits and temporary JSON persistence. It excludes provider/TLS/browser/confirmation/debit throughput and is not a claim of sustained production scale. The prior failed rate-limit stress evidence is retained separately.

### Browser evidence — real output

Throwaway Playwright was installed only under /tmp with npm's cache also under /tmp, using preinstalled Chromium. No browser dependency was added to the project. Real local app checks:

```json
[
  {
    "width": 1360,
    "height": 900,
    "overflow": false,
    "minFontPx": 16,
    "activityDefault": "open",
    "flow": "proposal → fees → confirm → Romanian profile",
    "errors": []
  },
  {
    "width": 1920,
    "height": 1080,
    "overflow": false,
    "minFontPx": 16,
    "activityDefault": "open",
    "flow": "proposal → fees → confirm → Romanian profile",
    "errors": []
  },
  {
    "width": 390,
    "height": 800,
    "overflow": false,
    "minFontPx": 16,
    "activityDefault": "closed",
    "flow": "proposal → fees → confirm → Romanian profile",
    "errors": []
  },
  {
    "acquisition": "ad → simulation → sample → preview → login → fresh proposal → confirm → reset",
    "pass": true
  },
  {
    "mockDelayedProgress": "tool step visible while POST still pending; agent badge after completion",
    "pass": true
  }
]
```

Two complete repeat presentations and the admin/adviser path:

```text
PASS run 1 ioana: term-deposit, confirmed
PASS run 1 andrei: buffer-savings, confirmed
PASS run 1 mihai: diversified-fund, confirmed
PASS run 1 elena: business-deposit-ladder, confirmed
PASS run 2 ioana: term-deposit, confirmed
PASS run 2 andrei: buffer-savings, confirmed
PASS run 2 mihai: diversified-fund, confirmed
PASS run 2 elena: business-deposit-ladder, confirmed
PASS admin 1360: seven-step funnel, agent metrics, adviser transcript, no overflow
PASS admin 390: seven-step funnel, agent metrics, adviser transcript, no overflow
PASS zero browser JavaScript errors
```

Text/contrast inspection of the displayed desktop planning/account state (disabled controls excluded from contrast requirements):

```json
{
  "checked": 180,
  "minimumContrast": 4.939058812951704,
  "failures": []
}
```

Visible focus styles are defined for interactive controls. These browser/layout/contrast checks support the tested states; they are not a full accessibility audit. Screenshots: [1360](docs/screenshots/task2-1360.png), [1920](docs/screenshots/task2-1920.png), [390](docs/screenshots/task2-390.png), [mock progress](docs/screenshots/task2-mock-progress.png). The last image uses the delayed mock, explicitly not a live model.

### Impact — executed hypothetical scenario

```bash
npm run impact -- --visitors=10000 --chatRate=0.15 --accountRate=0.3 --activationRate=0.35 --monthly=300
```

The actual baseline output is:

```json
{
  "conversations": 1500,
  "accounts": 450,
  "fundedPlans": 157.5,
  "fundedPlansPer10000Clicks": 157.5,
  "assetsGatheredPerMonthRon": 47250,
  "modelCostUsd": 30,
  "modelCostPerActivatedPlanUsd": 0.19047619047619047
}
```

Every input and sensitivity value is hypothetical, including default USD 0.02/conversation. No production data, commercial lift or measured live-model price is asserted. Confirmation is not funding; the calculator explicitly assumes a later successful debit. [IMPACT_MODEL](docs/IMPACT_MODEL.md) gives formulas, exclusions, sensitivity and bank impact. Tests check conditional rates, denominator behavior, units and impossible inputs.

### Reviewer checklist and outstanding limits

| Task 2 item | Result |
|---|---|
| 1 · Tests and 25+ conversation eval additions | PASS: 106 tests; 74/74 scenarios; 32 new conversation scenarios; 22/22 safety. |
| 2 · Normal Ioana login reaches agent | PASS: phone/email/canonical history tests; browser approved login after preview; no duplicate active Ioana. |
| 3 · Personal EN/RO questions per persona | PASS: all four × both languages × required question families in unit coverage, plus eval and browser checks. |
| 4 · Questions preserve proposal; changes replace | PASS: unit/eval/HTTP and browser fees → confirm and car → deposit diff. |
| 5 · Reset / two presentations | PASS: exact seed restoration tests and two four-persona browser confirmations. |
| 6 · Smoke and provider failures | Harness/mock coverage PASS; no-key exit 2 PASS; real Bedrock smoke 0/5 due HTTP 403, unresolved externally. |
| 7 · Actual progress / normal POST | PASS with delayed mock, owned polling and complete POST response. |
| 8 · Source readability | PASS: zero src JS lines >140; identical pre/post test/scenario/tool results and facts hash. |
| 9 · Anonymous preview / no confirm | PASS through offline and real agent loop with scripted provider; HTTP/bank/UI confirmation boundaries tested. |
| 10 · Runbook and impact | PASS; hypothetical assumptions and measured evidence kept separate. |
| 11 · No dependencies/secrets | PASS for branch changes; no dependencies, no credential values in diff, no secrets copied to source/logs. |
| 12 · README and demo script | PASS offline: acquisition → sample → preview → login → fresh proposal → confirm; all four personas and reset verified. Live version requires corrected access. |

T7 was completed before T5/T6 to prioritize the user's explicit request to integrate the agent into the acquisition journey; T6 followed, then T5 and T8. No dependency or formatter was added, no deck/source files or git history were deleted or rewritten, and Task 2 commits were made only with the full suite green.

Remaining limits: Bedrock authorization and exact Opus ID/availability require secure settings outside repository code. Full live quality and actual model pricing remain unverified. Rule-based/heuristic safety tests do not prove arbitrary-model semantic safety. The JSON store, process-local locks/progress/limits, fixed synthetic date and banking/identity stand-ins remain demo constraints; production needs transactions, shared state, consent, global budgets and real integrations. Preview allocations and business ladders are advisory; this demo does not open actual deposits. No claim of millions of customers, commercial uplift or production readiness is made.

Reusable cloud start instructions were saved for agent-polish, reset, connection, live smoke, impact and current access diagnosis. Existing installation/secret bindings were preserved. Startup and repeatable setup were exercised in this instance; saving the draft does not publish a snapshot or establish restoration in a fresh task. GitHub API access is now available, unlike the historical Task 1 limitation; the requested final operation is draft PR creation only, never merge.

## Submission readiness

Branch: `submission-readiness`, created from `main` at `3f33362`. Goal: map the work to the six jury criteria and make it verifiable in one command. Commits are local on this branch.

### What changed

| Commit | Change |
|---|---|
| `4eb2b50` | `src/domain/rules.js`: 18 cited, versioned rule cards over 7 topics (EN/RO). New 11th tool `check_rules`; `compare_products` cites rule topics and deposit protection. Deposit-protection questions are answered while return guarantees are still refused. 9 new `rules-*` eval scenarios and [test/rules.test.js](test/rules.test.js). |
| `f877364` | `npm run verify` and `npm run verify:e2e` ([scripts/verify.js](scripts/verify.js)), [test/verify-e2e.test.js](test/verify-e2e.test.js), [Dockerfile](Dockerfile), `.dockerignore`, [CI workflow](.github/workflows/ci.yml) on Node 20 and 22. |
| docs commit | [JUDGING.md](JUDGING.md) criteria map, [docs/DOMAIN.md](docs/DOMAIN.md), [docs/BUSINESS.md](docs/BUSINESS.md), refreshed README/ARCHITECTURE/IMPACT_MODEL counts, and [test/unexpected.test.js](test/unexpected.test.js) (malformed tool call, unknown tool, provider HTTP 403, stale proposal version). |

### Commands and results (real output, Node v22)

```text
npm test
# tests 120
# pass 120
# fail 0

npm run eval
"scenarios": 86, "passed": 86, "failed": 0, "passRate": 100,
"safetyScenarios": 25, "safetyPassed": 25, "safetyPassRate": 100,
"estimatedCostPerConversationUsd": 0

npm run verify
All 11 checks passed.
Mode: offline deterministic planner, no external model or network call.
```

Tools (`require('./src/tools').SPECS`): `get_customer_profile`, `get_spending_summary`, `find_savings_capacity`, `compare_products`, `simulate`, `what_if`, `set_risk_profile`, `propose_plan`, `request_authentication`, `handoff_to_adviser`, `check_rules`.

### Limits unchanged

- Live model quality is not validated: the last configured Bedrock smoke run returned HTTP 403 (0/5 live passes). All passing evidence uses the scripted provider and the rule-based offline planner through the real loop.
- `docker build` was not executed: the sandbox has no working container runtime (`docker info` fails). The container environment was checked by booting `server.js` with `NODE_ENV=production`, `DEMO_MODE=1` and a custom `DB_PATH`; the healthcheck request to `/api/config` returned 200.
- Rule cards are informational summaries as of 2026-02-28, flagged for bank compliance verification; they are not legal or tax advice.

## Live AI path (Homeward pattern)

Branch: `submission-readiness`. Goal: make the live model path usable in the demo without changing the product, the tools, the safety rules or the offline planner's answers. Commits are local on this branch.

| Commit | Change |
|---|---|
| `0972be6` | Provider selection: an explicit `LLM_PROVIDER` wins; blank uses anthropic > openai > bedrock > offline, so a Bedrock token no longer overrides an Anthropic key. |
| `618430e` | Streaming Anthropic adapter: `stream: true`, `temperature: 0`, cached system block plus session-context block, SSE line reader with no new dependency, tool input only from `input_json_delta`, `LLM_FIRST_TOKEN_MS` (default 6000) first-event and idle timeout, cache usage reported. Parser tested with recorded event fixtures. |
| `119dfe7` | Tool guard ([src/agent/guard.js](src/agent/guard.js)) before every tool call in both paths, with codes `UNKNOWN_TOOL`, `NOT_MODEL_CALLABLE`, `INVALID_ARGS`, `PRECONDITION_NOT_MET`, `DUPLICATE_CALL`; audited and shown in the Activity timeline. |
| `536e328` | Mid-turn failover: the offline planner finishes the turn without re-running completed tools, keeps streamed text, drops the failed call's tool calls, emits a `fallback` event and logs `[nexxt] live provider failed: <code>`. A client abort ends with HTTP 499 and no fallback. |
| `acc0f76` | Visible mode: header badge `Live · <model>` or `Offline planner`, per-turn fallback notice, `provider`/`model` in `/api/config`; `smoke:live` exits 1 on any fallback unless `SMOKE_ALLOW_FALLBACK=1`. |

### Commands and results

```text
npm run verify
| PASS | npm test (node:test suites) | 154/154 tests passed |
| PASS | npm run eval (scripted provider, real agent loop) | 86/86 scenarios, 25/25 safety (scripted) |
All 11 checks passed.
Mode: offline deterministic planner, no external model or network call.
```

### Limits

- `npm run smoke:live` has not been run with a real `ANTHROPIC_API_KEY`; no key is configured in this environment. No live pass, live latency or live cost is claimed. The default model identifier `claude-sonnet-5-5` is not verified against the live API; set `COACH_MODEL` to an identifier your key can use.
- The Anthropic streaming, guard and failover behaviour is covered by mocked SSE fixtures and the scripted provider, not by a real model.
