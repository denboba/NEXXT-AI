# Demo-day live-agent checklist

The offline planner is a reliable fallback, not a live-model validation. Complete this checklist before calling the demo live.

1. Run `npm run setup`, `npm test` and `npm run eval`. Never paste keys into chat, logs, source files or a PR.
2. Configure one provider in secure environment settings or the ignored `.env`:

   | Provider | Settings |
   |---|---|
   | Bedrock | `LLM_PROVIDER=bedrock`, `AWS_REGION=eu-west-2`, `AWS_BEARER_TOKEN_BEDROCK`, exact `BEDROCK_MODEL_ID` |
   | Anthropic | `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, supported `COACH_MODEL` |
   | Compatible | `LLM_PROVIDER=openai`, `COMPAT_API_KEY`, HTTPS `COMPAT_BASE_URL` including API prefix, `COACH_MODEL` |

   The requested Opus 5.5 display name is not a verified Bedrock identifier. Use a foundation-model ID or inference-profile ID/ARN available to your account in London. The app never invents or substitutes one. A malformed identifier produces `model_not_found` with an operator hint.

3. Allow the chosen provider hostname through the managed proxy. Bedrock: `bedrock-runtime.eu-west-2.amazonaws.com`; Anthropic: `api.anthropic.com`; compatible: the configured hostname. Preserve inherited proxy and CA configuration. Use Node 24+ with startup activation:

   ```bash
   NODE_USE_ENV_PROXY=1 npm run smoke:live
   NODE_USE_ENV_PROXY=1 npm start
   ```

4. The smoke runner uses a fresh local in-memory app and sends exactly these five prompts. It never confirms a plan or executes a bank operation:

   | Persona | Prompt | Expected behavior |
   |---|---|---|
   | Ioana | I have some spare cash, what should I do? | Profile, spending and safe capacity; compare a longer-term option; ask one risk question if unanswered. |
   | Andrei | I don't know where to start saving | Build the buffer first; do not push an investment. |
   | Mihai | Help me plan around my tax bill and irregular income | Protect the tax obligation and irregular-income buffer. |
   | Elena | Help plan my business surplus after payroll | Protect payroll; compare business liquidity and a deposit ladder. |
   | Ioana | I need the money for a car in 2 years | Re-plan with a shorter horizon and explain the diff; require suitability and confirmation. |

   It prints `mode`, actual tool sequence, per-provider-call and attempt latency, total latency, usage, guard outcome and PASS/FAIL. Exit 2 means missing credentials/configuration and five unrun prompts; exit 1 means a failed live path. A fallback does not count as a live pass. The full live quality target still requires `npm run eval -- --live`.

5. In the UI, select Ioana or use the documented phone login and send a prompt. Confirm the **answer** badge says `agent`; a configured key alone is not evidence. Expand activity: steps should arrive while the provider runs, followed by actual tool calls and timings. The normal non-streaming POST API is still supported.
6. Ask about fees, withdrawal and a market drop. Verify the answer is relevant and the current proposal remains available. Change the horizon or amount and verify an explained replacement. Confirm only after reviewing the proposal; a chat “yes” cannot activate it.
7. Use **Reset demo** before repeating the booth script. It resets all four fictional profiles and their conversations for all demo visitors, removes plans/proposals/ledger entries, signs out affected sessions and audits the reset. It is demo-only, same-origin and rate-limited. It is blocked while a turn is running.

## If it falls back

The badge becomes `offline`, and the activity trace records a safe reason code. No credential, request header or raw provider error body is logged.

| Code | Action |
|---|---|
| `auth` | Check the secure key and model access. Do not repeatedly retry an authorization failure. |
| `model_not_found` | Verify the exact model ID/profile and Region; use the console identifier rather than a display name. |
| `throttled` | The adapter tried at most one short retry; reduce demo concurrency or use offline mode. |
| `server_error`, `network` | Check provider health and allowed hostname/proxy route. One eligible transient retry is bounded by the deadline. |
| `timeout` | `LLM_CALL_TIMEOUT_MS` defaults to 20 seconds; `LLM_TIMEOUT_MS` defaults to 30 seconds, maximum 60. Prefer a responsive model over an unbounded spinner. |
| `bad_request`, `bad_response` | Verify API/model compatibility; use the recorded classification without publishing raw response data. |
| `guard_rejection` | The model failed numeric/policy validation after one correction request; the deterministic tools and templates answer safely. |

Short polling retrieves only the current session's turn events. Neither polling nor the model can confirm a plan. Cost remains unknown when rates or complete provider usage are unavailable. Configure actual per-million rates only when known. This environment has not supplied a provider key/model binding; mocked adapter and delayed-turn tests are distinct from a real live run.
