# Domain: processes, data, rules, constraints and exceptions

This page documents the retail and small-business investing domain as modelled in the demo. Every figure below comes from repository code. Each rule is labelled **Regulation** (a summary of Romanian or EU law, to be verified by bank compliance) or **Demo bank policy** (an internal policy choice made for this demo).

## 1. Customer journey process

| Step | What happens | Where |
|---|---|---|
| 1. Ad click | A fictional Instagram campaign opens `/ad`; the journey records `ad_click` and its source. | [public/ad.html](../public/ad.html), [src/app.js](../src/app.js), [src/analytics.js](../src/analytics.js) |
| 2. Anonymous simulation | Three questions (monthly amount, main worry, horizon) and an illustrative projection with a stress case. No personal data. | [src/coach.js](../src/coach.js), [src/engine.js](../src/engine.js) |
| 3. Sample connect | "Connect my accounts (demo)" explicitly links one synthetic persona's history to the anonymous journey (`context_connected`). It never sets a user id. | `POST /api/context/connect`, [src/data/context.js](../src/data/context.js) |
| 4. Preview | The agent analyses the sample and may produce a preview proposal. A preview cannot be confirmed and offers login or account opening instead. | [src/tools/index.js](../src/tools/index.js) `request_authentication`, [test/acquisition.test.js](../test/acquisition.test.js) |
| 5. Login or eKYC onboarding | Existing client: phone or email, then demo phone approval. New client: details, ID number, selfie, OTP signature, enforced in order, with OTP expiry and attempt limits (`account_ready`). | [src/bank.js](../src/bank.js), [test/journey.test.js](../test/journey.test.js) |
| 6. Authenticated re-plan | Login invalidates the preview; the agent recomputes on the real (demo) account balance. A new account keeps its own balance (0) even if sample history was linked. | [src/agent/agent.js](../src/agent/agent.js), [src/bank.js](../src/bank.js) |
| 7. Explicit confirm | Only `POST /api/proposals/:id/confirm` with `{ "confirmed": true }` activates a plan, after ownership, expiry, version, risk, segment, horizon and capacity are rechecked (`plan_activated`). | [src/bank.js](../src/bank.js) `confirmProposal` |
| 8. Scheduled debit | Confirmation does not move money. A separate demo action runs a debit, which checks funds and protected reserves (`first_debit_executed`). | [src/bank.js](../src/bank.js) `runDebit` |

## 2. Data used

All data is synthetic and deterministic ([src/data/personas.js](../src/data/personas.js)), seeded with a fixed PRNG and fixed as of **2026-02-28**. Transactions cover March 2025 to February 2026 (12 months). Income minus spend equals the balance change for every persona ([test/data.test.js](../test/data.test.js)).

- **Transactions:** date, amount (positive income, negative spend), category, merchant, `recurring` flag.
- **Categories:** essentials are `rent`, `utilities`, `groceries`, `transport`, `health` ([src/tools/finance.js](../src/tools/finance.js) `ESSENTIALS`); others include subscriptions and discretionary spending.
- **Recurring bills and subscriptions:** derived from recurring negative transactions per merchant.
- **Obligations:** Mihai has a 12,000 lei March tax reserve due 2026-03-20; Elena has 14,000 lei payroll due 2026-03-10.
- **Balances:** Ioana 18,400 lei, Andrei 1,150 lei, Mihai 31,000 lei, Elena 95,000 lei.
- **Products:** 8 products in [src/products.js](../src/products.js): diversified fund (risk 3), bond fund (2), term deposit (1), voluntary pension (3), stocks and ETFs (5), flexible buffer savings (1), business deposit ladder (1), business liquid reserve (1). Fees, returns and settlement days are demo values.

Capacity results computed by `capacity()` for the seed data:

| Persona | Essentials / month | Buffer months | Buffer | Obligations | Idle cash | Surplus / month | Safe monthly |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ioana | 3,400 | 3 | 10,200 | 0 | 8,200 | 1,000 | 500 |
| Andrei | 1,700 | 1 | 1,700 | 0 | 0 (short 550) | 50 | 0 (micro-saving 100) |
| Mihai | 3,000 | 6 | 18,000 | 12,000 | 1,000 | 1,383.33 | 200 |
| Elena | 8,000 | 3 | 24,000 | 14,000 | 57,000 | 6,500 | 2,000 (ladder 3 x 19,000) |

## 3. Rules

The rule cards live in [src/domain/rules.js](../src/domain/rules.js) (version `2026-02-28.1`, 18 cards, 7 topics, English and Romanian). The `check_rules` tool returns them with a disclaimer; `compare_products` attaches the relevant rule topic ids and a protection label to each product. Tests: [test/rules.test.js](../test/rules.test.js).

| Rule id | Type | Summary | Source | How code uses it |
|---|---|---|---|---|
| `fgdb-deposit-cover` | Regulation | Eligible deposits covered up to 100,000 EUR per depositor per bank | FGDB; Law 311/2015; Directive 2014/49/EU | `protectionOf()` labels deposits `deposit_guarantee`; protection questions answer from this card |
| `not-a-deposit` | Regulation | Funds, pension assets, stocks and ETFs are not deposits; value can fall | Law 311/2015; Directive 2014/49/EU | Investments labelled `not_deposit` in comparisons |
| `depositary-segregation` | Regulation | Fund assets held by an independent depositary | UCITS Directive 2009/65/EC; Law 204/2006; ASF | Cited for fund and pension protection questions |
| `investor-compensation` | Regulation | Investor compensation up to 20,000 EUR, never for market losses | FCI; Directive 97/9/EC | Cited for fund and stock protection questions |
| `pension-rights-guarantee` | Regulation | Private pension rights have a separate guarantee fund | FGDSPP; Law 204/2006; ASF | Cited for voluntary pension |
| `term-lock` | Demo bank policy | Term deposits locked until maturity; early break forfeits interest in the demo | Demo product terms | `redeemable: false`, `liquidity: 'locked'` in `products.js` |
| `redemption-settlement` | Demo bank policy | Units and securities settle in days (funds 3, stocks 2) | Demo product terms; prospectus | `settlementDays` in `products.js` |
| `pension-withdrawal` | Regulation | Pension payout generally from age 60 after 90 monthly contributions | Law 204/2006; ASF | `minHorizonYears: 10` for voluntary pension |
| `instant-access` | Demo bank policy | Buffer accounts keep instant access | Demo product terms | `liquidity: 'instant'` |
| `mifid-assessment` | Regulation | Appropriateness or suitability assessment before investment sale | MiFID II Art. 25; Law 126/2018; ASF | Demo uses one explicit risk question (`set_risk_profile`) |
| `demo-risk-cap` | Demo bank policy | Risk answer caps product risk | `RISK_CAP` in `products.js` | `allowedFor()`, `compare()`, `checkProposal()` |
| `horizon-fit` | Demo bank policy | Goal horizon must be at least the product's minimum horizon | `products.js` | `checkProposal()` horizon check |
| `pillar3-deduction` | Regulation | Pillar III contributions deductible up to 400 EUR per year | Fiscal Code (Law 227/2015); Law 204/2006 | Answer to pension questions; no personal tax computed |
| `no-tax-advice` | Demo bank policy | Coach protects tax obligations but gives no tax advice | Bank digital guidance policy (demo) | Tax questions cite this and offer an adviser |
| `pfa-single-declaration` | Regulation | Freelancer (PFA) taxes paid through the annual single declaration | Fiscal Code; ANAF Declaratia unica | Mihai's tax question cites it; reserve stays non-investable |
| `buffer-months` | Demo bank policy | Essentials reserved first: 3 months salaried and business, 6 irregular, 1 part-time | `capacity()` in `finance.js` | `bufferMonths` |
| `obligations-protected` | Demo bank policy | Taxes and payroll are never investable | `capacity()` in `finance.js` | `obligationTotal` subtracted from idle cash |
| `segment-match` | Demo bank policy | Business products only for business customers and vice versa | Product governance (demo) | `checkProposal()` segment check (HTTP 403) |

## 4. Constraints

All are **demo bank policy** unless stated; file paths point at the enforcing code.

- **Buffer months per income pattern:** salaried 3, business 3, irregular 6, part-time 1 ([src/tools/finance.js](../src/tools/finance.js) `capacity()`).
- **Half-of-surplus cap:** the safe monthly amount is at most half the observed monthly surplus, rounded down to 50 lei, capped at 2,000 lei, and only once the buffer is ready (`safeMonthly`).
- **Irregular income cap:** at most 200 lei per month for irregular income (Mihai).
- **Minimum amount:** every product has `minMonthly: 100` ([src/products.js](../src/products.js)); `simulate` accepts 100 to 2,000 lei ([src/tools/index.js](../src/tools/index.js)).
- **Risk caps:** `RISK_CAP = { low: 2, medium: 3, high: 5 }` ([src/products.js](../src/products.js)); the risk answer must come from the customer, never from the model (`set_risk_profile`, [test/tools.test.js](../test/tools.test.js)).
- **Minimum horizon:** term deposit 1 year, voluntary pension 10, other individual market products 3, business ladder 0.25, buffer and liquid reserve 0.
- **Segment checks:** product `segment` must equal customer `segment` ([src/bank.js](../src/bank.js) `checkProposal`).
- **Proposal expiry and versioning:** proposals are frozen objects bound to customer, journey, product, amount, risk and version, expiring after 10 minutes. Any new proposal, risk answer, amount or goal change increments `journey.proposalVersion`; confirming an older version returns HTTP 409, an expired one HTTP 410 ([src/bank.js](../src/bank.js) `proposePlan`, `confirmProposal`; [test/unexpected.test.js](../test/unexpected.test.js)).
- **Agent limits:** 6 tool iterations, 30 s turn deadline, 20 s per provider call, 24,000-token budget ([src/agent/agent.js](../src/agent/agent.js)).
- **Regulation:** an investment needs an appropriateness or suitability assessment before sale (MiFID II). The demo's one risk question is an explicit stand-in.

## 5. Exceptions

- **Micro-saving without a buffer:** when the buffer is not ready but surplus plus half of subscription spend reaches 100 lei, a 100 lei/month micro-saving into `buffer-savings` is the only allowed proposal (Andrei). A real deficit blocks it ([src/tools/finance.js](../src/tools/finance.js), [src/bank.js](../src/bank.js) `checkProposal`; [test/safety.test.js](../test/safety.test.js) "a deficit cannot be hidden ...").
- **Hypothetical bonus:** `what_if` with a bonus shows a diff but never changes balances or funds a real proposal ([test/safety.test.js](../test/safety.test.js) "what-if values must come from the user and a hypothetical bonus cannot unlock investments"; eval `bonus-student`, `hypothetical-no-money`).
- **Rent increase:** a user-entered rent increase lowers capacity and is rechecked at confirmation ([test/safety.test.js](../test/safety.test.js)).
- **Business payroll and seasonal lows:** payroll is an obligation; the cash-flow low reserve is the largest monthly spend-over-income gap in the history (0 for Elena's synthetic data). Idle cash is split into a 3-step deposit ladder rounded down to 100 lei.
- **Mihai's tax reserve:** the 12,000 lei obligation is subtracted before capacity and cited with the PFA single-declaration rule; the coach does not compute personal tax.
- **New account without history:** keeps its own balance (0), never inherits a sample's cash, and gets no invented capacity; it is offered sample connection, buffer savings or an adviser ([test/acquisition.test.js](../test/acquisition.test.js)).
- **Deposit-protection questions:** the word "guarantee" normally triggers a refusal of return guarantees; questions about deposit cover are exempt, unless they also ask for promised returns ([src/agent/conversation.js](../src/agent/conversation.js) `PROTECTION`, [src/agent/safety.js](../src/agent/safety.js); eval `rules-guarantee-return-still-refused`).
- **Business owner as individual:** a business customer can hold individual products only in a separate personal relationship (rule `segment-match`).

All rule statements are informational summaries as of 2026-02-28, not legal or tax advice, and are flagged `verifyWith: 'bank compliance'`.
