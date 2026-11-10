# Architecture

## Components

| Layer | Location | Responsibility |
|---|---|---|
| Screens | `app/src/screens/` | Credentials (with hackathon notice), Home, New job, Evidence camera, Hold (QR + polling), Job, Verdict, Verify record, Disputes, Settings |
| Service | `app/src/services/holdproof.ts` | Job lifecycle: scope → anchor → hold → prove → settle → defend |
| Judge | `app/src/core/judge.ts` | Deterministic capture, refund and void guards. The only gate in front of money calls |
| Digest | `app/src/core/digest.ts` | Canonical record that is hashed into the PayPal `custom_id` |
| Money | `app/src/core/money.ts` | Integer-cent arithmetic and validation |
| PayPal client | `app/src/paypal/client.ts` | Sandbox REST calls, token cache, idempotency keys, error mapping |
| AI agents | `app/src/ai/agents.ts`, `schemas.ts` | Proposer, Critic and dispute drafting; JSON-schema structured output plus Zod validation |
| Storage | `app/src/storage/` | Keystore-backed credentials, SQLite key-value jobs, private evidence photo files |

## Data model (on device)

A `Job` (see `app/src/types.ts`) holds the agreed title, amount, criteria and refused criteria; the BEFORE photo evidence (file name, SHA-256, time, GPS); the canonical record and digest; PayPal identifiers (order, authorization, capture, refunds) with the last status read back from PayPal; every verdict attempt (Proposer output, Critic output, Judge checks, whether executed); and an activity log.

## Job state machine

```
DRAFT ──BEFORE photo──► READY ──create order──► AWAITING_APPROVAL ──client approves + authorize──► HELD
                                                      │                                            │
                                                      └──cancel──► CANCELLED        Judge permits + worker confirms
                                                                                                   │
                                                                     HELD ──void──► VOIDED         ▼
                                                                                               CAPTURED ──(capped refunds)
```

Transitions into HELD, CAPTURED and VOIDED happen only after PayPal's own GET endpoint confirms the new state.

## Evidence anchor

```
canonical = JSON{ v, app, title, amount, currency, criteria[], before{ sha256, capturedAt, lat(5dp), lng(5dp) } }
digest    = SHA-256(canonical)            → 64 hex chars, fits custom_id (max 127)
```

The digest is written into the order before the client approves and shown (12-character prefix) on the QR screen and in the shared agreement. "Verify record" recomputes it from the stored record and photo, and compares it with `purchase_units[0].custom_id` read back from PayPal.

## Hackathon versus production

See the README. In short: the hackathon build calls PayPal Sandbox and the AI provider directly from the phone with user-entered keys; production moves every secret, every PayPal call, webhook handling and the Judge to a backend service.
