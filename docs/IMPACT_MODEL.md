# Hypothetical growth and funding model

There is **no production conversion, funding, revenue or live-provider cost data** in this repository. Every calculator input below is a hypothetical assumption. The result is a scenario, not a forecast or a claim about Raiffeisen customers.

```bash
npm run impact -- --visitors=10000 --chatRate=0.15 --accountRate=0.3 --activationRate=0.35 --monthly=300
# Optional hypothetical provider-cost assumption, in USD/conversation:
npm run impact -- --modelCostPerConversation=0.02
```

The dependency-free calculator prints inputs with their evidence labels, expected funded plans per 10,000 clicks, RON monthly contributions, USD model spend per activated plan and a sensitivity table. Invalid rates, non-finite amounts and unknown options fail. Zero activations produce an unknown (`null`) cost per activated plan, not an invented zero.

## Assumptions and formulas

| Input | Hypothetical default | Meaning |
|---|---:|---|
| Visitors | 10,000 clicks | Ad clicks in a hypothetical cohort |
| Chat rate | 15% | Fraction of clicks starting a conversation |
| Account rate | 30% | Fraction of conversations reaching an opened/logged-in account |
| Activation rate | 35% | Fraction of ready accounts assumed to fund a plan |
| Monthly plan | 300 RON | Assumed contribution per funded plan per month |
| Model cost | $0.02/conversation | Hypothetical model spend; **not measured provider pricing** |

All rates are conditional on the previous step. Conversations = visitors × chat rate; accounts = conversations × account rate; funded plans = accounts × activation rate. Plans per 10,000 clicks = funded plans / visitors × 10,000. Monthly assets gathered = funded plans × monthly contribution. Model spend = conversations × assumed model cost; cost per activated plan = model spend / funded plans.

Real output from the default hypothetical scenario (display rounded here; the CLI retains precision):

```text
conversations: 1500
accounts: 450
fundedPlans: 157.5
fundedPlansPer10000Clicks: 157.5
assetsGatheredPerMonthRon: 47250
modelCostUsd: 30
modelCostPerActivatedPlanUsd: 0.19047619047619047
```

Expected plans may be fractional; these are expected values, not observed people. In the app **confirmation does not execute a debit**. This scenario deliberately assumes that activation subsequently funds; production analysis must measure that extra conversion and first-debit success. Monthly assets assume every funded plan contributes every month, with no churn, failed debits or withdrawals. There is no assumed investment return, revenue, FX rate or assets-under-management forecast. Acquisition, infrastructure, advisers, compliance and service costs are excluded from model spend.

## Sensitivity — all hypothetical

One assumption changes at a time; all others stay at their hypothetical defaults. The CLI also prints the input value and results for every row.

| Assumption varied | Lower / upper hypothetical value | Expected funded plans | RON contributions/month | USD model cost/activated plan |
|---|---|---|---|---|
| Chat rate | 12% / 18% | 126 / 189 | 37,800 / 56,700 | 0.1905 / 0.1905 |
| Account rate | 24% / 36% | 126 / 189 | 37,800 / 56,700 | 0.2381 / 0.1587 |
| Activation rate | 28% / 42% | 126 / 189 | 37,800 / 56,700 | 0.2381 / 0.1587 |
| Monthly contribution | 240 / 360 RON | 157.5 / 157.5 | 37,800 / 56,700 | 0.1905 / 0.1905 |
| Model cost/conversation | $0.016 / $0.024 | 157.5 / 157.5 | 47,250 / 47,250 | 0.1524 / 0.2286 |

## Measurements kept separate

- **Measured synthetic quality:** [EVAL_REPORT](EVAL_REPORT.md), 83/83 scripted scenarios and 24/24 safety scenarios. Scripted calls cost zero external model tokens; this is not a live-provider cost estimate.
- **Measured local offline latency:** [SCALE](SCALE.md), 20 completed journeys / 80 requests on the disclosed cloud hardware. The Task 2 run measured 409.49 requests/second, p50 13.3 ms, p95 65.78 ms and p99 92.04 ms. This short, same-process loopback run excludes model latency and does not establish production capacity.
- **Live cost/quality:** currently unavailable. The configured Bedrock smoke run returned authentication/access failures, so no model response or billed-token estimate was measured. A future successful run must supply actual token prices before `/admin` estimates model costs. Unpriced usage stays unknown.

## What this means for the bank

Capacity-aware advice protects trust: Andrei is directed toward a small accessible buffer rather than an unsuitable investment; Mihai keeps tax reserves and Elena protects payroll. Refusing an unsuitable plan can lower immediate activation while avoiding an affordability or suitability failure. No measured risk reduction or commercial uplift is claimed.

The same tools and provider interface can support a larger service, but the current JSON store is a demo. Before serving millions of conversations, replace direct `db` mutations behind scoped repositories with transactional storage, durable sessions and a shared rate limiter. Keep handlers stateless after moving turn locks/progress into shared storage. Cache deterministic simulations by assumptions version; scope financial summaries to customer plus data version and recheck ownership on cache reads. Add fleet-wide provider concurrency limits, per-customer and global monetary budgets, circuit breakers and usage reconciliation. The current agent already caps time, tokens and tool iterations, retries transient calls once and falls back to deterministic tools. Those per-process controls do not constitute a production budget service.

Test conversion as an experiment with consent and a real funded-plan outcome. Compare suitable activation and first successful debit, adviser workload, failure/refusal reasons and retention, alongside cost. Never optimize a headline funnel rate by encouraging a customer to invest their protected buffer.
