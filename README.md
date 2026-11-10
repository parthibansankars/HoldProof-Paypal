# HoldProof

**A PayPal hold the worker sees before starting, captured only when AI confirms before-and-after photos meet the agreed job. One phone, no server, tamper-evident record.**

> ⚠️ **Hackathon demonstration only.** HoldProof was built for the PayPal AI Hackathon 2026.
> It works only with **PayPal Sandbox** credentials and never moves real money.
> Never enter production PayPal credentials. The PayPal host is hard-coded to the sandbox,
> and the app shows this notice in a popup before any key can be entered.

### The setup notice shown in the app

On first launch, before any key can be entered, HoldProof shows a scrollable popup that the back button cannot dismiss. **Verify and save securely** stays disabled until the user presses **I understand — use sandbox keys only**. The same notice can be reopened from the setup screen (**Read the hackathon notice again**) and is shown in full in **Settings**. The text lives in [`app/src/config.ts`](app/src/config.ts) (`SETUP_NOTICE`) and covers:

| Section | What it says |
|---|---|
| What HoldProof is | A PayPal authorization hold that the client approves before work starts, captured only after AI checks the before-and-after photos against the agreed criteria and a deterministic Judge permits it. |
| Hackathon demonstration, Sandbox only | Built for the PayPal AI Hackathon 2026. PayPal Sandbox only; never moves real money; never enter production (live) PayPal credentials; the PayPal host is hard-coded to the sandbox. |
| Why the app asks for keys | This build has no server-side code. It calls PayPal Sandbox and the AI provider directly from the phone. This is acceptable only because the keys are sandbox and test keys entered by the person testing. |
| The three keys | **PayPal Sandbox Client ID and Client Secret**: obtain an access token; create the order, authorize, capture, refund, void; read order, payment and dispute status. **Anthropic API key**: Proposer and Critic calls on `claude-opus-5-5`. |
| Where the keys are stored | Only in this device's encrypted storage (Android Keystore through `expo-secure-store`). Never in the APK, source code, logs, the activity timeline, evidence records or PDF/JSON exports. |
| Where keys and data are sent | Keys go only to `api-m.sandbox.paypal.com` and `api.anthropic.com`. To `api.anthropic.com`: the job description and price, the agreed criteria, the BEFORE and AFTER photos and, for a dispute draft, the dispute summary and the evidence record (including photo times and locations). To `api-m.sandbox.paypal.com`: the job title, the amount, the evidence digest, a job reference id (also used to build the capture invoice id) and, for a partial refund, the text of the contested criterion in the note to the client. Nothing is sent anywhere else; there is no HoldProof server and no analytics. |
| AI cost | Billed to the owner of the Anthropic API key. Each photo check makes two AI calls. |
| How to get the keys | PayPal Developer Dashboard → Apps & Credentials → Sandbox → create or open a REST app; Anthropic Console → API keys. The sandbox **buyer** account is used by the client on PayPal's own approval page and is never entered into the app. |
| How to remove the keys | Settings → **Remove keys from this device**, or uninstall the app. |
| Production design | Keys never on the phone; HoldProof's own backend holds the secrets, calls PayPal, verifies PayPal webhook signatures and runs the Judge server-side. |
| Honest limits | An authorization hold with AI evidence checking, not escrow and not a neutral arbiter. Photos can be staged and GPS can be spoofed; the record proves it was not changed after approval, not that the photos are truthful. PayPal decides disputes. |

---

## The problem

A solo worker doing a small in-person job for a stranger (cleaning, junk removal, garden clearance, furniture assembly) starts work with nothing committed by the client. The client will not pay a deposit to a stranger. Afterwards, neither side has a reliable record of what was agreed and what was delivered, so a PayPal dispute is argued from memory.

## What HoldProof does

One Android app runs one loop:

| Step | What happens | Who decides |
|---|---|---|
| **1. Scope** | The worker describes the job. The Proposer agent turns it into 2–4 criteria a photo can verify and refuses criteria it cannot verify (for example "good quality"). | AI proposes, worker agrees |
| **2. Anchor** | The worker takes a BEFORE photo with the in-app camera (no gallery). Location must be on: the app refuses to record a photo without GPS. HoldProof hashes the criteria, price and photo (photo hash, time, GPS) into an evidence digest. The photo hash is SHA-256 over the base64 text of the stored JPEG (see [Verifying a record](#verifying-a-record-by-hand)). | Deterministic code |
| **3. Hold** | HoldProof creates a PayPal order with intent `AUTHORIZE` and writes the digest into `custom_id`. The client scans a QR code and approves in PayPal Sandbox. The app polls PayPal, authorizes, and shows **HELD**. | Client approves in PayPal |
| **4. Prove** | The worker takes an AFTER photo. The Proposer proposes a verdict per criterion; the Critic independently looks for reasons the verdict is wrong. | Two AI agents |
| **5. Settle** | The Judge (deterministic, unit-tested code) is the only component that may call PayPal. If every check passes, the worker confirms and PayPal captures. A refused check makes **no PayPal call**. A contested criterion can be refunded on site (capped); an abandoned job is voided. | Judge permits, worker confirms, PayPal confirms |
| **6. Defend** | "Verify record" recomputes the digest and compares it with the `custom_id` read back from PayPal. The record exports as PDF or JSON. The Disputes screen checks PayPal on demand (when opened or when **Check PayPal again** is pressed). If PayPal reports a dispute, the Proposer drafts a response from the record and the Critic strikes anything unsupported. The app does not submit it: the worker copies the draft into the PayPal Resolution Center. | Worker decides; PayPal decides the outcome |

### Three runtime agents, and why the AI never moves money alone

```
AFTER photo ──► PROPOSER (model) ──► verdict per criterion
                     │
                     ▼
                CRITIC (independent model call) ──► objections only; can never upgrade a FAIL
                     │
                     ▼
                JUDGE (deterministic code) ──► 11 checks ──► permitted? ──► worker confirms ──► PayPal capture ──► read-back
```

The Judge permits a capture only if **all** of these hold: the hold is active and unexpired, both AI responses match their schema, every agreed criterion was assessed and passed, both agents confirm the same scene, the Critic raised no objection, the capture amount equals the agreed amount, the AFTER photo is later than the BEFORE photo, and both photos were taken within 150 m of each other. Disagreement, a timeout, a refusal or a malformed response fails closed. See [`app/src/core/judge.ts`](app/src/core/judge.ts) and its tests.

---

## Try it

### 1. Get sandbox credentials (about 5 minutes)

| You need | Where | Steps |
|---|---|---|
| **PayPal Sandbox Client ID and Secret** | [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox) | Log in → **Apps & Credentials** → make sure **Sandbox** is selected → **Create App** (type: Merchant) → copy the Client ID and Secret. |
| **A PayPal Sandbox buyer account** (the "client") | Same dashboard → **Testing Tools → Sandbox Accounts** | A *Personal* sandbox account is created automatically. Open it → **View/Edit account** to see its email and password. You log in with it when approving the hold. |
| **Anthropic API key** (AI agents) | [console.anthropic.com](https://console.anthropic.com/settings/keys) | Create a key. Usage is billed to that account; each verdict is two vision calls. |

Judges: a ready-to-use credential bundle is provided in the Devpost **private testing instructions**, never in this repository.

### 2. Install

**[⬇ Download the APK — `release/app-release.apk`](release/app-release.apk)** (on GitHub, open the file and choose **Download raw file**).

| Where | Path |
|---|---|
| In this repository (ready to install) | [`release/app-release.apk`](release/app-release.apk) |
| Direct download | `https://github.com/parthibansankars/HoldProof-Paypal/raw/main/release/app-release.apk` |
| After building from source | `app/android/app/build/outputs/apk/release/app-release.apk` (copied to `release/` for distribution) |

Install it on an Android phone (Android 8 or later; allow installs from your browser or file manager). Checksum and version details are in [`release/RELEASE_NOTES.md`](release/RELEASE_NOTES.md).

### 3. Run the demo loop

1. Open HoldProof, read the hackathon notice, enter the three keys. The app verifies each key before saving it.
2. **Start a new job** → tap **Use the demo job** → **Generate photo-checkable criteria**. Note the refused criteria.
3. Agree the criteria and take the **BEFORE** photo of a cluttered corner.
4. Tap **Ask client to approve**. Scan the QR code with a second phone (or tap **Open approval on this phone**) and log in with the sandbox *buyer* account. Back in the app the status turns **HELD** within a few seconds.
5. Clear the corner, tap **Job done**, take the **AFTER** photo from the same spot. Watch the Proposer, Critic and Judge.
6. Tap **Release** and confirm. PayPal returns the capture, and the app shows the status it reads back.
7. Try the failure path: on another job, photograph a *different* place as the AFTER photo. The Critic objects and the Judge refuses with **no PayPal call**.
8. Open **Verify record**, export the **PDF**, and try **Client contests a criterion** to issue a capped partial refund.

You can check every transaction in the sandbox merchant account at [sandbox.paypal.com](https://www.sandbox.paypal.com/).

---

## PayPal Sandbox APIs used (called directly from the app)

| Purpose | Endpoint |
|---|---|
| Access token | `POST /v1/oauth2/token` |
| Create hold order (digest in `custom_id`) | `POST /v2/checkout/orders` (`intent: AUTHORIZE`) |
| Poll for client approval; read back `custom_id` | `GET /v2/checkout/orders/{id}` |
| Place the hold | `POST /v2/checkout/orders/{id}/authorize` |
| Hold status | `GET /v2/payments/authorizations/{id}` |
| Release on a permitted verdict | `POST /v2/payments/authorizations/{id}/capture` |
| Abandoned job | `POST /v2/payments/authorizations/{id}/void` |
| Capture status | `GET /v2/payments/captures/{id}` |
| Capped partial refund | `POST /v2/payments/captures/{id}/refund` |
| Refund status | `GET /v2/payments/refunds/{id}` |
| Dispute check (on demand, from the Disputes screen) | `GET /v1/customer/disputes?disputed_transaction_id=…` |

Every POST carries a `PayPal-Request-Id` idempotency key. Money state shown in the app is always read back from PayPal; an AI statement is never treated as proof of payment.

---

## Architecture

### Hackathon build: direct calls, no backend

```
Android app ──HTTPS──► PayPal Sandbox REST APIs   (money, hold, evidence anchor)
     │
     └──HTTPS──► Anthropic Messages API            (Proposer, Critic; structured JSON output)
```

- **No server.** Without a server there are no webhooks. The app polls the order while it waits for the client's approval (stopping after five consecutive errors until **Check again** is pressed) and reads authorization, capture, refund and dispute status from PayPal's GET endpoints on demand. PayPal's responses are authoritative.
- **On-device data.** Jobs live in on-device SQLite (`expo-sqlite` key-value store); evidence photos live in the app's private storage. The digest lives in PayPal.
- **Credentials.** Entered at runtime and stored only in Android encrypted storage (`expo-secure-store`, Android Keystore). They are never in source, configuration, logs, the APK or Git.

This shortcut is acceptable only because the credentials are **sandbox** credentials entered by the person testing.

### Production architecture: our own backend service

```
Android app ──HTTPS──► HoldProof backend API ──HTTPS──► PayPal REST APIs
                            │      ▲
                            │      └── PayPal webhooks (signature-verified, deduplicated)
                            └──────► AI provider API
```

In production the app never calls PayPal directly and never holds a secret:

- the backend keeps the PayPal Client Secret and the AI key in a secret manager;
- the backend creates, authorizes and captures payments and validates amounts and currencies server-side;
- the backend receives PayPal webhooks, verifies their signatures and deduplicates events;
- the Judge runs on the backend, so a modified client cannot bypass it;
- users authenticate against the backend; sandbox and production are configured separately.

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md), [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Build from source

Requirements: Node 20+, JDK 17–21 (Android Studio's bundled JDK works), Android SDK 36.

```bash
cd app
npm ci
npm test               # 46 unit tests: Judge, money, digest, PayPal client, service money paths (mocked)
npm run typecheck
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease      # APK: app/android/app/build/outputs/apk/release/app-release.apk
```

The built APK is written to `app/android/app/build/outputs/apk/release/app-release.apk`. Copy it to `release/app-release.apk` (and update the checksum in `release/RELEASE_NOTES.md`) to publish it in this repository.

On Windows, the Expo config plugin `app/plugins/withShortCmakeObjectPaths.js` sets `CMAKE_OBJECT_PATH_MAX`, so React Native's C++ build stays under the 260-character path limit without enabling Windows long paths. A short project path (for example `D:\hp`) still helps. The release build is signed with the Expo template's debug keystore so that it installs anywhere; a store release would use a private keystore that is never committed.

---

## Honest limits

- HoldProof proves the record **was not changed after the client approved**. It does not prove the photos are truthful (a scene can be staged, GPS can be spoofed), and it does not judge workmanship.
- It is an **authorization hold with AI evidence checking**, not escrow and not a neutral arbiter. The worker controls the phone; the protection for the client is the visible hold in their own PayPal account, the client-approved anchor, and PayPal's dispute process.
- In the hackathon build, the Judge runs on the device. In production it must run on the backend.
- Sandbox authorizations follow PayPal's rules (honor period and expiry); jobs are meant to finish within days. The Job screen warns when a hold is older than the 3-day honor period.
- Both photos must carry a GPS location; the camera refuses to record a photo without one, because the Judge cannot permit a capture without it.
- The order's `return_url` and `cancel_url` are app deep links (`holdproof://approved`, `holdproof://cancelled`) because this build has no server to host a return page. After approving, the client's browser may show a link that cannot be opened; the approval is already complete, and the worker's phone confirms the hold by polling. A production build would return to an HTTPS page served by the backend.

## Verifying a record by hand

The digest is `SHA-256` of the canonical record (shown in the JSON export as `canonical_record`) and must equal `purchase_units[0].custom_id` of the PayPal order. Each photo hash is SHA-256 over the **base64 text** of the stored JPEG, not over the raw bytes (the JSON export states this in `photo_hash_method`). To reproduce it: base64-encode the JPEG without line breaks, then compute SHA-256 of that text, for example `base64 -w0 photo.jpg | tr -d '\n' | sha256sum`.

## Licence

[MIT](LICENSE). Third-party dependencies use MIT or Apache 2.0 licences.
