# NEXXT-AI · Raiffeisen AI Investment Coach

A working platform that turns a social ad into a first investment in one conversation.

**Social ad → chat in the browser → open an account or log in → the same chat continues inside the account → plan activated → first debit.**

![Chat with live simulation](docs/screenshots/chat-simulation.png)

## Run it

Needs Node 20+ (no `npm install`, there are no dependencies).

```bash
npm start
```

| URL | What it is |
|---|---|
| http://localhost:3000/ad | Fake social feed. Each ad opens the chat with its channel and campaign, so the funnel is attributed. |
| http://localhost:3000/ | The coach. |
| http://localhost:3000/admin | Funnel metrics and adviser call requests (token: `ADMIN_TOKEN`). |

**Try it:** click an ad, answer the three questions, open an account (the demo SMS code is shown on screen), answer the risk question, activate the plan, add demo money and run the first debit.
**Existing client:** log in with `+40 722 000 111` (Ioana Popescu, 2,500 lei) and approve on the demo phone.

Copy `.env.example` to `.env` to change the port, admin token, or enable the optional Claude answers.

```bash
npm test      # 23 backend tests: engine, coach, onboarding, login, plans, funnel, security
```

## What it does

| Step | Behaviour |
|---|---|
| **1 · Social ad** | `/?src=instagram&cmp=cash-loses` creates a tracked journey (cookie session). |
| **2 · Chat** | Three questions (how much, what worries you, how long), then a live simulation: 500 lei/month for 5 years is **35,771 lei** invested vs **26,379 lei** as cash in today's money (+9,392 lei). A slider and year buttons re-run it. One-tap answers for the worries: market drops (with a worst-timed 20% fall), withdrawing, fees, how a fund works. Free text is matched to the same answers. A person is one tap away (adviser call request with the conversation attached). |
| **3 · Two doors** | **New customer:** details, ID card number, selfie, SMS-code signature. Creates the profile, an account and a yellow virtual card. Steps are enforced in order, the code expires after 5 minutes and locks after 5 wrong tries, and only the last 4 ID characters are stored. **Existing client:** login request, approved on the "phone". Either way the conversation, amount, worry and horizon carry over. |
| **4 · In the account** | The coach greets by name, recalls the plan, asks one suitability question (how you would react to a 15% drop), then recommends a product and shows the shelf. Products above the customer's comfort level are shown but locked. One tap activates a monthly plan. Demo-only buttons add money and run the monthly debit; plans can be stopped. The coach checks in after each debit. |
| **Metrics** | `/admin`: ad click → chat started → 3 questions answered → account opened/logged in → plan activated → first debit executed, with conversion at each step, new vs existing clients, filter by channel, and adviser requests. |

![Product shelf with suitability gate](docs/screenshots/in-app-products.png)

## How it is built

```
public/        the web app (vanilla JS, no build step): chat, onboarding, login, account, ad page, admin
server.js      entry point
src/app.js     HTTP server, routes, sessions, rate limits, security headers
src/coach.js   the conversation: scripted steps + intents + optional LLM
src/engine.js  the only source of investment numbers
src/bank.js    stand-ins for the bank's systems: customers, eKYC, SMS signing, accounts, cards, plans, ledger
src/products.js product shelf and suitability caps
src/analytics.js funnel events
src/llm.js     optional Claude answers with a numbers guardrail
src/store.js   JSON-file persistence (data/db.json)
```

**The AI talks, the bank's systems do the numbers, identity checks and money movement.** Concretely:

- Every figure shown comes from `engine.js` or the product catalogue, never from a language model.
- Optional: set `ANTHROPIC_API_KEY` and unmatched free-text questions are answered by Claude. Any reply containing a figure that is not in the facts the bank supplied is discarded and the scripted fallback is used instead.
- The coach never moves money. Plans are created and debited only through `bank.js`, after a suitability check.
- Results carry "Simulation only · past returns don't guarantee future results".

### API (JSON, cookie session)

`POST /api/journey` · `POST /api/chat` · `GET /api/simulate?monthly=&years=` · `POST /api/signup/{details,id,selfie}` · `POST /api/signup/otp/{request,verify}` · `POST /api/login/request` · `GET /api/login/status` · `GET /api/me` · `POST /api/plans` · `POST /api/plans/:id/{run-debit,stop}` · `POST /api/handoff` · `GET /api/admin/{metrics,handoffs}` (header `x-admin-token`)

## Going from demo to production

The demo is complete end to end, but these parts are deliberately stand-ins and must be replaced before real customers use it:

| Demo stand-in | Replace with |
|---|---|
| `bank.js` customer records, accounts, ledger, plans | Raiffeisen core banking and investment platform APIs |
| ID card number check, selfie flag | A real eKYC provider (document scan, liveness, face match) |
| SMS code returned on screen (`DEMO_MODE=1`) | An SMS provider. Set `DEMO_MODE=0`: codes are never returned, and top-up, run-debit and phone-approval endpoints are disabled |
| "Approve" on the demo phone | Push approval in the real Raiffeisen app |
| `data/db.json` | A real database |
| Fees, settlement days, return and inflation assumptions (`products.js`, `engine.js`) | The product team's confirmed figures |
| Appropriateness check = one question | The bank's regulated suitability / appropriateness questionnaire |
| English only | Romanian (and other) copy, reviewed by compliance |

Also before launch: legal and compliance review of all wording, GDPR consent and retention, HTTPS in front of the server, and a strong `ADMIN_TOKEN`.

![Funnel metrics](docs/screenshots/admin-funnel.png)

## Pitch deck

The summit deck is in `deck/` and `source/` (the original product overview). Live deck: https://claude.ai/artifact/Lvt21B54qY9D9EPxJBwTu2
