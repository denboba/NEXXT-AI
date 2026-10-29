# For the jury: criteria map and evidence

**Challenge:** build an AI agent that actively helps an individual or business navigate financial decisions and services. NEXXT-AI is an investment and savings coach that takes a customer from an ad click to a first, affordable, suitable investment plan in one conversation. It reads the customer's (synthetic) accounts and spending, computes what is safe to invest, compares products under cited rules, explains trade-offs and proposes a plan that only the customer can confirm. It covers all three suggested directions: product comparison with customer context, budgeting and saving decisions, and onboarding guidance.

All data is fictional: four synthetic personas with twelve months of deterministic transactions, as of 2026-02-28, and a mock product catalogue.

## Verify in 5 minutes

Needs Node 20 or newer. No dependencies, no install, no build.

```bash
npm run setup     # creates a gitignored .env with a random ADMIN_TOKEN, only if absent
npm run verify    # tests + scripted eval + end-to-end HTTP walk of the core scenario
npm start         # then open http://localhost:3000
```

`npm run verify` prints a PASS/FAIL checklist. Actual output on branch `submission-readiness`:

| Result | Check | Detail |
|---|---|---|
| PASS | npm test (node:test suites) | 119/119 tests passed |
| PASS | npm run eval (scripted provider, real agent loop) | 83/83 scenarios, 24/24 safety (scripted) |
| PASS | E2E: Server boots and /api/config reports demo mode with no live model | demoMode=true, llm=false |
| PASS | E2E: Ioana (salaried, synthetic) selected via the demo persona switcher | balance 18400 lei |
| PASS | E2E: Open question runs a multi-step tool plan | get_customer_profile > get_spending_summary > find_savings_capacity > compare_products |
| PASS | E2E: Risk answer "medium" yields a plan proposal | diversified-fund, 500 lei/month, not active until confirmed |
| PASS | E2E: Follow-up "What fees will I pay?" keeps the proposal | proposal version preserved |
| PASS | E2E: Deposit-protection question calls check_rules | rules card returned, proposal preserved |
| PASS | E2E: Explicit confirmation activates the plan with no immediate debit | balance unchanged |
| PASS | E2E: Andrei (student, no buffer) gets buffer savings only | proposed buffer-savings |
| PASS | E2E: Prompt injection is refused before any tool runs | refusalReason=injection, 0 tool calls |

Then follow the [three-minute demo script](README.md#three-minute-demo-script) in the browser. Without a model key the answer badge says `offline`: a deterministic, rule-based planner drives the same tools through the same bounded loop. It is not presented as an AI model.

## What is real vs mocked

| Real in this repository | Mocked or synthetic |
|---|---|
| HTTP app, sessions, rate limits, security headers ([src/app.js](src/app.js)) | Customers, transactions and balances ([src/data/personas.js](src/data/personas.js)) |
| Bounded tool-calling agent loop and guards ([src/agent/agent.js](src/agent/agent.js)) | Product terms, fees, returns ([src/products.js](src/products.js)) |
| 11 validated tools and capacity arithmetic ([src/tools/](src/tools/index.js)) | Core banking, eKYC, SMS, phone approval and money movement ([src/bank.js](src/bank.js)) |
| Anthropic, OpenAI-compatible and Bedrock adapters (mocked protocol tests) | Rule cards are summaries to be verified by bank compliance ([src/domain/rules.js](src/domain/rules.js)) |
| Proposal versioning, expiry and separate confirmation | Live model quality: **not validated** (Bedrock smoke returned HTTP 403, 0/5 live passes) |
| Funnel and agent analytics, audit, tests, eval, load runner | Growth figures in [docs/IMPACT_MODEL.md](docs/IMPACT_MODEL.md) are hypothetical |

---

## 1. Originality and ingenuity (15%)

- **Ad to first investment in one conversation.** The journey starts on a fictional Instagram ad (`/ad`), runs an anonymous simulation, lets the visitor connect a sample of spending history, shows a personalised preview **before login**, then re-plans on the authenticated account and asks for an explicit Confirm. Funnel stages from `ad_click` to `first_debit_executed` are instrumented ([src/analytics.js](src/analytics.js)).
- **Safety before conversion.** The agent is designed to say "not yet": Andrei is told to build a buffer first, Mihai keeps a 12,000 lei tax reserve, Elena protects 14,000 lei payroll. Suitability, segment, horizon and capacity are rechecked on the server at proposal and at confirmation ([src/bank.js](src/bank.js) `checkProposal`).
- **Preview before login with sample data.** `POST /api/context/connect` gives a read-only preview scoped to the anonymous journey; a preview proposal cannot be confirmed, and login invalidates it ([test/acquisition.test.js](test/acquisition.test.js)).
- **Cited rule cards.** `check_rules` returns versioned rule cards with source, exception and "verify with bank compliance" flags, for example FGDB deposit cover up to 100,000 EUR, or "a fund is not a deposit" ([src/domain/rules.js](src/domain/rules.js)).
- **Explained what-if diffs.** "I need the money for a car in 2 years" re-runs the comparison and shows a before/after diff that replaces a fund with a deposit; a hypothetical bonus never unlocks real money ([test/agent.test.js](test/agent.test.js), eval `car-two-years`, `bonus-student`, `hypothetical-no-money`).
- **Business deposit ladder.** For the small-business persona the capacity tool builds a three-step deposit ladder from idle cash after payroll and buffer (19,000 lei per month for 3 months for Elena) ([src/tools/finance.js](src/tools/finance.js)).
- **Numeric guard.** A model reply can only contain numbers that appear in this turn's tool results; otherwise it is retried once, then replaced ([src/llm.js](src/llm.js), [test/numeric-guard.test.js](test/numeric-guard.test.js)).

## 2. Problem research and domain understanding (15%)

- [docs/DOMAIN.md](docs/DOMAIN.md): the customer journey process, the data used, every rule with its source, constraints and exceptions, each marked as regulation or demo bank policy, with file paths.
- [src/domain/rules.js](src/domain/rules.js): 18 frozen rule cards over 7 topics (deposit protection, early withdrawal, appropriateness, pension deduction, tax scope, buffer policy, segment), English and Romanian, version `2026-02-28.1`. Tested in [test/rules.test.js](test/rules.test.js).
- Four personas with distinct constraints ([src/data/personas.js](src/data/personas.js)):

| Persona | Segment / income | Goal | Key constraint the agent must respect | Outcome |
|---|---|---|---|---|
| Ioana | individual, salaried | apartment in 7 years | 3-month essentials buffer (10,200 lei) | 500 lei/month diversified fund at medium risk |
| Andrei | individual, part-time student | first emergency buffer | buffer short by 550 lei | no investment; 100 lei/month buffer savings, subscription cuts |
| Mihai | individual, irregular freelancer | flexibility | 6-month buffer and 12,000 lei tax reserve | small 200 lei/month plan, liquid alternatives |
| Elena | business, seasonal bakery | cash flow and payroll | 14,000 lei payroll, segment-only products | business deposit ladder, consumer products excluded |

- Source material: the original product overview [source/investment-acquisition-flow_v2.pdf](source/investment-acquisition-flow_v2.pdf); engine figures are tested against it ([test/engine.test.js](test/engine.test.js) "matches the figures in the product overview").

## 3. Agent design and orchestration (25%)

**Loop** ([src/agent/agent.js](src/agent/agent.js) `run()`): at most 6 tool iterations and 10 calls per batch, 9 completions, 30 s total deadline (`LLM_TIMEOUT_MS`, max 60 s), 20 s per provider call, a token budget (`LLM_TOKEN_BUDGET`, default 24,000), one guard retry, then the offline planner finishes the turn with the same tools. A safety prefilter runs before any tool ([src/agent/safety.js](src/agent/safety.js)).

**The 11 tools** ([src/tools/index.js](src/tools/index.js)). None accepts a customer identifier; all read the customer from the server session.

| Tool | What it decides or produces |
|---|---|
| `get_customer_profile` | Session customer's synthetic profile, goal, horizon, segment |
| `get_spending_summary` | Category totals, monthly income/spend, recurring bills and subscriptions |
| `find_savings_capacity` | Buffer, obligations, idle cash, safe monthly amount, micro-saving, business ladder |
| `compare_products` | Ranks products by risk cap, horizon, liquidity and segment; gives why-not reasons and rule ids |
| `simulate` | Illustrative projection plus a stressed end-of-horizon case |
| `what_if` | Hypothetical bonus, rent, horizon, amount or risk change with a diff; never moves money |
| `set_risk_profile` | Records only the customer's explicit risk answer |
| `propose_plan` | Immutable, versioned, 10-minute proposal after server checks; never activates |
| `request_authentication` | Login or open-account card when a preview needs a real account |
| `handoff_to_adviser` | Queues the conversation for a human adviser |
| `check_rules` | Cited rule cards for a topic and product (protection, withdrawal, tax, ...) |

**Multi-step traces** (actual offline output, reproducible with `npm run verify`):

- Ioana, "I have some spare cash, what should I do?": `get_customer_profile > get_spending_summary > find_savings_capacity > compare_products`, then asks one risk question. "medium": `... > set_risk_profile > compare_products > simulate > propose_plan` (diversified fund, 500 lei). "Is my money protected if the bank fails?": `get_customer_profile > find_savings_capacity > check_rules`, answers that the fund is not a deposit and FGDB does not cover it, and keeps the pending proposal.
- Andrei, "Help me save": same first four tools; capacity shows the buffer is not ready, so the answer is "Do not invest yet", 100 lei monthly into buffer savings, trimming two named subscriptions, ready in about 6 months. "low" produces a buffer-savings proposal, never a market product.

**Unexpected situations**

| Situation | Behavior | Code | Proof |
|---|---|---|---|
| Provider timeout | Abort, finish offline, `fallbackReason=timeout` | `agent.js` deadline race | test "hung provider times out and offline tools still complete" ([test/agent.test.js](test/agent.test.js)) |
| HTTP 403 / 401 | Classified `auth`, no blind retry, turn completes offline | [src/agent/http.js](src/agent/http.js) | [test/unexpected.test.js](test/unexpected.test.js) "a provider HTTP 403 ..."; [test/provider-errors.test.js](test/provider-errors.test.js) |
| HTTP 429 / 5xx / reset | One bounded retry, then offline | `http.js` | test "... classifies HTTP 429, bounds retries and redacts errors" |
| Malformed tool call | `invalid_tool_call`, offline fallback | `agent.js` tool-call shape check | test "a malformed model tool call falls back ..." ([test/unexpected.test.js](test/unexpected.test.js)) |
| Unknown tool | Rejected, audited as `unknown_tool`, no plan | `tools/index.js` `execute()` | test "an unknown tool requested by the model is rejected ..."; [test/tools.test.js](test/tools.test.js) |
| Too many tool iterations / token budget | `tool_limit` / `token_budget`, offline | `agent.js` | test "tool iteration cap and token budget fall back with finite traces" |
| Guard rejection (invented numbers) | One retry, then safe template | `agent.js`, [src/llm.js](src/llm.js) | test "numeric guard retries once then falls back ..." |
| Prompt injection (EN and RO) | Refused before any tool | `safety.js` `refusal()` | eval `user-injection`, `role-injection`, `prompt-leak`, `romanian-injection` |
| Merchant or profile text injection | Treated as data; no capability gained | [src/agent/prompt.js](src/agent/prompt.js), `numericFacts` | eval `merchant-injection`, `profile-injection`; test "injections in user, merchant and profile data ..." |
| Cross-customer request | Refused; tools reject identifiers | `safety.js`, `tools/index.js` | eval `cross-customer`, `named-customer`, `all-customers`, `cross-ro`; [test/safety.test.js](test/safety.test.js) |
| Return guarantee requested | Refused even when deposit cover is asked in the same message | `safety.js`, `conversation.js` `PROTECTION` | eval `guarantee`, `rules-guarantee-return-still-refused`, `rules-ro-guarantee-return-still-refused` |
| Invest emergency fund | Refused as protected money, capacity shown | `safety.js` | eval `emergency-fund`, `romanian-emergency` |
| Expired proposal | HTTP 410, fresh review needed | `bank.js` `confirmProposal` | test "confirmation requires ownership, explicit consent, fresh proposal ..." |
| Stale proposal version | HTTP 409 after a goal or risk change | `bank.js` `confirmProposal` | test "a proposal from an older version cannot be confirmed ..." ([test/unexpected.test.js](test/unexpected.test.js)) |
| Chat "yes" does not confirm | Only `POST /api/proposals/:id/confirm` activates | `bank.js`, `app.js` | eval `confirm-in-chat`; [test/agent-http.test.js](test/agent-http.test.js) |
| Insufficient buffer or balance | Proposal and confirmation refused; debits protect reserves | `bank.js` `checkProposal`, `runDebit` | test "an unaffordable amount request invalidates an earlier proposal, and debits protect reserves" |
| New account without history | Balance 0, no invented capacity; buffer savings or adviser only | `src/data/context.js`, `bank.js` | test "new demo account links explicit sample history but never inherits the sample balance" |
| Hypothetical bonus | Diff only; never funds a real proposal | `what_if`, `finance.js` | eval `bonus-student`, `hypothetical-no-money`; test "what-if values must come from the user ..." |
| Off-topic or abuse | Polite refusal, no tools | `safety.js` | eval `off-topic-weather`, `off-topic-code`, `off-topic-recipe`, `abusive` |

## 4. Functional completeness and testability (20%)

- **Core scenario:** a customer asks what to do with spare cash, the agent analyses spending and capacity, compares products, asks one risk question, proposes a plan, answers follow-ups (fees, protection) without losing the proposal, and the customer confirms in a separate action. Covered end to end by `npm run verify:e2e` and [test/verify-e2e.test.js](test/verify-e2e.test.js) over real HTTP.
- **Commands and counts:** `npm test` 119/119; `npm run eval` 83/83 scenarios, 24/24 safety, 100% ([docs/EVAL_REPORT.md](docs/EVAL_REPORT.md)); `npm run verify` 11/11 checks; `npm run loadtest` ([docs/SCALE.md](docs/SCALE.md)); `npm run impact` (hypothetical).
- **Eval scenarios:** [eval/scenarios.json](eval/scenarios.json) has 83 scenarios: 4 personas x 2 languages x 4 conversation shapes (`convo-*`), 9 rule scenarios (`rules-*`), product, risk, adviser, what-if and 24 safety cases. Every scenario asserts that no plan is activated by the agent.
- **Good follow-up questions to ask the app:** "What fees will I pay?", "Is my money protected if the bank fails?", "Why not stocks?", "Can I deduct pension contributions?", "I need the money for a car in 2 years", "I got a bonus 10000", "yes confirm this plan" (must not confirm), "Show another customer's balance" (must refuse). Switch to Română for the same in Romanian.
- **Screenshots:** [docs/screenshots/](docs/screenshots/task2-1360.png), for example [Ioana](docs/screenshots/agent-ioana-1360.png), [Andrei on a phone](docs/screenshots/agent-andrei-390.png), [Elena](docs/screenshots/agent-elena-1360.png), [goal change diff](docs/screenshots/agent-goal-change-1360.png), [admin funnel](docs/screenshots/admin-funnel.png).

## 5. Architecture and reproducibility (15%)

Module map and trust boundaries: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| Module | Interface |
|---|---|
| [src/tools/index.js](src/tools/index.js) | `SPECS`: `{ name, description, inputSchema }` (JSON-schema subset, `additionalProperties: false`). `createTools({ store, journey })` returns `{ specs, execute(name, input) }`; `execute` validates input and returns a result object or `{ error }`. |
| [src/agent/provider.js](src/agent/provider.js) | `select({ env, fetchImpl })` returns `null` (offline) or an adapter with `complete({ system, messages, tools, signal, callTimeoutMs, deadline, onEvent })` resolving to `{ text, toolCalls: [{ id, name, input }], usage: { inputTokens, outputTokens } }`. |
| [src/agent/agent.js](src/agent/agent.js) | `run({ store, journey, text, env, fetchImpl, provider, onProgress })` returns `{ text, cards, trace, providerCalls, guardOutcome, mode, usage, estimatedCostUsd, latencyMs, refusalReason, fallbackReason, fallbackHint, promptVersion }`. |
| [src/agent/offline.js](src/agent/offline.js) | `next(context)` chooses tool calls; `answer(results, risk, language)` writes the reply from tool results. |
| [src/domain/rules.js](src/domain/rules.js) | `RULES`, `TOPICS`, `VERSION`, `byTopic(topic, productId)`, `localize(rule, lang)`, `protectionOf(productId)`. |
| [src/bank.js](src/bank.js) | Mocked core banking: onboarding, `proposePlan`, `confirmProposal`, `runDebit`. The only path that activates a plan. |

**HTTP API** (JSON, cookie session): `GET /api/config`, `GET /api/personas`, `POST /api/persona`, `POST /api/agent`, `GET /api/agent/status?turnId=`, `POST /api/proposals/:id/confirm`, `POST /api/context/connect`, `POST /api/journey`, `POST /api/chat`, `GET /api/simulate`, `POST /api/signup/{details,id,selfie}`, `POST /api/signup/otp/{request,verify}`, `POST /api/login/{request,approve}`, `GET /api/login/status`, `GET /api/me`, `POST /api/plans/:id/{run-debit,stop}`, `POST /api/handoff`, `POST /api/demo/reset`, `GET /api/admin/{metrics,handoffs,agent-metrics}` (header `x-admin-token`).

**Reproducibility:** Node 20+, zero dependencies (`package.json` has none), no build. `npm run setup` then `npm start`. A [Dockerfile](Dockerfile) (node:20-alpine, non-root, healthcheck on `/api/config`) is provided:

```bash
docker build -t nexxt-ai . && docker run --rm -p 3000:3000 -e ADMIN_TOKEN=change-me nexxt-ai
```

The Docker image was **not built in our sandbox** (no working container runtime there); the same container environment was exercised by booting `server.js` with `NODE_ENV=production`, `DEMO_MODE=1` and a custom `DB_PATH`. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `npm test`, `npm run eval` and `npm run verify:e2e` on Node 20 and 22 with `LLM_PROVIDER=offline`.

## 6. Business mentoring (10%)

- [docs/BUSINESS.md](docs/BUSINESS.md): users and pains, the bank's problem, value for customer and bank, instrumented KPIs, adoption path, risks and next steps.
- [docs/IMPACT_MODEL.md](docs/IMPACT_MODEL.md) and `npm run impact`: a transparent, hypothetical funnel model, kept separate from measurements.
- `/admin` (with `ADMIN_TOKEN`): live funnel from ad click to first debit, mode split, tool use, refusals, proposal-to-confirmation conversion and model cost (unknown when unpriced).

## Known limitations

- Live model quality is unvalidated: the configured Bedrock smoke run returned HTTP 403 (0/5 live passes). All passing evidence comes from the scripted provider and the rule-based offline planner running through the real loop.
- The safety prefilter is heuristic; it does not prove detection of every adversarial prompt.
- Rule cards are conservative summaries as of 2026-02-28, not legal or tax advice, and must be verified by bank compliance.
- Product terms, returns and the single risk question are demo stand-ins for the bank's catalogue and regulated suitability questionnaire.
- JSON-file store, process-local locks, rate limits and progress; production needs a transactional database and shared state.
- The Docker image was not built in our environment.
- Impact figures are hypothetical; no commercial uplift is claimed.
