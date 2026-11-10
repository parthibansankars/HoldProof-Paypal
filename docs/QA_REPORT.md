# QA report

Status legend: **Passed** (run and verified) · **Not run** (not yet executed) · **Blocked** (needs something unavailable).

## Automated

| Area | Result | Evidence |
|---|---|---|
| Unit tests (Jest, 29 tests) | Passed | `cd app && npm test` — Judge capture, refund and void guards; money parsing; digest determinism and tamper sensitivity; PayPal client request shape, idempotency header, token reuse, 204 handling, error mapping |
| TypeScript strict typecheck | Passed | `npm run typecheck` |
| Android JavaScript bundle (Metro, Hermes bytecode) | Passed | `npx expo export --platform android` bundled 1,688 modules |
| Release APK build | See PROJECT_STATUS.md | `./gradlew assembleRelease` |

Judge cases covered by tests include: a PASS verdict with a mismatched amount is refused; missing Proposer or Critic output fails closed; a Critic objection overrides a Proposer PASS; an unassessed or failed criterion is refused even if `overall` says PASS; an expired hold, out-of-order photos, photos more than 150 m apart, or missing GPS are refused; a malformed amount is a failed check, not a crash.

## Manual, on a device with live sandbox keys

| Scenario | Result |
|---|---|
| First launch shows the hackathon popup before keys can be entered | Not run |
| Invalid PayPal or AI keys are rejected with a clear message | Not run |
| Scope → BEFORE → order → approval by sandbox buyer → HELD | Not run |
| Passing AFTER photo → Judge permits → capture → read-back COMPLETED | Not run |
| Different-scene AFTER photo → Critic objects → no PayPal call | Not run |
| Void an active hold | Not run |
| Capped partial refund; over-cap refund refused | Not run |
| Verify record matches `custom_id`; PDF and JSON export | Not run |
| Dispute polling (no disputes; sandbox dispute if created) | Not run |
| Network loss during polling shows an error and recovers | Not run |
| App restart keeps jobs and resumes polling on the Hold screen | Not run |

**Blocked on this build machine:** the Android emulator cannot start because CPU virtualization is disabled in firmware, and no device was connected. Manual scenarios need a physical Android phone and live sandbox credentials. This report will be updated with results; nothing above is claimed as passed until it has been run.
