# Architecture

## Components

| Layer | Location | Responsibility |
|---|---|---|
| Screens | `app/src/screens/` | Credentials (blocking, scrollable hackathon notice from `SETUP_NOTICE`, re-readable), Home, New job, Evidence camera (refuses photos without GPS; 15 s location timeout with last-known fallback), Hold (QR + polling; stops after five consecutive errors), Job, Verdict, Verify record, Disputes (checked on demand), Settings (full notice, both hosts) |
| Service | `app/src/services/holdproof.ts` | Job lifecycle: scope → anchor → hold → prove → settle → defend |
| Judge | `app/src/core/judge.ts` | Deterministic capture, refund and void guards. The only gate in front of money calls |
| Digest | `app/src/core/digest.ts` | Canonical record that is hashed into the PayPal `custom_id` |
| Money | `app/src/core/money.ts` | Integer-cent arithmetic and validation |
| PayPal client | `app/src/paypal/client.ts` | Sandbox REST calls, token cache, idempotency keys, error mapping |
| AI agents | `app/src/ai/agents.ts`, `schemas.ts` | Proposer, Critic and dispute drafting; JSON-schema structured output plus Zod validation; `max_tokens` 16000 (thinking counts against it), 180 s timeout, one retry; a refusal or a cut-off response fails closed |
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

Recovery rules: an order that reads COMPLETED while the job still waits has already been authorized, so the app reads that authorization back and adopts it. An authorization that reads DENIED, VOIDED or EXPIRED, an order that reads VOIDED, or an order PayPal no longer has (404) ends the job as CANCELLED with no money held. Cancelling an unapproved job checks PayPal first and refuses if the hold is already active. A capture that does not read back as COMPLETED or PENDING leaves the job HELD and voidable; if PayPal reports the authorization as already captured, the app finds the capture on the order and records it. An EXPIRED hold is shown as VOIDED with the real status in the log.

## Evidence anchor

```
canonical = JSON{ v, app, title, amount, currency, criteria[], before{ sha256, capturedAt, lat(5dp), lng(5dp) } }
digest    = SHA-256(canonical)            → 64 hex chars, fits custom_id (max 127)
before.sha256 = SHA-256(base64 text of the stored JPEG, no line breaks)
```

The digest is written into the order before the client approves and shown (12-character prefix) on the QR screen and in the shared agreement. "Verify record" recomputes it from the stored record and photo, and compares it with `purchase_units[0].custom_id` read back from PayPal.

## Hackathon versus production

See the README. In short: the hackathon build calls PayPal Sandbox and the AI provider directly from the phone with user-entered keys; production moves every secret, every PayPal call, webhook handling and the Judge to a backend service.
