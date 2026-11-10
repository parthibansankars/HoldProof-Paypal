## How HoldProof meets the technology requirement

HoldProof integrates the **PayPal developer platform in the free Sandbox environment** with **Google's Gemini model**. PayPal holds, releases and records the money, and anchors the evidence; Gemini checks the work. Neither can complete the loop alone: AI never moves money, and a deterministic Judge sits between the AI verdict and every PayPal call.

### PayPal tools (Sandbox, `api-m.sandbox.paypal.com`)

| PayPal tool | What it does in HoldProof |
|---|---|
| **PayPal Developer Dashboard: Sandbox app (REST credentials)** | Provides the Client ID and Secret the app uses. The host is hard-coded to the Sandbox; there is no production switch. |
| **OAuth 2.0 token API** (`POST /v1/oauth2/token`) | Exchanges the sandbox credentials for an access token for all other calls. |
| **Orders API v2, intent `AUTHORIZE`** (`POST /v2/checkout/orders`) | Creates the hold order for the agreed job amount. The SHA-256 evidence digest (criteria, price, BEFORE photo hash, time, GPS) is written into `purchase_units.custom_id` **before the client approves**, so PayPal stores a tamper-evident anchor of the agreement. |
| **PayPal approval page with Sandbox buyer accounts** | The client scans a QR code and approves the hold with a PayPal Sandbox personal account. The client's credentials never touch the app. |
| **Orders API v2: get and authorize** (`GET /v2/checkout/orders/{id}`, `POST …/authorize`) | Polls until the client approves, then places the authorization hold. The worker sees **HELD** before starting. The same GET reads `custom_id` back for **Verify record**. |
| **Payments API v2: authorizations** (`GET`, `POST …/capture`, `POST …/void`) | Reads the hold status and expiry; **captures** the payment only when the Judge permits and the worker confirms; **voids** the hold if the job is abandoned. |
| **Payments API v2: captures and refunds** (`GET /v2/payments/captures/{id}`, `POST …/refund`, `GET /v2/payments/refunds/{id}`) | Confirms each capture by read-back and issues a **capped partial refund** when the client contests one criterion on site. |
| **Disputes API v1** (`GET /v1/customer/disputes`, `GET /v1/customer/disputes/{id}`) | Checks whether a dispute exists for the capture, so the app can draft a response from the evidence record. |
| **`PayPal-Request-Id` idempotency** | Sent on every POST, so a retried capture, refund or void cannot run twice. |

Every money state shown in the app comes from a PayPal GET response. An AI statement is never treated as proof of payment.

### AI tool

| AI tool | What it does in HoldProof |
|---|---|
| **Google Gemini API, model `gemini-3.5-flash-lite`** (free tier, key from Google AI Studio), called through the REST `generateContent` endpoint | Powers two independent agents. Every call requests **structured JSON output** against a fixed JSON Schema and sends photos as inline images; the app validates every answer again with Zod. A blocked prompt, a safety stop, a cut-off or an invalid answer fails closed. |
| → **Proposer agent** (Gemini call) | (1) Turns the worker's plain-language job description into 2–4 acceptance criteria that a photo can verify, and **refuses** criteria a photo cannot prove, such as "good quality". (2) Uses **vision** to compare the BEFORE and AFTER photos and returns a pass/fail verdict with a reason for each criterion, plus a same-scene check. (3) Drafts a dispute response using only facts in the evidence record. |
| → **Critic agent** (separate Gemini call) | Receives the photos and only the Proposer's pass/fail flags, and looks for reasons the verdict is wrong (different scene, unmet or invisible criterion, poor image). It can object but never turn a FAIL into a PASS. It also removes unsupported statements from the dispute draft. |

### How the two connect

```
Gemini Proposer ──► Gemini Critic ──► Judge (deterministic code, 11 checks) ──► worker confirms ──► PayPal capture ──► PayPal read-back
```

The Judge is plain, unit-tested code, not AI. It permits a capture only when both agents agree, every criterion passed, the amount equals the agreed amount, the hold is active, and both photos were taken in the same place in the right order.

### Hackathon build note

This build has no server: the Android app calls PayPal Sandbox and the Gemini API directly, using keys the tester enters at first launch and stores only in Android encrypted storage. In production, a HoldProof backend would hold the secrets, make the PayPal calls, verify webhooks, and run the Judge.

Not used: the PayPal Agent Toolkit, the PayPal MCP server and webhooks. They need a server, and this build has none.
