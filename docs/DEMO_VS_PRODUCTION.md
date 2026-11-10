# Demo versus real product

> The APK in this repository is a **hackathon demonstration** on the PayPal **Sandbox**. This page
> separates what the demonstration does from how the real product would work, so that the idea is
> judged on its design and the shortcuts are understood as deliberate.

## The idea in one paragraph

Two strangers agree a small job, such as clearing a garage corner for $60. The worker fears doing
the work and not being paid; the client fears paying for work that is not done. HoldProof places a
**PayPal authorization hold** on the client's money **before** the work starts, so the worker can see
the money is reserved. After the work, **AI compares before-and-after photos** against criteria both
sides agreed, a **deterministic Judge** checks the evidence, and only then is the hold **captured**.
If a criterion fails, only its share is refunded; if the job never happens, the hold is voided. A
SHA-256 digest of the agreement and evidence is stored inside the PayPal order, so neither side can
quietly change the record.

The idea is the same in both versions. What changes is **who holds the keys, who runs the checks,
and whose PayPal account is paid**.

---

## Side by side

| Area | Demo (this repository) | Real product |
|---|---|---|
| **PayPal environment** | Sandbox (`api-m.sandbox.paypal.com`), test money | Live (`api-m.paypal.com`), real money |
| **Who calls PayPal** | The Android app, directly | HoldProof backend only; the app never calls PayPal |
| **PayPal keys** | Entered by the tester at runtime, stored in Android Keystore | Kept in the backend's secret manager; never on a phone |
| **Who receives the money** | The one sandbox Business account linked to the entered Client ID (see [SANDBOX_SETUP.md](SANDBOX_SETUP.md#2-how-the-receiver-is-chosen)) | **Each worker's own PayPal account**, connected once through PayPal partner onboarding; the backend sets the order's payee to that worker |
| **Platform fee** | None | Optional platform fee on capture (PayPal partner fees) |
| **Workers and clients** | One phone plays the worker; the client approves on PayPal's page | Worker and client each have a HoldProof account; the client receives the job by link, SMS or email |
| **AI provider and key** | Google Gemini free tier, key entered by the tester | Paid AI tier under a data-processing agreement, key in the backend; images not used for training |
| **Where the Judge runs** | On the phone | On the backend, so a modified app cannot bypass it |
| **Approval detection** | The app polls the order every 3 seconds | PayPal **webhooks**, signature-verified and deduplicated; push notification to the worker |
| **Return after approval** | PayPal returns to the public GitHub project page; the client closes it | Returns to HoldProof's own HTTPS page, which opens the app through a verified Android App Link |
| **Evidence storage** | Photos in the app's private storage; jobs in on-device SQLite | Encrypted object storage with retention rules; jobs in a database; digest still anchored in the PayPal order |
| **Tamper evidence** | Digest in the order's `custom_id`; verify-record screen and PDF/JSON export | Same, plus a server-side audit log and signed records |
| **Hold length** | PayPal Sandbox authorization period | PayPal authorization period (honour period and re-authorization) for longer jobs |
| **Disputes** | Reads disputes; AI drafts a response for the worker to send | Same, plus evidence submitted through the Disputes API from the backend |
| **Identity and fraud** | None | Login, PayPal-verified accounts, rate limits, risk checks and amount limits |
| **Location and photo checks** | GPS and time from the phone; same-place and order checks in the Judge | Same, plus device attestation (Play Integrity) and server-side checks |
| **Compliance** | Hackathon notice before keys are entered | Terms of service, privacy policy, PayPal acceptable-use and partner rules, regional consumer law |

---

## The demo flow (what judges will run)

```
 Tester's phone (worker)                        PayPal Sandbox                  Gemini
 ───────────────────────                        ──────────────                  ──────
 1. Enter sandbox Client ID/Secret + Gemini key
 2. Describe job ─────────────────────────────────────────────────────────────▶ criteria
 3. BEFORE photo + digest
 4. Create order (AUTHORIZE, digest in custom_id) ──▶ order CREATED
 5. QR code / link ──▶ client logs in with a sandbox Personal account, approves
                                                  order APPROVED
 6. App polls, authorizes ─────────────────────────▶ hold placed      → app shows HELD
 7. AFTER photo ──────────────────────────────────────────────────────────────▶ Proposer, Critic
 8. Judge (on phone, 11 fixed checks)
 9. Release ──────────────────────────────────────▶ capture → money to the sandbox Business account
```

Setup steps, accounts and troubleshooting: [SANDBOX_SETUP.md](SANDBOX_SETUP.md).

## The real flow

```
 Worker app          HoldProof backend                          PayPal (live)           AI provider
 ──────────          ─────────────────                          ─────────────           ───────────
 Sign in ──────────▶ account; worker's PayPal connected once ─▶ partner onboarding
 Describe job ─────▶ scope ────────────────────────────────────────────────────────────▶ criteria
 BEFORE photo ─────▶ store evidence, compute digest
                     create order, payee = this worker ───────▶ order CREATED
 Share link ───────▶ client opens HoldProof page → PayPal ────▶ client approves
                     webhook (verified) ◀───────────────────── CHECKOUT.ORDER.APPROVED
                     authorize ───────────────────────────────▶ hold placed
 Push: HELD ◀──────
 AFTER photo ──────▶ Proposer, Critic ─────────────────────────────────────────────────▶ verdicts
                     Judge on server, then capture ───────────▶ money to the worker's own account
 Push: PAID ◀──────  webhook PAYMENT.CAPTURE.COMPLETED ◀───────
```

---

## Why the demo takes these shortcuts

- **No server was a deliberate hackathon choice.** It lets judges run the full loop from one APK
  with their own sandbox keys, and every state the app shows is read back from PayPal.
- **The shortcuts are safe only because the keys are sandbox keys entered by the tester.** A live
  build would never ship a PayPal secret to a phone.
- **What carries over unchanged:** the job scoping, the photo-checkable criteria, the
  hold-before-work lifecycle (create, authorize, capture, void, refund), the digest anchored in the
  PayPal order, the Proposer and Critic agents, and the fail-closed Judge rules. Moving to
  production changes where these run, not what they do.

More detail: [README → Architecture](../README.md#architecture), [ARCHITECTURE.md](ARCHITECTURE.md),
[SECURITY.md](SECURITY.md).
