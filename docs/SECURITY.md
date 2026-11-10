# Security notes

## Credentials

| Rule | How it is enforced |
|---|---|
| No secret in the APK or repository | Nothing is configured at build time. Keys are typed in on first launch. `.gitignore` blocks `.env*`, keystores and signing properties. |
| Encrypted at rest | `expo-secure-store` (Android Keystore), `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. |
| Sandbox only | `PAYPAL_BASE_URL` is a constant set to `https://api-m.sandbox.paypal.com`; there is no production switch. |
| Informed consent | A blocking popup states the hackathon-only, sandbox-only nature before any key can be entered; Settings repeats it. |
| Verified before saving | PayPal keys are checked with an OAuth token request, the AI key with a model lookup. |
| Removable | Settings → *Remove keys from this device*. Uninstalling also removes them. |
| Not logged | Keys are never written to the activity log, exports or error messages. Settings shows them masked. |

## Payment safety

- AI output never moves money. The Judge must permit, the worker must confirm, and the app reads the result back from PayPal.
- Amounts are integer cents, validated against a strict pattern; the capture amount must equal the agreed amount.
- Refunds are capped per criterion, limited to one per criterion, and cannot exceed the remaining captured amount.
- Every POST uses a deterministic `PayPal-Request-Id`, so a retried capture, refund or void cannot run twice.
- Payment state is never trusted from the client UI or the model; it comes from PayPal GET endpoints.

## Evidence integrity

- Photos come only from the in-app camera; no gallery import exists.
- The digest is anchored in PayPal before approval; later edits to the criteria, price or BEFORE photo are detectable.
- Limits: staged scenes and spoofed GPS are not detected. The record proves integrity after approval, not truthfulness.

## Known hackathon-only risks (resolved by the production architecture)

- The sandbox Client Secret is on the device. Anyone with the unlocked device could use it against the sandbox.
- The Judge runs on the device; a modified client could bypass it. Production moves it to the backend.
- No webhooks: status is polled. Production verifies webhook signatures and deduplicates events.
- The release APK is signed with the template debug keystore for easy installation; a store build needs a private keystore.
