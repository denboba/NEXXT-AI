# Business case: users, value and adoption

This page explains who the agent serves, which bank problem it addresses, how value is measured and how a bank could adopt it. Numbers come only from repository code or scripts; every growth figure is labelled **hypothetical**.

## 1. Users and their pains

| User | Profile (synthetic) | Pain today | What the agent does |
|---|---|---|---|
| Salaried saver (Ioana) | 7,200 lei income, 18,400 lei balance, apartment in 7 years | Money idles in a current account; unsure how much is safe to invest or which product fits | Keeps a 10,200 lei buffer, shows 500 lei/month is safe, compares fund vs deposit, proposes a plan she confirms |
| Student (Andrei) | Part-time income, 1,150 lei balance | Tempted by trading apps before having any emergency money | Says "do not invest yet", 100 lei/month buffer savings, names subscriptions to trim |
| Freelancer (Mihai) | Irregular income, 31,000 lei, tax due in March | Risk of investing money that is owed to the tax authority | Protects the 12,000 lei tax reserve and a 6-month buffer; caps the plan at 200 lei/month |
| Small business (Elena) | Seasonal bakery, 95,000 lei, 14,000 lei payroll | Idle business cash, fear of missing payroll | Protects payroll, builds a 3-step deposit ladder, excludes consumer products |
| New customer from an ad | No account yet | Long, generic onboarding before seeing any personal value | Preview from sample data before login, then guided eKYC onboarding and a fresh plan |

## 2. The bank's problem

- **Funnel drop-off between interest and first investment.** A customer who clicks an investment ad still has to understand products, open an account, pass suitability and set up a plan. Each step loses people. The demo instruments every stage: `ad_click`, `chat_started`, `questions_answered`, `context_connected`, `account_ready`, `plan_activated`, `first_debit_executed` ([src/analytics.js](../src/analytics.js)).
- **Advice capacity is expensive.** Human advisers cannot hold a personalised conversation with every app user. The agent handles the routine analysis and hands off when asked (`handoff_to_adviser`, adviser queue in `/admin`).
- **Mis-selling risk.** Growth that pushes customers to invest their emergency money or tax reserve creates complaints, regulatory exposure and churn. The agent's server-side checks (buffer, obligations, risk cap, segment, horizon, explicit confirmation) are designed to make an unsuitable sale structurally hard ([src/bank.js](../src/bank.js) `checkProposal`).

## 3. Value proposition

**For the customer:** a concrete, personal answer in one conversation: how much is safe, what to keep accessible, which product fits and why, with cited rules (for example deposit cover up to 100,000 EUR, or that a fund is not a deposit) and an honest "not yet" when appropriate. Available in English and Romanian.

**For the bank:**
- A shorter path from ad to funded plan, measured end to end.
- Suitability and affordability evidence for every proposal (versioned, immutable, audited).
- Adviser time focused on customers who ask for it or need it.
- Provider-agnostic design (Anthropic, OpenAI-compatible, Amazon Bedrock) with a deterministic offline fallback, so the service degrades instead of failing.
- Operating cost visibility: token usage and cost per conversation and per activated plan in `/admin` (unknown, never zero, when prices are not configured).

## 4. KPIs already instrumented

| KPI | Source |
|---|---|
| Funnel counts and step conversion from ad click to first debit, by campaign source | `funnel()` in [src/analytics.js](../src/analytics.js), `GET /api/admin/metrics` |
| New vs existing customers reaching an account | `account_ready` events |
| Conversations per day, agent vs offline mode split, tool use, refusals by reason | `agentMetrics()`, `GET /api/admin/agent-metrics` |
| Proposals, confirmations, activated plans, proposal-to-confirmation conversion | `agentMetrics()` |
| Model cost per conversation and per activated plan | `agentMetrics()` with `LLM_INPUT_USD_PER_MILLION` / `LLM_OUTPUT_USD_PER_MILLION` |
| Adviser handoff queue | `GET /api/admin/handoffs` |

## 5. Hypothetical impact

[docs/IMPACT_MODEL.md](IMPACT_MODEL.md) and `npm run impact` give a transparent funnel calculator. With its **hypothetical** default inputs (10,000 clicks, 15% chat rate, 30% account rate, 35% activation rate, 300 RON per plan per month, USD 0.02 model cost per conversation) it prints 1,500 conversations, 450 accounts, 157.5 expected funded plans, 47,250 RON monthly contributions and about USD 0.19 model cost per activated plan. These are assumptions, not forecasts; there is no production conversion, revenue or live model cost data in this repository. A pilot must replace each input with measured values.

## 6. Adoption path

1. **Internal pilot with existing app users.** Existing clients already have real history, so the authenticated path (login, re-plan, confirm) can run first, behind a feature flag, with the anonymous ad flow added later.
2. **Compliance and legal review.** Verify every rule card in [src/domain/rules.js](../src/domain/rules.js) (all are flagged `verifyWith: 'bank compliance'`), the wording, GDPR consent and retention, and replace the single risk question with the regulated suitability questionnaire.
3. **Replace stand-ins.** Follow the "Going from demo to production" table in the [README](../README.md#going-from-demo-to-production): core banking and investment APIs instead of `bank.js`, a real eKYC provider, SMS and push approval, a transactional database, confirmed product terms.
4. **Validate the live model.** Fix provider access (the current Bedrock smoke run returns HTTP 403), run `npm run eval -- --live` against the same 83 scenarios and require the agreed pass rate before exposure. See [docs/LIVE_RUNBOOK.md](LIVE_RUNBOOK.md).
5. **A/B rollout.** Compare the agent journey against the current journey on suitable activation, first successful debit, adviser workload, refusal reasons, complaints and retention, not only headline conversion.
6. **Adviser handoff in production.** Route `handoff_to_adviser` into the bank's CRM or adviser scheduling.

## 7. Risks and mitigations

| Risk | Mitigation in the demo | Still needed |
|---|---|---|
| Model invents figures or promises returns | Numeric guard, refusal of return guarantees, one retry then safe template | Live-model evaluation at scale |
| Prompt injection or data leakage | Prefilter, tools accept no customer id, untrusted data separation, audit redaction | Security review, red teaming with a live model |
| Unsuitable or unaffordable sale | Server checks at proposal and confirmation; explicit Confirm only | Regulated suitability questionnaire |
| Regulatory text out of date | Versioned rule cards with source and as-of date | Compliance ownership and update process |
| Provider outage or cost spike | Deadlines, token budget, offline fallback, cost reporting | Fleet-wide budgets and circuit breakers |
| Scale | Load runner and [SCALE](SCALE.md) report (local, not production capacity) | Shared transactional storage and stateless handlers |

## 8. Next steps

- Restore live model access and publish a live eval report.
- Pilot with a small cohort of existing customers and measure the funnel with real data.
- Extend the rule base with compliance-owned content and more topics (fees disclosure, cooling-off rights).
- Add more business tools (cash-flow forecast, invoice timing) for the SMB segment.
