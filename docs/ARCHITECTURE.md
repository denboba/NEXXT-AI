# Architecture and trust boundaries

The app is a dependency-free CommonJS Node HTTP service. There is no build step. `server.js` loads local configuration, creates the store and starts the server. Publication or process restart does not preserve a running server; start it again explicitly.

## Components

| Component | Responsibility |
|---|---|
| `src/data/personas.js` | Seeded PRNG, fixed synthetic date, four profiles, twelve months of transactions, repeatable opening/final balances. Uses one canonical Ioana identity for phone/email and persona access. A repeatable migration archives the duplicate legacy seed while preserving its net ledger activity and references. |
| `src/tools/finance.js` | Spending summaries and deterministic buffer, obligation, surplus, micro-saving and ladder calculations. Negative surplus stays negative. |
| `src/tools/index.js` | 11 validated JSON-schema-style tool definitions, session-only context, data cards and controlled proposal/risk/handoff operations. No tool activates plans or accepts another customer ID. |
| `src/domain/rules.js` | 18 frozen, versioned rule cards over 7 topics (deposit protection, early withdrawal, appropriateness, pension deduction, tax scope, buffer policy, segment), each with source, exception and as-of date, in English and Romanian. Exposes `byTopic()`, `localize()` and `protectionOf()`. Summaries to be verified by bank compliance; see [DOMAIN.md](DOMAIN.md). |
| `check_rules` tool | The 11th tool in `src/tools/index.js`: validated `topic` and optional `productId`, returns localized cited rules, the product's protection label and a disclaimer as a `rules` card. `compare_products` also attaches rule topic ids and protection to each product. |
| `src/agent/provider.js` and adapters | Anthropic Messages, compatible Chat Completions and Bedrock Converse normalized to text/tool calls/usage. Tests use a replayable scripted provider. |
| `src/agent/agent.js` | Six tool-iteration ceiling, 30-second default deadline (`LLM_TIMEOUT_MS`, max 60 s), token budget, tool execution, trace, guard retry, bounded memory, pricing and deterministic fallback. |
| `src/agent/prompt.js` | Versioned policy separating system instructions from untrusted customer/tool/profile/merchant data. |
| `src/agent/offline.js` | Explicit deterministic conversational planner calling the same registry. Questions use focused tools and preserve pending proposals; explicit amount/horizon/risk changes explain a diff. It is a rule-based fallback, not an LLM. |
| `src/coach.js` | Original anonymous ad-to-sign-up/login conversation and FAQ. Existing chip and onboarding flows remain. |
| `src/bank.js` | Ordered onboarding, OTP/approval demo, suitability and affordability, immutable proposals, separate confirmation, account ledger and explicit demo debit. |
| `src/store.js` | JSON-file persistence or in-memory tests. It exposes a small store boundary, but callers still mutate `db`; migration to a real database requires scoped repository methods and transactions. |
| `src/analytics.js` | Original funnel plus planning mode/cost/tool/refusal and proposal-conversion metrics. |
| `scripts/verify.js` | One-command jury verification: runs `node --test`, the scripted eval and an end-to-end HTTP walk of the core scenario on an isolated in-memory store with the provider forced offline. Exports `runE2E`, `runTests`, `runEval`; `--e2e-only` runs the HTTP walk only. Used by CI ([../.github/workflows/ci.yml](../.github/workflows/ci.yml)). |
| `public/` | Vanilla DOM rendering, trustworthy cards from tools, activity trace, persona/language controls and admin. Uses text nodes for all customer/merchant/model strings. |

## Data flow

1. A cookie identifies a server-side journey. After an anonymous simulation, `/api/context/connect` explicitly selects a synthetic sample for a read-only preview. It does not set `userId`. A preview proposal is scoped to that journey, marked `preview`, and cannot be confirmed. Approved login invalidates it; the agent must create a fresh proposal using the authenticated balance. A new demo account can explicitly link sample history but never inherits its balance. Demo-only persona selection establishes its fictional customer context. The legacy sign-up and login flows can also establish identity; a customer without linked spending history receives a request for context rather than an invented capacity.
2. `/api/agent` or a customer-context text turn on `/api/chat` validates length, strips controls, applies session/IP rate limits and serializes that journey's turn. Authentication switching and logout are blocked during an active turn.
3. A safety prefilter refuses recognized injection, cross-customer, abuse, off-topic and protected-money requests. This is a conservative heuristic, not proof of detection of every possible adversarial prompt.
4. The model receives a versioned policy, a summary of goal/horizon/risk/amount and the last twelve messages. Each tool revalidates input and obtains the customer from the server session. Tool errors are returned as `{error}`.
5. Tool results contain deterministic data and optional UI cards. A trace records actual calls and timings. The model may choose the next tool, but tool output text cannot grant capabilities or change server policy.
6. The final reply must use only numeric figures found in the current turn's results; IDs, names and merchant/profile text do not supply numeric authority. English/Romanian grouping and decimals are canonicalized. A leading-zero decimal is never treated as a grouped integer. One guard retry is allowed, then a safe template is used. Obvious unsafe or off-topic final replies and multiple questions are also rejected. These checks supplement the tools; they are not a general semantic-verification model.
7. The browser renders the response and cards with `agent` or `offline`. This mode describes the path that answered, not the presence of a stored API key. Session-owned progress events appear while a turn runs; complete traces arrive in the normal POST response. There is no simulated token streaming.

## Authority and money movement

The model can read only the session's synthetic data, run calculations, compare products, ask for authentication/an adviser, record an explicitly recognized customer risk answer and propose a plan. It cannot confirm, top up, run a debit, read admin metrics or read another session.

A proposal binds customer, journey, product, amount, risk answer, version and a ten-minute expiry. A new proposal, risk answer, goal/amount change invalidates prior versions. It is immutable; confirmation state lives in the resulting plan rather than altering the proposal. `/api/plans` is now a proposal-only compatibility route.

Only `POST /api/proposals/:id/confirm` with `{ "confirmed": true }` activates a plan. The server rechecks session ownership, expiry, current version, risk, segment, horizon, capacity and duplicate active products. Replays return the same plan without duplicate activation messages. The activation function is private to the bank module. Confirmation does not debit money.

The separate demo debit endpoint requires an authenticated owner and an explicit user action. It checks available funds and protected reserves. Micro-saving into the flexible buffer product is the narrowly defined buffer-building exception; a deficit that cannot fund that saving blocks it. In production, demo top-up, phone approval and manual debit endpoints must remain disabled and be replaced with real bank authorizations.

## Financial assumptions

Synthetic transactions cover March 2025–February 2026. Planning obligations are relative to the fixed `2026-02-28` dataset date, not live banking data. Activation/OTP expiry use runtime time. Income minus spend equals balance change for every generated profile. Recurring bills are explicit synthetic labels, not a claimed production merchant-classification model.

Essentials determine three months of buffer for regular income, six for irregular income, and a first one-month target for the student. Business planning protects payroll and cash-flow lows. At most half the observed surplus funds a recurring commitment, capped conservatively for irregular income. Hypothetical bonuses never change bank balances or establish spendable capacity; rent increases reduce subsequent checks. The synthetic forecast does not execute future income or expense postings.

Product returns, fees, settlement days and the single suitability question are demo assumptions. The engine produces both an illustrative scenario and a stressed end-of-horizon result; these are not guaranteed returns or regulated advice. Production needs a confirmed catalogue, full suitability process and domain review.

## Failures and operational limits

| Failure | Behavior |
|---|---|
| No provider key | Same tools/cards via offline planner. |
| Timeout, HTTP error, malformed provider output, budget/iteration limit | Abort the request; finish through the bounded offline planner and show its mode/reason. No automatic provider retry storm. |
| Invented numeric figure or invalid reply | Retry once within the same deadline/budget, then use safe templates. |
| Unknown pricing | Report cost as unknown; never present unpriced model usage as free. Rates are explicit configuration. |
| No spending history | Request authentication/context or adviser support; do not invent affordability. |
| Old/expired/cross-session proposal | Reject confirmation and require a fresh review. |
| Global rate limit | HTTP 429; the load runner counts the journey as failed and exits nonzero. |
| JSON write failure | Request may fail; this demo has no database transaction rollback or multi-writer safety. A real database is required before production. |

The store is single-process and rewrites the JSON dataset on flush. Rate limits and the in-flight journey lock are process-local. A multi-instance deployment must move sessions, limits, locks, proposals and audit to shared transactional storage with idempotency constraints. Provider global monetary budgets, circuit breakers and shared caches remain production work; one deadline-bounded transient retry is implemented, but do not infer these from a per-turn token cap. Cache only deterministic tool outputs with versioned assumptions and customer-scoped keys.

Admin endpoints require `ADMIN_TOKEN` in shared environments. Audit entries contain synthetic persona IDs, allowed tool names, decisions/reason codes and timestamps, not raw input, phone/email, transcripts or credentials. The separately protected adviser queue intentionally retains the demo conversation. The demo supports same-origin POST checks and SameSite cookies; production still needs appropriate HTTPS, session lifecycle and security review.

## Validation boundaries

See [EVAL_REPORT.md](EVAL_REPORT.md), [SCALE.md](SCALE.md) and [../REPORT.md](../REPORT.md). Scripted evaluation tests the real loop and registry without a real model. Adapter protocol tests and an injected browser fixture do not establish live-model quality. Bedrock Opus 5.5 availability and the live 90% quality target remain unverified: the configured Bedrock smoke run received HTTP 403 access denial, with no successful inference. Screenshots and browser checks use a throwaway Playwright installation outside the repository; it is not a project dependency.

## Turn progress and repeat presentations

`GET /api/agent/status?turnId=…` returns only the owning journey's actual provider/tool progress and elapsed time. It never changes financial state. Completed calls remain available in the regular POST response, preserving the non-streaming interface. Progress and turn locks are currently in-process; a multi-instance deployment needs shared state.

Adapters classify provider errors and retry 429/5xx/reset failures once within a separate call deadline (default 20 seconds) and the total turn deadline (default 30 seconds, capped at 60). Auth/model/bad-request errors do not get blind retries. Raw errors and credentials are never surfaced in the trace. Unknown usage stays unpriced. A provider failure selects the same scoped deterministic tools and changes the answer badge to offline.

The demo-only reset endpoint restores all four seed personas and removes affected journeys, proposals, plans, confirmations and ledger changes. It checks origin, rate-limits calls, refuses to run during active turns and retains an audit entry. Active-plan updates require a new immutable proposal plus confirmation; the agent cannot change an active amount directly.
