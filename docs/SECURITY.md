# Security notes

## Credentials

| Rule | How it is enforced |
|---|---|
| No secret in the APK or repository | Nothing is configured at build time. Keys are typed in on first launch. `.gitignore` blocks `.env*`, keystores and signing properties. |
| Encrypted at rest | `expo-secure-store` (Android Keystore), `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. |
| Sandbox only | `PAYPAL_BASE_URL` is a constant set to `https://api-m.sandbox.paypal.com`; there is no production switch. |
| Informed consent | A blocking, scrollable popup (`SETUP_NOTICE` in `app/src/config.ts`) is shown before any key can be entered. The back button cannot dismiss it, and saving stays disabled until the user presses *I understand — use sandbox keys only*. It can be reopened from the setup screen (*Read the hackathon notice again*), and Settings shows the full text. See "Setup notice contents" below. |
| Verified before saving | PayPal keys are checked with an OAuth token request, the AI key with a model lookup. A failure to write to encrypted storage is reported, never left as a spinning button. |
| Removable | Settings → *Remove keys from this device* deletes them from encrypted storage and drops the cached PayPal client (secret and access token) from memory. Uninstalling also removes them. |
| Not logged | Keys are never written to the activity log, evidence records, exports or error messages. Settings shows them masked. |

## Setup notice contents

The popup states, in this order: what HoldProof is; that it is a hackathon demonstration for the PayPal AI Hackathon 2026 that works only with PayPal Sandbox, never moves real money, and must never receive production (live) credentials; that the build has no server-side code and calls PayPal Sandbox and the AI provider directly from the phone, which is why it asks for keys, and that this is acceptable only because they are sandbox and test keys entered by the tester; the three keys and their use (PayPal Sandbox Client ID and Client Secret for the access token and every order, authorization, capture, refund, void and status call; Gemini API key for the Proposer and Critic calls on `gemini-3.5-flash-lite`); where the keys are stored (Android Keystore on this device only; never in the APK, source code, logs, the activity timeline, evidence records or PDF/JSON exports); where keys and data are sent (see below); that a free Gemini key works, that on the free tier Google may use the content sent to improve its products (not on a paid tier), and that paid usage is billed to the key owner; how to get the keys (PayPal Developer Dashboard sandbox REST app, Google AI Studio; the sandbox buyer account is entered on PayPal's own page, never in the app); how to remove them (Settings or uninstall); the production design; and the honest limits.

## Data that leaves the phone

| Destination | What is sent |
|---|---|
| `api-m.sandbox.paypal.com` | The PayPal Client ID and Secret (token request only), the job title, the amount, the evidence digest (`custom_id`), a job reference id (`reference_id`, also used to build the capture invoice id) and, for a partial refund, the text of the contested criterion in the note to the client (`note_to_payer`). |
| `generativelanguage.googleapis.com` | The Gemini API key, the job description and price, the agreed criteria, the BEFORE and AFTER photos and, when a dispute response is drafted, the dispute summary and the evidence record (including photo times and locations). |
| Anywhere else | Nothing. There is no HoldProof server and no analytics. |

## Payment safety

- AI output never moves money. The Judge must permit, the worker must confirm, and the app reads the result back from PayPal.
- Amounts are integer cents, validated against a strict pattern; the capture amount must equal the agreed amount.
- Refunds are capped per criterion, limited to one per criterion, and cannot exceed the remaining captured amount. A refund that PayPal reports as FAILED or CANCELLED moved no money, so it does not count against either rule and may be retried with a new request id.
- Every POST uses a deterministic `PayPal-Request-Id`, so a retried capture, refund or void cannot run twice. The capture key includes the verdict attempt, so a new verdict after a declined capture is a new request.
- Payment state is never trusted from the client UI or the model; it comes from PayPal GET endpoints. A capture that does not read back as COMPLETED or PENDING leaves the hold in place and voidable.
- A job is never left waiting with a live hold: if the order is already authorized, the app adopts that authorization; cancelling an unapproved job first checks PayPal and refuses if the client has already approved.

## Evidence integrity

- Photos come only from the in-app camera; no gallery import exists. A photo without a GPS location is not recorded.
- The digest is anchored in PayPal before approval; later edits to the criteria, price or BEFORE photo are detectable.
- The photo hash is SHA-256 over the base64 text of the stored JPEG (no line breaks), not over the raw bytes. To reproduce it, base64-encode the JPEG without line breaks and hash that text.
- Limits: staged scenes and spoofed GPS are not detected. The record proves integrity after approval, not truthfulness.

## Known hackathon-only risks (resolved by the production architecture)

- The sandbox Client Secret is on the device. Anyone with the unlocked device could use it against the sandbox.
- The Judge runs on the device; a modified client could bypass it. Production moves it to the backend.
- No webhooks: the order is polled while waiting for approval and other statuses are read on demand. Production verifies webhook signatures and deduplicates events.
- The approval return and cancel URLs are app deep links, because there is no server to host a return page. Production returns to an HTTPS page served by the backend.
- The release APK is signed with the template debug keystore for easy installation; a store build needs a private keystore.
