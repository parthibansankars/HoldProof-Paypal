# HoldProof release notes

> Hackathon demonstration only — PayPal Sandbox credentials only. The app asks for keys on first launch; none are included in the APK.

## 1.0.0 (versionCode 1) — 10 November 2026

| Item | Value |
|---|---|
| File | `app-release.apk` |
| Size | 65,722,623 bytes |
| SHA-256 | `5f8d5425e8b673a21cff91a5ff1d9ff45a7cb11a43acc647d3a5003463ea971f` |
| Package | `app.holdproof.sandbox` |
| Target SDK | 36 (minimum SDK set by Expo SDK 58) |
| Native ABIs | `arm64-v8a` (phones), `x86_64` (emulators) |
| Signing | Expo template debug keystore, so the APK installs on any device; not for store distribution |
| Permissions | Camera, fine and coarse location, internet, network state (plus biometric and vibrate from library defaults) |

Verify the download:

```bash
sha256sum app-release.apk            # Linux / Git Bash
certutil -hashfile app-release.apk SHA256   # Windows
```

### Contents

- Full HoldProof loop: scope → BEFORE photo and evidence digest → PayPal Sandbox authorization hold → AFTER photo checked by the Proposer and Critic → deterministic Judge → capture, capped partial refund or void → verify record, PDF/JSON export, dispute check and AI-drafted response.
- AI agents run on the **Google Gemini API** (`gemini-3.5-flash-lite`); a free Gemini key from Google AI Studio works. The Anthropic SDK has been removed.
- PayPal return and cancel addresses are HTTPS links to the public project page instead of the `holdproof://` deep link, which made Sandbox checkout end in a generic error. The hold screen and setup notice warn that the client must approve with a sandbox Personal account, not the business account that owns the keys. The order title uses a plain hyphen.
- Complete, scrollable hackathon notice before any key can be entered (re-readable from the setup screen and Settings).
- All fixes from the four-agent gap review (`docs/review/gap-review.md`): recovery of an authorization that was placed but not saved, terminal handling of denied, voided, expired and missing orders, location required for evidence photos, declined-capture recovery, 16,384-token AI responses, refund status refresh, keys cleared from memory on removal.

### Checks on this build

| Check | Result |
|---|---|
| TypeScript typecheck | Passed |
| Unit tests | 55 passed |
| APK scanned for API keys and PayPal tokens | None found |
| JavaScript bundle contains the reviewed setup notice and the Gemini endpoint (no Anthropic host) | Confirmed |
| Run on a physical device with live sandbox keys | **Not run yet** — see `docs/QA_REPORT.md` |

### Build

Built from `app/` with `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64` and copied from `app/android/app/build/outputs/apk/release/app-release.apk`.
