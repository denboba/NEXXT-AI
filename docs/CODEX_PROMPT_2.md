# Codex task 2: make the agent demo-day ready (VibeHack · Raiffeisen · Track 1)

Read `docs/CODEX_PROMPT.md` (task 1: constraints, brief, definition of done) and `REPORT.md` first. **Every constraint from task 1 still applies**: zero dependencies, numbers only from tools, the agent never moves money, offline mode is first class, synthetic data only, all tests stay green. A reviewer (Claude) will audit this task against the checklist at the bottom, running the app itself.

Branch `agent-polish` from the latest `main`. Small commits. End with an updated `REPORT.md` section "Task 2" (real command output, what you could not do and why) and a draft PR. Do not merge.

## What the review of task 1 found

Task 1 delivered a lot and it holds up: 61 tests, 42/42 eval, 22/22 safety, confirmation boundary, ownership checks and load test all reproduce. The four personas reach the right conclusions. What is still weak, found by running the app, in priority order:

| # | Finding (evidence) | Why it matters |
|---|---|---|
| P1 | **The documented existing-client login lands in the old scripted flow, not the agent.** README says log in with `+40 722 000 111` (legacy "Ioana Popescu", 2,500 lei). That user has no customer context, so chat is the chip-and-slider decision tree the brief excludes. The persona "Ioana" (18,400 lei) is a different person with the same name. | A judge who follows the ad → login path never sees the agent. |
| P2 | **Offline planner cannot hold a conversation.** With a persona logged in: "what if the market drops?", "hello", "should I buy bitcoin?", "what is the weather" all return the same generic deflection. "how does a fund work?", "can I withdraw anytime?", "what fees will I pay?" and "Am bani liberi, ce să fac?" re-dump the identical plan and proposal. The old scripted FAQ answers (market drop with a stress case, withdrawal, fees, how a fund works) exist in `src/coach.js` but are unreachable for customers. | Judges ask exactly these questions. If the live provider is slow or down, this is what they see. |
| P3 | **Any extra chat turn invalidates the pending proposal** (even "what about fees?"), because every turn re-plans and issues a new proposal. | Asking a question should not reset the decision the customer is looking at. |
| P4 | **Persona state is not resettable.** After one run, the persona has an active plan; a second demo cannot produce a new proposal for that product (no proposal card appears) and balances are changed. README says "use a fresh database". | A booth demo is run many times. |
| P5 | **The live path is unvalidated and fragile.** The real-model loop has never run. Defaults were a 12 s total cap (already raised to 30 s by the reviewer, configurable to 60 s), a multi-tool turn with a large model can take 10 to 30 s, and the UI shows only a spinner while waiting. Bedrock throttling and transient 5xx are not retried. | The most impressive part of the demo is the part that has not been run. |
| P6 | **Dense one-line code** in `src/agent/*.js` (for example `bedrock.js`, `messages.js`, parts of `agent.js`, `offline.js`) is hard to read. Judges and teammates will read it. | Maintainability and credibility. |
| P7 | The anonymous ad → chat flow and the agent are **two separate products**; the headline story (ad → agent analysis → account → plan) is not connected. | The strongest narrative is not demonstrable. |
| P8 | No business-impact material for the "Scaling & Growth" angle beyond measured load and cost per conversation. | Judges weigh impact and feasibility. |

Reviewer fixes already on `main` (do not redo): default agent time budget 30 s (`LLM_TIMEOUT_MS`, max 60 s); demo personas now open with a single agent greeting instead of the scripted amount questions.

## Work packages (do in this order)

### T1 · One customer, one agent (fixes P1)
- Unify identities: the demo existing client reachable by phone `+40 722 000 111` and email `ioana.popescu@example.com` **is** persona Ioana (same account, same history). Remove the duplicate legacy seed, or map it onto the persona. Update README, tests and any fixtures that assumed 2,500 lei, keeping every assertion about login approval, ownership and funnel events.
- Any logged-in customer who has a synthetic history (all four personas, via persona switch **or** via the normal ad → login path) gets the agent greeting and agent turns. Newly onboarded customers without history keep a graceful path (the existing "link context or talk to an adviser" behaviour), but offer the sample-data connection from T7.
- Test: login by phone as Ioana, chat, assert `mode` is present and a `plan_proposal` can be produced.

### T2 · A real offline conversationalist (fixes P2, P3)
Rule-based, deterministic, still tool-driven. In `src/agent/offline.js`:
- Add intent routing before planning, with a priority order, covering at least: greeting and small talk, market drop / risk, withdrawal and liquidity, fees, how a fund works, minimum amount, inflation, tax (generic, no advice), explain-this-product (each catalogue product), crypto / single stocks / "hot tips" (explain they are not offered or are high risk, point to what is available), off-topic (kind redirect), thanks / bye, "why did you recommend this", "what do you know about me" (summarise the data used, with the tools' numbers).
- Answers must be **personalised with the session customer's tool numbers** (for example the market-drop answer uses `simulate` with the stress case for the customer's proposed amount and horizon; the withdrawal answer uses the product's liquidity; "why this" quotes the capacity reasons). Reuse the copy in `src/coach.js` FAQ where it fits, and translate every answer into Romanian in the i18n catalogs.
- **Pure questions must not re-plan and must not invalidate a pending proposal.** Only turns that change amount, goal, horizon or risk create a new proposal version. A question about an existing proposal answers it and leaves the card active.
- Cards: attach a card only when it adds value (for example the stress chart for a market-drop question). Do not re-render budget, capacity and comparison for every message.
- Extend `eval/scenarios.json` with at least 25 new conversational scenarios (EN and RO) including multi-turn flows: question after proposal then confirm, change of mind after a question, three questions in a row. The eval must also assert that no scenario ends with two identical consecutive assistant messages.
- Keep 100% on all safety scenarios.

### T3 · Demo reset and repeatability (fixes P4)
- Demo mode only: `POST /api/demo/reset` restores all four personas (balances, plans, proposals, ledger, journey state) to seed, with a small "Reset demo" control in the header. Same-origin check and a rate limit. Audit the reset.
- If a customer already has an active plan in the proposed product, the agent says so and offers to change the amount (a new proposal replacing the plan's amount through the same confirmation boundary), instead of silently producing no proposal.
- Tests: reset restores exact seed state; second run-through of the demo script works end to end.

### T4 · Live path hardening and visibility (fixes P5)
- `npm run smoke:live`: sends 5 representative prompts (one per persona plus a change of mind) to the configured provider, prints for each: mode, tool sequence, latency per provider call and total, token usage, guard outcome, and a clear PASS/FAIL. Exit code 2 without credentials, with a helpful message. It never calls anything but the provider and the local app.
- Provider robustness for Anthropic, OpenAI-compatible and Bedrock: one retry with short backoff on 429/5xx/throttling and network resets (respect a deadline), clear error classification in the trace (`throttled`, `timeout`, `auth`, `model_not_found`, `bad_request`), and no secrets in logs or traces. Add mocked tests for each class. Bedrock: accept both foundation model IDs and inference profile IDs/ARNs and say in the error when the model ID looks wrong.
- Distinguish per-call timeout (default 20 s) from total turn budget (default 30 s, max 60 s).
- **Progress while waiting:** stream tool events to the UI (Server-Sent Events via `fetch`, or short polling of a per-turn status endpoint if you judge it safer). While a live turn runs, the activity panel shows steps appearing in real time ("Reading your transactions… Calculating safe monthly amount… Comparing products…") with elapsed time. The non-streaming path must still work and be covered by tests.
- `docs/LIVE_RUNBOOK.md`: one-page demo-day checklist (env vars, proxy setting, how to confirm the badge says `agent`, 5 test prompts and expected behaviour, what to do when it falls back, how to reset).

### T5 · Readability pass (fixes P6)
Reformat `src/agent/*.js`, `src/tools/*.js` and any other file with lines over about 140 characters into normal multi-line code with consistent naming and short comments only where the *why* is not obvious. **No behaviour change**: the full test suite and eval must produce identical results before and after. No new dependencies and no formatter tooling.

### T6 · Polish the first minute
- The first screen for a persona: greeting plus **three** one-tap suggestions per persona (not one), covering saving, "what if", and a question.
- Cards: consistent hierarchy, the proposal card visually dominant, secondary cards collapsible; the activity panel collapsed by default on phones and on by default on desktop.
- Loading, error and empty states for every card and for provider failure (the badge changes to `offline` with a one-line reason).
- Re-check 1360×900, 1920×1080 (projector) and 390×800. No horizontal scroll, text at least 16 px, contrast at least 4.5:1, focus visible.

### T7 · Connect the acquisition story to the agent (fixes P7)
- In the anonymous web chat, after the first simulation, add a card: **"Want me to use your real spending instead of a guess?"** with **Connect my accounts (demo)**. In demo mode this lets the visitor pick one of the four sample profiles (clearly labelled as sample data, no real banking). It starts an anonymous-session agent turn using that context, produces the capacity analysis and a proposal, and only then asks them to open an account or log in (existing flows) to confirm. The funnel gains the step `context_connected` between `questions_answered` and `account_ready`, visible in `/admin`.
- Confirmation still requires a real account: an unauthenticated session can never confirm a proposal. Add tests for this.

### T8 · Impact model for "Scaling & Growth" (fixes P8)
- `docs/IMPACT_MODEL.md` and `npm run impact -- --visitors=… --chatRate=… --accountRate=… --activationRate=… --monthly=…`: a transparent calculator that turns funnel rates and plan sizes into funded plans per 10 000 ad clicks, assets gathered per month, model cost per activated plan, and a sensitivity table. **Every input is an explicit assumption labelled as hypothetical**; the doc must say there is no production data. Use measured values from this repo only where they are measured (cost per conversation, latency).
- Add a short "What this means for the bank" section: why capacity-aware advice (refusing to push Andrei) protects trust and reduces risk, and how the same agent scales to millions of conversations (stateless handlers, cacheable deterministic tools, provider budget controls).

## Checklist for the reviewer (all must pass, with evidence in `REPORT.md`)

1. `npm test` passes with all existing tests plus new ones; `npm run eval` shows every scenario passing including 25+ new conversational ones, **100% safety**.
2. Following the documented ad → login path as Ioana reaches the agent (`mode` present), not the scripted tree. No duplicate Ioana.
3. For each persona, these questions get sensible, personalised, non-repeating answers in EN and RO without re-planning: market drops, withdrawal, fees, how a fund works, hello, "should I buy bitcoin", "why this product", "what do you know about me".
4. Asking a question after a proposal leaves the proposal confirmable; changing amount, goal, horizon or risk replaces it with an explained diff.
5. `POST /api/demo/reset` restores seed state; two consecutive full demo scripts both succeed.
6. `npm run smoke:live` exists and exits 2 with a helpful message when no credentials are present; mocked-provider tests cover throttling, timeout, auth, wrong model ID and 5xx for all three providers.
7. The UI shows tool steps in real time during a (mock-delayed) turn; non-streaming path still passes tests.
8. No source line in `src/` longer than 140 characters (excluding JSON and long strings in i18n catalogs); test and eval results identical to before the reformat.
9. Anonymous visitors can connect sample context, get a capacity analysis and proposal, and **cannot** confirm without an account; funnel shows `context_connected`.
10. `docs/LIVE_RUNBOOK.md`, `docs/IMPACT_MODEL.md` exist; every number in the impact model is labelled measured or hypothetical.
11. `package.json` still has no dependencies; no secrets in git history or logs.
12. README top section and 3-minute demo script updated and verified step by step, including the reset step.

Priority if time is short: T1, T2, T3, T4 (these decide whether the demo works on the day), then T6, T7, T5, T8.
