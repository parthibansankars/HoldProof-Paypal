# Functional gap review (four agents)

Run on 10 November 2026 against the code in `app/`. Four roles: **Agent 1 Reviewer** finds gaps, **Agent 2 Devil's Advocate** argues against each one, **Agent 3 Fixer** fixes what survives, **Agent 4 Verifier** checks every fix independently. One repair round followed the first verification.

Outcome: 12 findings raised, 4 more added by the Devil's Advocate, all 16 accepted (most with narrowed fixes), all fixed and verified. Typecheck passes; npx jest in D:\hp\app: Test Suites: 4 passed, 4 total; Tests: 46 passed, 46 total; exit code 0.

Verification was by code reading and automated tests. No device run was performed; see `docs/QA_REPORT.md`.

## Summary

| ID | Gap | Reviewer severity | Devil's Advocate | Final severity | Fix | Verified |
|---|---|---|---|---|---|---|
| G1 | Setup popup omits most of the mandatory context and is not scrollable; the acknowledgement button can be unreachable | critical | accept-with-changes | critical | fixed | verified |
| G2 | Job sticks in AWAITING_APPROVAL with a live hold when authorize succeeds but the result is not saved, or the authorization is not CREATED/PENDING | high | accept-with-changes | medium | fixed | verified |
| G3 | Missing GPS on the BEFORE photo makes the job permanently uncapturable, and this is discovered only after the client's money is held | high | accept-with-changes | high | fixed | verified |
| G4 | A non-successful capture leaves the job stuck: HELD with captureId set, attempt marked executed, void blocked, and authorization status written without read-back | medium | accept-with-changes | medium | fixed | verified |
| G5 | Approval return and cancel URLs are app deep links that fail on the client's own phone, and the cancel path is not handled | medium | accept-with-changes | low | fixed | verified |
| G6 | Polling for approval has no terminal handling for expired, voided or missing orders and no backoff | medium | accept-with-changes | low | fixed | verified |
| G7 | max_tokens of 8000 is shared with always-on thinking on claude-opus-5-5, so structured verdicts can be cut off | medium | accept-with-changes | medium | fixed | verified |
| G8 | Save flow on the setup screen has no error handling around saveCredentials; the button can spin forever | medium | accept | medium | fixed | verified |
| G9 | Refund records are stored as final regardless of PayPal status and are never refreshed | medium | accept-with-changes | low | fixed | verified |
| G10 | Disputes screen and photo-hash label describe behaviour the code does not perform | low | accept-with-changes | medium | fixed | verified |
| G11 | PayPal client with client ID, secret and bearer token stays cached in memory after 'Remove keys' | low | accept | low | fixed | verified |
| G12 | Missing end states and housekeeping in the job list | low | accept-with-changes | low | fixed | verified |
| M1 | Popup does not disclose which user data leaves the phone (photos and job description go to the AI provider) | (added by Agent 2) | added | high | fixed | verified |
| M2 | README and docs must be brought in line with every changed claim | (added by Agent 2) | added | medium | fixed | verified |
| M3 | No verification step defined for the fixes | (added by Agent 2) | added | medium | fixed | verified |
| M4 | Cancel button on the Hold screen has no error handling | (added by Agent 2) | added | low | fixed | verified |

## Discussion per gap

### G1. Setup popup omits most of the mandatory context and is not scrollable; the acknowledgement button can be unreachable

- **File:** `app/src/screens/CredentialsScreen.tsx` line 68 · **Category:** judge-rejection-risk

**Agent 1, Reviewer (critical).** The Modal (lines 68-80) renders HACKATHON_NOTICE plus the three NO_SERVER_NOTICE bullets (D:\hp\app\src\config.ts lines 17-28) inside a plain View with justifyContent:'center' and a Card; there is no ScrollView. onRequestClose is a no-op (correct), and `acknowledged` is local state that resets only on remount. Points PRESENT in the popup: hackathon demo for PayPal AI Hackathon 2026; Sandbox only, never real money, no production credentials; no server-side code and direct calls from the phone as the reason for keys; production backend holds secrets, calls PayPal, 'receives' webhooks. Points MISSING from the popup: (1) one sentence saying what HoldProof is (the notice only says it 'is a hackathon demonstration'); (2) the three keys by name and the purpose of each (PayPal Sandbox Client ID, Client Secret, Anthropic API key); (3) 'Android Keystore' is not named in the popup (only in the footer text at lines 104-107 behind the modal); (4) the statement that keys are never in the app package, source code, logs or exports (footer mentions package, logs, source; 'exports' appears nowhere); (5) the exact hosts api-m.sandbox.paypal.com and api.anthropic.com (popup says only 'PayPal Sandbox and the AI provider'); (6) AI usage is billed to the owner of the AI key; (7) how to obtain the keys (PayPal Developer dashboard sandbox app, Anthropic console) and that the sandbox BUYER account is entered on PayPal's page, never in the app; (8) how to remove the keys (Settings or uninstall; 'uninstall' appears nowhere); (9) production: webhooks are signature-VERIFIED and the Judge runs server-side; (10) honest limits: authorization hold with AI evidence checking, not escrow; photos can be staged; (11) scrollability; (12) a way to re-read the notice from the setup screen after acknowledging (Settings re-renders the same short text at SettingsScreen.tsx lines 37-43, but the setup screen has no 'Read the notice again' control).

*Failure scenario:* On a small or large-font phone the Card overflows the non-scrolling container, the 'I understand' button falls below the visible area, the back button is disabled, and the user cannot proceed past first launch. Independently, a judge reading the popup sees an app asking for a PayPal secret and an AI key without being told which keys, where exactly they go, who pays for AI usage, how to delete them, or the honest limits, and may reject the app as insecure or misleading.

*Proposed fix:* Move the full notice into structured constants in D:\hp\app\src\config.ts (sections: What HoldProof is; Hackathon and Sandbox only; Why it asks for keys / no server; The three keys and their use; Storage: Android Keystore on this device only, never in APK, source, logs or exports; Destinations: api-m.sandbox.paypal.com and api.anthropic.com only; AI billing to key owner; How to get keys, buyer account entered on PayPal's page; How to remove: Settings or uninstall; Production architecture including verified webhooks and server-side Judge; Honest limits). Render it in a shared NoticeContent component inside a ScrollView with maxHeight ~80% of the window and the acknowledgement button pinned below the scroll area. Keep onRequestClose as a no-op. Add a 'Read the hackathon notice again' ghost button on the setup screen that sets acknowledged=false, and render the same NoticeContent in Settings.

**Agent 2, Devil's Advocate (accept-with-changes, critical).** Confirmed in D:\hp\app\src\screens\CredentialsScreen.tsx lines 68-80 and D:\hp\app\src\config.ts lines 17-28. The Modal holds a plain View and Card with no ScrollView, onRequestClose is a no-op, and the text covers only: hackathon demo, Sandbox only, no server, partial production architecture. Every missing point the Reviewer lists is truly missing. I verified the claims the new text must make are true in code: keys exist only in expo-secure-store (src/storage/credentials.ts); buildRecord and exportPdf (src/services/holdproof.ts, src/services/exportRecord.ts) contain no keys; job logs carry only describePayPalError output; the only key destinations are PAYPAL_BASE_URL and the Anthropic SDK default host. Two refinements. (a) The Reviewer missed a disclosure a judge will look for: the job description and both photos are sent to the AI provider, and the amount, title and digest are sent to PayPal. The popup must say what data leaves the phone, not only where keys go. (b) Do not use Dimensions maths; a Card with maxHeight '90%' containing a ScrollView with flexGrow 0 / flexShrink 1 and the button outside the ScrollView is sufficient and robust under large fonts.

*Required fix:* 1. In D:\hp\app\src\config.ts replace HACKATHON_NOTICE / NO_SERVER_NOTICE with one exported structured constant, for example `SETUP_NOTICE: { title: string; lead: string; sections: { heading: string; lines: string[] }[] }`, plus exported host constants `PAYPAL_HOST = 'api-m.sandbox.paypal.com'` and `AI_HOST = 'api.anthropic.com'` (derive PAYPAL_HOST from PAYPAL_BASE_URL). Keep a short HACKATHON_NOTICE export only if other files still import it. Sections, in this order, in plain formal English, no statistics:
- What HoldProof is: one sentence (a PayPal authorization hold the client approves before work starts, captured only after AI checks before-and-after photos against the agreed criteria and a deterministic Judge permits it).
- Hackathon demonstration only: built for the PayPal AI Hackathon 2026; PayPal Sandbox only; never moves real money; never enter production (live) PayPal credentials; the PayPal host is hard-coded to the sandbox.
- Why the app asks for keys: this build has no server-side code; it calls PayPal Sandbox and the AI provider directly from this phone; acceptable only because the keys are sandbox/test keys entered by the person testing.
- The three keys and their use: PayPal Sandbox Client ID and Client Secret (obtain an access token; create the order, authorize, capture, refund, void, read status and disputes); Anthropic API key (Proposer and Critic calls on model claude-opus-5-5).
- Where the keys are stored: only in this device's encrypted storage (Android Keystore via secure storage); never in the app package (APK), source code, logs, evidence records or PDF/JSON exports.
- Where keys and data are sent: keys go only to api-m.sandbox.paypal.com and api.anthropic.com. The job description and the BEFORE/AFTER photos are sent to the AI provider for checking; the job title, amount and evidence digest are sent to PayPal Sandbox. Nothing is sent anywhere else; there is no HoldProof server and no analytics.
- AI cost: AI usage is billed to the owner of the Anthropic API key.
- How to get the keys: PayPal Developer Dashboard > Apps & Credentials > Sandbox > create or open a REST app; Anthropic Console > API keys. The sandbox BUYER (personal) account is used by the client on PayPal's own approval page and is never entered into this app.
- How to remove the keys: Settings > Remove keys from this device, or uninstall the app; both delete them from the device.
- Production design: keys would never be on the phone; HoldProof's own backend would hold the secrets, call PayPal, verify PayPal webhook signatures, and run the Judge server-side.
- Honest limits: an authorization hold with AI evidence checking, not escrow and not a neutral arbiter; photos can be staged and GPS can be spoofed; the record proves it was not changed after approval, not that the photos are truthful; PayPal decides disputes.
2. Add a shared `NoticeContent` component (in src/ui/components.tsx or a new src/ui/NoticeContent.tsx) that renders SETUP_NOTICE; headings with accessibilityRole 'header'.
3. CredentialsScreen modal: `<Card style={{ maxHeight: '90%' }}>` containing the title, then `<ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator persistentScrollbar>` with NoticeContent, then, OUTSIDE the ScrollView, a one-line hint ('Scroll to read the full notice') and the button 'I understand — use sandbox keys only'. Keep `onRequestClose={() => undefined}` and keep Save disabled until acknowledged. Do not gate the button on scroll-to-end.
4. Setup screen: add a ghost button 'Read the hackathon notice again' (sets acknowledged false) and replace the footer text so it names Android Keystore, 'app package, source code, logs or exports', and 'remove in Settings or by uninstalling'.
5. SettingsScreen: render the same NoticeContent (full text) in the existing violet card, and show both hosts in the Environment card (PayPal host, AI host).
6. Update D:\hp\README.md (notice section) and D:\hp\docs\SECURITY.md so the wording and the description of the popup match the new text. Do not touch D:\hp\app\android.

**Agent 3, Fixer (fixed).** Replaced HACKATHON_NOTICE/NO_SERVER_NOTICE with a structured SETUP_NOTICE (title, lead, 11 sections in the required order: what HoldProof is, hackathon/Sandbox only, why keys/no server, the three keys and their use, storage in Android Keystore and never in APK/source/logs/records/exports, destinations and data flows, AI cost, how to get keys incl. buyer account on PayPal's page, how to remove, production design with verified webhooks and server-side Judge, honest limits). Added PAYPAL_HOST (derived from PAYPAL_BASE_URL) and AI_HOST. HACKATHON_NOTICE kept as an alias of the lead. Added a shared NoticeContent component (headings use accessibilityRole 'header'). The CredentialsScreen modal now uses Card maxHeight 90%, a ScrollView (flexGrow 0, flexShrink 1, persistent scrollbar), and a scroll hint plus the acknowledgement button outside the ScrollView; onRequestClose stays a no-op and Save stays disabled until acknowledged. Added a 'Read the hackathon notice again' ghost button and a new footer naming Android Keystore, 'app package, source code, logs or exports' and removal in Settings or by uninstalling. Settings renders the full NoticeContent in the violet card and shows the PayPal host and the AI host.

*Files:* `app/src/config.ts`, `app/src/ui/components.tsx`, `app/src/screens/CredentialsScreen.tsx`, `app/src/screens/SettingsScreen.tsx`, `README.md`, `docs/SECURITY.md`

**Agent 4, Verifier (verified).** D:\hp\app\src\config.ts exports SETUP_NOTICE (title, lead, 11 sections in the required order), PAYPAL_HOST derived from PAYPAL_BASE_URL, and AI_HOST. D:\hp\app\src\ui\components.tsx line 191 has NoticeContent with accessibilityRole 'header' on headings. CredentialsScreen.tsx lines 75-86: Modal with onRequestClose no-op, Card maxHeight 90%, ScrollView (flexGrow 0, flexShrink 1, persistentScrollbar), scroll hint and acknowledgement button outside the ScrollView, not gated on scroll-to-end. Save is disabled by `!canSave || !acknowledged`. Line 94 has the 'Read the hackathon notice again' ghost button; the footer names Android Keystore, 'app package, source code, logs or exports' and removal in Settings or by uninstalling. SettingsScreen.tsx renders the full NoticeContent in the violet card and shows PayPal host and AI host. README.md and docs/SECURITY.md describe the same sections.

*Remaining note:* Layout was verified by code reading only; no device or emulator run was performed (docs/QA_REPORT.md marks it Not run).

### G2. Job sticks in AWAITING_APPROVAL with a live hold when authorize succeeds but the result is not saved, or the authorization is not CREATED/PENDING

- **File:** `app/src/services/holdproof.ts` line 125 · **Category:** paypal-integration

**Agent 1, Reviewer (high).** syncHold returns early unless `order.status === 'APPROVED'` (line 125). After POST /authorize the order status becomes COMPLETED. If authorizeOrder (line 127) succeeds but getAuthorization (line 130) or the updateJob write fails (network drop, app killed), nothing is persisted. On the next poll the order is COMPLETED, so syncHold never adopts the authorization. Line 138 also leaves status unchanged when the read-back status is DENIED or anything else, while storing authorizationId. cancelUnapproved (lines 147-151) only flips local status to CANCELLED without checking PayPal.

*Failure scenario:* The client approves; the worker's phone loses connectivity between authorize and the read-back. The buyer now has a real sandbox authorization, but the app shows 'Awaiting client' forever with the spinner. The only action offered is 'Cancel job', which marks the job CANCELLED locally and leaves the authorization orphaned on the buyer's account with no void path.

*Proposed fix:* In syncHold handle `order.status === 'COMPLETED'`: read `order.purchase_units[0].payments.authorizations[0]` (or re-issue authorizeOrder with the same PayPal-Request-Id), call getAuthorization, and persist it. Map DENIED/VOIDED/EXPIRED authorization and VOIDED order to a terminal local status with a clear message. In cancelUnapproved call getOrder first; if an authorization exists, void it (or refuse to cancel and adopt the hold).

**Agent 2, Devil's Advocate (accept-with-changes, medium).** The code path is real: syncHold (src/services/holdproof.ts line 125) returns unless order.status is APPROVED, and after a successful POST /authorize the order is COMPLETED, so a failure in getAuthorization (line 130) or the write leaves a job that can never adopt its hold. cancelUnapproved (lines 147-151) flips to CANCELLED without asking PayPal. However, the trigger is a failure in a window of one or two requests, so 'high' overstates likelihood; I lower it to medium. The fix is cheap and the consequence (an orphaned authorization with no void path) is exactly what a payment judge probes, so it stays accepted. I reject adding a new terminal status for DENIED: no new JobStatus value is needed; a DENIED authorization can map to CANCELLED with a log line. Re-issuing authorizeOrder with the same request id is unnecessary; GET order already returns purchase_units[0].payments.authorizations.

*Required fix:* In D:\hp\app\src\services\holdproof.ts:
1. syncHold: after reading the order, if `order.status === 'COMPLETED'`, take `order.purchase_units?.[0]?.payments?.authorizations?.[0]`; if present, call getAuthorization and persist exactly as the APPROVED branch does (extract the persist step into one helper `adoptAuthorization(id, orderStatus, auth)` used by both branches). If status is VOIDED, set the job to CANCELLED with a 'paypal' log entry.
2. In the persist helper: when the read-back status is CREATED or PENDING set HELD; when it is DENIED, VOIDED or EXPIRED set CANCELLED and log 'Authorization <id> is <status>; no money is held.'; never leave AWAITING_APPROVAL with an authorizationId stored.
3. cancelUnapproved: before cancelling, if the job has an orderId call `syncHold(id)`. If the job is now HELD, do not cancel; throw an Error such as 'The client has already approved. The hold is active; open the job to void it.' If syncHold throws a PayPalError with status 404, cancel locally. If it throws for any other reason, rethrow (do not cancel blind). If the order is still CREATED / PAYER_ACTION_REQUIRED, cancel locally as today.
4. D:\hp\app\src\screens\HoldScreen.tsx: wrap the 'Cancel job' handler in try/catch, show the message in the ErrorBanner, and call popToTop only when the returned job status is CANCELLED.
5. Add unit tests with a mocked client for the COMPLETED adoption path if the existing test setup permits mocking storage; otherwise state this in the fixer notes.

**Agent 3, Fixer (fixed).** Extracted adoptAuthorization(): CREATED/PENDING sets HELD; DENIED/VOIDED/EXPIRED sets CANCELLED with the log entry 'Authorization <id> is <status>; no money is held.'; CAPTURED/PARTIALLY_CAPTURED is treated as HELD so refreshFromPayPal can adopt the capture (the job never stays AWAITING_APPROVAL with an authorization stored). syncHold adopts the existing authorization when the order is COMPLETED and cancels on order VOIDED. cancelUnapproved runs syncHold first: it throws 'The client has already approved...' if HELD, cancels locally on a 404, and rethrows any other error. HoldScreen's Cancel handler uses try/catch, the ErrorBanner, a busy state, and popToTop only when the result is CANCELLED. Storage mocking was possible, so mocked-service tests were added.

*Files:* `app/src/services/holdproof.ts`, `app/src/screens/HoldScreen.tsx`, `app/__tests__/holdproof-service.test.ts`

**Agent 4, Verifier (verified).** holdproof.ts: adoptAuthorization (lines 145-168) sets HELD for CREATED/PENDING and CANCELLED with the log 'Authorization <id> is <status>; no money is held.' for DENIED/VOIDED/EXPIRED. syncHold adopts the existing authorization on COMPLETED (lines 194-200) and cancels on VOIDED (190-192). cancelUnapproved (215-229) runs syncHold first, throws when HELD, cancels on 404, rethrows other errors. HoldScreen.onCancel has try/catch/finally, ErrorBanner, busy state, popToTop only on CANCELLED. Tests in holdproof-service.test.ts cover COMPLETED adoption, DENIED, 404, VOIDED and the three cancel cases; all pass.

### G3. Missing GPS on the BEFORE photo makes the job permanently uncapturable, and this is discovered only after the client's money is held

- **File:** `app/src/screens/CameraScreen.tsx` line 16 · **Category:** functional-bug

**Agent 1, Reviewer (high).** currentLocation() returns lat/lng null when permission is denied or the fix fails (lines 16-25), and capture() stores the evidence without any warning (lines 62-72). The Judge's 'location' check requires both photos to carry coordinates: `hasGeo && dist <= MAX_SCENE_DISTANCE_METERS` (D:\hp\app\src\core\judge.ts lines 82-85). attachBeforePhoto locks the BEFORE photo once the order exists (holdproof.ts line 82). getCurrentPositionAsync is also called with Accuracy.High and no timeout inside Promise.all, so 'Capturing…' can hang indoors.

*Failure scenario:* A judge runs the app on an emulator or denies the location prompt. BEFORE photo, order, approval and hold all succeed. Every AFTER verdict is then refused with 'Location missing on one or both photos'; the capture can never be permitted and the only exit is to void. The core demo flow cannot be completed and the reason appears only at step 5.

*Proposed fix:* In CameraScreen, when mode is 'before' and location is null, do not attach the photo: show an error explaining that location is required for the same-place check, with a retry and a link to app settings when permission cannot be asked again. Apply the same pre-check for the AFTER photo before spending AI calls. Add a timeout (for example 15 s, falling back to getLastKnownPositionAsync) so the capture cannot hang.

**Agent 2, Devil's Advocate (accept-with-changes, high).** Confirmed. currentLocation (src/screens/CameraScreen.tsx lines 16-25) returns nulls silently, attachBeforePhoto locks the photo once the order exists, and the Judge's location check (src/core/judge.ts) requires coordinates on both photos, so a job anchored without GPS can only ever be voided. An emulator or a denied prompt is a likely judge scenario and the failure appears only after the hold. The alternative of relaxing the Judge is wrong: it must keep failing closed. Refinements: check location BEFORE storing the photo and before any AI call (the AFTER path otherwise bills two model calls for a verdict that is certain to be refused); add a defence in createHold for jobs already anchored without GPS; keep the SDK 58 camera calls exactly as written.

*Required fix:* In D:\hp\app\src\screens\CameraScreen.tsx:
1. Rewrite currentLocation to return a discriminated result: `{ ok: true, lat, lng, accuracy } | { ok: false, reason: 'denied' | 'blocked' | 'unavailable' }`. Use `requestForegroundPermissionsAsync()`; when status is not granted, return 'blocked' if `canAskAgain === false`, else 'denied'. For the fix, race `getCurrentPositionAsync({ accuracy: Location.Accuracy.High })` against a 15 000 ms timeout; on timeout or error fall back to `Location.getLastKnownPositionAsync({ maxAge: 120000 })`; if that is null return 'unavailable'.
2. In capture(): keep `takePictureAsync({ pictureRef: true, quality: 0.8 })` and `savePictureAsync` unchanged. After Promise.all, if location is not ok, stop before storeEvidencePhoto / attachBeforePhoto / runVerdict, clear busy, and show an error: 'Location is required. HoldProof compares where the BEFORE and AFTER photos were taken, and the payment cannot be released without it. Turn on location and allow access, then capture again.' When reason is 'blocked', also render a button 'Open app settings' that calls `Linking.openSettings()`. Apply to both modes.
3. In D:\hp\app\src\services\holdproof.ts createHold: throw 'The BEFORE photo has no location. Retake it with location enabled before asking the client to approve.' when `job.before` is missing or lat/lng is null. In HoldScreen, when status is READY and the BEFORE photo has no location, show a 'Retake BEFORE photo' button that navigates to Camera in 'before' mode (attachBeforePhoto already permits this while no order exists).
4. Add the location requirement as one line in the BEFORE-photo instruction card.

**Agent 3, Fixer (fixed).** currentLocation returns a discriminated result (denied/blocked via canAskAgain/unavailable). It races a High-accuracy fix against a 15 s timeout and falls back to getLastKnownPositionAsync({maxAge:120000}). capture() stops before storing or attaching the photo or running the verdict when location is missing (both modes), shows the required message, and offers 'Open app settings' (Linking.openSettings) when the reason is blocked. takePictureAsync({pictureRef:true}) and savePictureAsync are unchanged. createHold throws when the BEFORE photo has no lat/lng. HoldScreen shows a warning card and a 'Retake BEFORE photo' footer button in READY without a location. The instruction card adds a location line that uses MAX_SCENE_DISTANCE_METERS.

*Files:* `app/src/screens/CameraScreen.tsx`, `app/src/services/holdproof.ts`, `app/src/screens/HoldScreen.tsx`

**Agent 4, Verifier (verified).** CameraScreen.tsx: currentLocation returns a discriminated result, uses canAskAgain for 'blocked', races High accuracy against 15 000 ms, falls back to getLastKnownPositionAsync({maxAge:120000}). capture() stops before savePictureAsync/storeEvidencePhoto/attachBeforePhoto/runVerdict when location is missing, in both modes, shows the required message and an 'Open app settings' button when blocked. takePictureAsync({pictureRef:true, quality:0.8}) and savePictureAsync are unchanged. createHold throws when the BEFORE photo has no lat/lng (test passes). HoldScreen shows a warning card and 'Retake BEFORE photo' in READY without location. The instruction card has the location line.

### G4. A non-successful capture leaves the job stuck: HELD with captureId set, attempt marked executed, void blocked, and authorization status written without read-back

- **File:** `app/src/services/holdproof.ts` line 237 · **Category:** paypal-integration

**Agent 1, Reviewer (medium).** executeCapture sets `captureId`, marks the attempt `executed: true` and hard-codes `authorization: 'CAPTURED'` (lines 235-239) regardless of the capture status; status changes to CAPTURED only for COMPLETED or PENDING (line 237). decideVoid refuses when captureId is set (judge.ts line 134). The capture idempotency key is `hp-capture-${job.id}` (line 229), identical for every attempt.

*Failure scenario:* PayPal returns a capture with status DECLINED or FAILED. The job stays HELD but shows the attempt as 'Passed · money released'; Release is disabled (executed), Void throws 'This hold cannot be voided', and a new AFTER photo replays the same request id and receives the same failed capture. The authorization line shows CAPTURED although PayPal never said so, which contradicts the 'nothing is inferred' claim.

*Proposed fix:* Only set captureId, capturedAt and executed when the read-back status is COMPLETED or PENDING; otherwise log the failure and leave the job HELD and voidable. Replace the hard-coded 'CAPTURED' with a getAuthorization read-back. Include the attempt id in the capture PayPal-Request-Id so a later attempt is a new request. In refreshFromPayPal, promote the job to CAPTURED when the authorization reads CAPTURED and a capture can be found.

**Agent 2, Devil's Advocate (accept-with-changes, medium).** Confirmed in executeCapture (src/services/holdproof.ts lines 229-239): captureId, capturedAt and executed are set whatever the capture status is, and `authorization: 'CAPTURED'` is hard-coded, which contradicts the header comment in src/paypal/client.ts ('nothing is inferred') and the README claim. In practice PayPal usually rejects a failed capture with HTTP 422 rather than a 201 with DECLINED, so the stuck-state scenario is uncommon; the inferred status is the part a judge can see. The request-id change is safe: with `final_capture: true`, a second capture on a new id is rejected by PayPal (AUTHORIZATION_ALREADY_CAPTURED) rather than double-charging, and a retry of the same attempt stays idempotent. I narrow the refresh change to a best-effort adoption through GET order.

*Required fix:* In D:\hp\app\src\services\holdproof.ts executeCapture:
1. Use request id `hp-capture-${job.id}-${attemptId}`.
2. After getCapture, also call `getAuthorization(job.authorizationId!)` and store its real status in paypalStatus.authorization; remove the hard-coded 'CAPTURED'.
3. If the capture read-back status is COMPLETED or PENDING: set captureId, capturedAt, status CAPTURED and mark the attempt executed (as today). Otherwise: do NOT set captureId, capturedAt or executed; store paypalStatus.capture; add an 'error' log entry 'Capture <id> returned <status>; no money moved. The hold is unchanged.'; leave the job HELD so it can be retried or voided.
4. Add `captures?: Array<{ id: string; status: string }>` to the payments type of PayPalOrder in src/paypal/client.ts. In refreshFromPayPal, when the job is HELD, has no captureId, and the authorization reads CAPTURED, call getOrder, take `payments.captures[0]`, read it back with getCapture, and if COMPLETED or PENDING set captureId, capturedAt and status CAPTURED with a 'paypal' log entry.
5. In executeCapture, catch a PayPalError whose issue is AUTHORIZATION_ALREADY_CAPTURED and run the same adoption instead of surfacing a dead end.

**Agent 3, Fixer (fixed).** The capture request id is now hp-capture-<jobId>-<attemptId>. The authorization status is read back with getAuthorization; the hard-coded 'CAPTURED' is removed. A non-COMPLETED/PENDING capture stores only paypalStatus, logs an 'error' entry ('Capture <id> returned <status>; no money moved. The hold is unchanged.') and leaves the job HELD with no captureId and the attempt not executed. Added captures[] to the PayPalOrder payments type. New adoptExistingCapture() is used for the AUTHORIZATION_ALREADY_CAPTURED error and by refreshFromPayPal when a HELD job's authorization reads CAPTURED/PARTIALLY_CAPTURED.

*Files:* `app/src/services/holdproof.ts`, `app/src/paypal/client.ts`, `app/__tests__/holdproof-service.test.ts`

**Agent 4, Verifier (verified).** executeCapture uses `hp-capture-${job.id}-${attemptId}`, reads the authorization back with getAuthorization, and on a non-COMPLETED/PENDING capture stores only paypalStatus, writes an 'error' log entry and leaves the job HELD with no captureId and the attempt unexecuted. client.ts line 32 adds captures[] to the payments type. adoptExistingCapture handles AUTHORIZATION_ALREADY_CAPTURED and the refreshFromPayPal HELD+CAPTURED case. Three executeCapture tests and one refresh test pass.

*Remaining note:* As accepted in the fix: pressing Release again on the same attempt after a declined capture replays the same request id; a new AFTER photo (new attempt) is required for a new request.

### G5. Approval return and cancel URLs are app deep links that fail on the client's own phone, and the cancel path is not handled

- **File:** `app/src/config.ts` line 12 · **Category:** paypal-integration

**Agent 1, Reviewer (medium).** APPROVAL_RETURN_URL = 'holdproof://approved' and APPROVAL_CANCEL_URL = 'holdproof://cancelled' (lines 12-13) are sent as experience_context.return_url/cancel_url (D:\hp\app\src\paypal\client.ts lines 162-163). The primary flow is the client scanning a QR code on a different phone (HoldScreen.tsx line 99). App.tsx has no `linking` configuration, so neither URL triggers any in-app handling.

*Failure scenario:* The client scans the QR code, logs in as the sandbox buyer and presses Continue. PayPal redirects to holdproof://approved, which the client's browser cannot open; the client sees a browser error or a blank page and may believe the approval failed. If the client cancels, the worker's screen keeps polling with no indication. If PayPal Sandbox rejects a non-HTTPS return_url, order creation fails outright (verify on a device).

*Proposed fix:* Confirm on a device that order creation accepts the custom scheme. Add a visible instruction under the QR code ('After pressing Continue the client can close the PayPal page; this phone confirms the hold'), and handle the deep links on the worker's phone via Linking: on 'approved' trigger an immediate syncHold, on 'cancelled' show a 'client cancelled approval' banner. Document the limitation in the README.

**Agent 2, Devil's Advocate (accept-with-changes, low).** Partly overstated. The scheme 'holdproof' is registered in D:\hp\app\app.json, so on the worker's phone ('Open approval on this phone', WebBrowser custom tab) the redirect returns to the app, and the 3-second poll already detects the approval; a Linking handler adds nothing material there. On the client's own phone the approval is already recorded at PayPal before the redirect, so the failure is cosmetic: an unopenable link after Continue. Without a backend there is no honest HTTPS page to return to, and pointing return_url at an unrelated site would be worse. Whether Sandbox accepts a custom scheme cannot be verified by the Fixer without a device, and the code must not be changed on speculation. I reject the Linking handler and the 'cancelled' banner as unnecessary scope two days before the deadline; I accept the user-facing instruction and the documentation.

*Required fix:* 1. D:\hp\app\src\screens\HoldScreen.tsx, under the QR code: add 'After the client presses Continue on PayPal, the approval is complete. The client can close the PayPal page, even if it shows a link that cannot be opened. This phone confirms the hold within a few seconds.'
2. D:\hp\README.md, limitations section: state that return_url / cancel_url are app deep links (holdproof://) because the build has no server to host a return page, that the client's browser may show an unopenable link after approval, and that a production build would return to an HTTPS page served by the backend.
3. Do not change APPROVAL_RETURN_URL / APPROVAL_CANCEL_URL and do not add a Linking handler. Record in the fixer notes that acceptance of the custom scheme by Sandbox must be confirmed on a device by the owner.

**Agent 3, Fixer (fixed).** Added the client instruction under the QR code. Documented the holdproof:// return/cancel deep-link limitation and the production HTTPS return page in README and SECURITY. APPROVAL_RETURN_URL/APPROVAL_CANCEL_URL are unchanged and no Linking handler was added. The owner must still confirm on a device that PayPal Sandbox accepts the custom scheme at order creation; this is added to QA_REPORT as Not run.

*Files:* `app/src/screens/HoldScreen.tsx`, `README.md`, `docs/SECURITY.md`, `docs/QA_REPORT.md`

**Agent 4, Verifier (verified).** HoldScreen.tsx lines 172-175 carry the client instruction under the QR code. README.md line 177 and docs/SECURITY.md document the holdproof:// return/cancel limitation and the production HTTPS return page. APPROVAL_RETURN_URL / APPROVAL_CANCEL_URL are unchanged and no Linking handler was added. QA_REPORT.md line 22 lists the sandbox acceptance check as Not run.

*Remaining note:* The owner must confirm on a device that PayPal Sandbox accepts the custom-scheme return_url at order creation. If it is rejected, order creation fails and the demo flow stops at step 3.

### G6. Polling for approval has no terminal handling for expired, voided or missing orders and no backoff

- **File:** `app/src/screens/HoldScreen.tsx` line 27 · **Category:** ux-state

**Agent 1, Reviewer (medium).** The interval (lines 27-41) calls syncHold every POLL_INTERVAL_MS (3000 ms) for as long as status is AWAITING_APPROVAL and writes every failure to the error banner. syncHold only acts on APPROVED (holdproof.ts line 125); a 404 RESOURCE_NOT_FOUND for an expired order or a VOIDED order is never converted into a local state change.

*Failure scenario:* The worker creates the order and the client approves hours later or never. Once PayPal expires the order, every 3 seconds the screen shows 'RESOURCE_NOT_FOUND …' while the QR code for a dead link is still displayed; the job never leaves 'Awaiting client'. A persistent 401/429 produces the same endless error loop.

*Proposed fix:* In syncHold map 404 and order status VOIDED to a local EXPIRED/CANCELLED outcome with a log entry and offer 'Create a new approval request' (new order with a fresh request id). In HoldScreen stop the interval after repeated identical failures and show a manual 'Check again' button; stop on 401 with a prompt to re-enter keys.

**Agent 2, Devil's Advocate (accept-with-changes, low).** Real but narrower than stated. The interval in HoldScreen.tsx lines 27-41 does write the same error to the banner every 3 seconds for a persistent 401, 404 or network failure, and nothing converts a dead order into a local state. I reject a new EXPIRED JobStatus (it ripples through StatusPill, HomeScreen totals and the Judge for no demo value) and I reject 'Create a new approval request' on the same job: the order request id is `hp-order-${job.id}` and the digest is bound to the order; starting a new job is the correct path. The VOIDED mapping is already required under G2.

*Required fix:* 1. D:\hp\app\src\services\holdproof.ts syncHold: catch a PayPalError with status 404 from getOrder and set the job to CANCELLED with a 'paypal' log entry 'PayPal no longer has order <id> (expired or removed). No money was held. Start a new job to ask again.'
2. D:\hp\app\src\screens\HoldScreen.tsx: count consecutive polling failures in a ref; after 5 consecutive failures stop the interval, keep the last error visible, and show a 'Check again' button that resets the counter and resumes polling. Reset the counter on any success. When the error is a PayPalError with status 401, use the message 'PayPal rejected the sandbox keys. Update them in Settings.'
3. When the job status is CANCELLED on this screen, show a short card: 'This approval request is closed. No money was held.' with a button back to Home.

**Agent 3, Fixer (fixed).** syncHold maps a 404 from getOrder to CANCELLED with the specified 'paypal' log entry. HoldScreen counts consecutive polling failures in a ref and stops after 5. The last error stays visible, an amber card explains the stop, and a 'Check again' button resets the counter and resumes polling; any success resets the counter. A 401 shows 'PayPal rejected the sandbox keys. Update them in Settings.' and also stops polling immediately, since retrying cannot succeed. A CANCELLED job shows 'This approval request is closed. No money was held.' with a 'Back to Home' button.

*Files:* `app/src/services/holdproof.ts`, `app/src/screens/HoldScreen.tsx`

**Agent 4, Verifier (verified).** syncHold maps a 404 from getOrder to CANCELLED with the specified log text. HoldScreen counts failures in a ref, stops after 5 (or immediately on 401), keeps the error visible, shows an amber card and a 'Check again' button that resets the counter; success resets the counter; the 401 message matches. A CANCELLED job shows the closed-request card and a 'Back to Home' button.

### G7. max_tokens of 8000 is shared with always-on thinking on claude-opus-5-5, so structured verdicts can be cut off

- **File:** `app/src/ai/agents.ts` line 62 · **Category:** ai-integration

**Agent 1, Reviewer (medium).** callStructured sends `max_tokens: opts.maxTokens ?? 8000` (line 62) with `output_config.effort` of 'medium' and two images; no caller passes maxTokens. On claude-opus-5-5 thinking cannot be disabled and thinking tokens count against max_tokens. A max_tokens stop is returned as an error (lines 73-75), which fails the verdict closed.

*Failure scenario:* On a detailed scene the Proposer or Critic spends most of the 8000 tokens reasoning; the JSON is truncated, the user sees 'The AI response was cut off before it finished', the Judge refuses, and the worker must retake the photo and pay for two more calls. This can recur during a live demo.

*Proposed fix:* Raise the default to about 16000 (still safe for a non-streaming request under the 120 s client timeout) and keep the fail-closed handling. Optionally use effort 'low' for the dispute check only, as already done.

**Agent 2, Devil's Advocate (accept-with-changes, medium).** Confirmed against the current API reference: on claude-opus-5-5 thinking cannot be disabled, thinking tokens count against max_tokens, and the recommended non-streaming default is about 16000. callStructured (src/ai/agents.ts line 62) uses 8000 with two images and effort 'medium', and a max_tokens stop is correctly treated as a failure, so a truncated verdict costs the user a retake and two more calls. The rest of the request is correct and must not be altered: beta messages endpoint, `output_config.format` json_schema, explicit effort, refusal handling, `betas: ['server-side-fallback-2026-07-01']` with `fallbacks: 'default'`, and no `thinking` parameter. Do NOT convert to streaming: React Native fetch does not reliably support streamed bodies, and non-streaming at 16000 is within guidance. One addition the Reviewer omitted: the client timeout is fixed at 120 000 ms, which becomes the tighter limit once the cap is doubled. Do not lower verdict effort to 'low'; the verdict gates money.

*Required fix:* In D:\hp\app\src\ai\agents.ts: change the default to `max_tokens: opts.maxTokens ?? 16000`; raise the client `timeout` to 180_000 and set `maxRetries: 1` so the worst-case wait stays bounded (about 6 minutes). Keep model, betas, fallbacks, output_config, effort values and the fail-closed handling of 'refusal' and 'max_tokens' unchanged. Improve the max_tokens message to 'The AI response was cut off before it finished. No money moved. Capture the AFTER photo again.' Update any README or docs/ARCHITECTURE.md line that quotes 8000.

**Agent 3, Fixer (fixed).** The max_tokens default is now 16000, the timeout 180_000 and maxRetries 1. Model, betas, fallbacks, output_config and effort are unchanged, and refusal and max_tokens still fail closed. The cut-off message now reads 'The AI response was cut off before it finished. No money moved. Try again; for a photo check, capture the AFTER photo again.' This is broadened slightly from the specified text because the same path also serves scoping and dispute drafts. No document quoted 8000; ARCHITECTURE.md now states 16000.

*Files:* `app/src/ai/agents.ts`, `docs/ARCHITECTURE.md`

**Agent 4, Verifier (verified).** agents.ts: max_tokens default 16000 (line 64), timeout 180_000, maxRetries 1; model, betas, output_config and effort values are unchanged; refusal and max_tokens still return errors. docs/ARCHITECTURE.md line 13 states 16000. No file quotes 8000.

### G8. Save flow on the setup screen has no error handling around saveCredentials; the button can spin forever

- **File:** `app/src/screens/CredentialsScreen.tsx` line 57 · **Category:** ux-state

**Agent 1, Reviewer (medium).** onSave awaits `saveCredentials(...)` (line 57) outside any try/catch; setBusy(false) follows it. A SecureStore failure (Keystore unavailable, device lock state) rejects the promise and leaves busy=true with the status text 'Checking the AI key…'. NewJobScreen.onScope (line 33) has the same pattern around loadCredentials.

*Failure scenario:* Keystore write fails on first launch; the footer button shows a spinner indefinitely with no message, and the judge cannot get past setup without force-closing the app.

*Proposed fix:* Wrap the whole onSave body in try/catch/finally; on failure show 'Could not store the keys in encrypted storage: <message>' and reset busy and status. Apply the same guard in NewJobScreen.onScope.

**Agent 2, Devil's Advocate (accept, medium).** Confirmed. In CredentialsScreen.onSave, `await saveCredentials(...)` (line 57) and `await testAiKey(...)` sit outside try/catch; a SecureStore rejection leaves busy true with the status text showing. NewJobScreen.onScope awaits loadCredentials outside try/catch with the same result. The same defect exists in DisputesScreen.onDraft (lines 37-44): draftDispute calls mustGet and aiKey, both of which can throw, and busy is never reset.

*Required fix:* 1. CredentialsScreen.onSave: one try/catch/finally around the whole body. Keep the two specific messages for PayPal and AI failures; for any other failure show 'Could not store the keys in this device's encrypted storage: <message>'. Reset busy and status in finally. Navigate only after saveCredentials resolves.
2. NewJobScreen.onScope: wrap in try/catch/finally; show the error message; reset busy in finally.
3. DisputesScreen.onDraft: wrap in try/catch/finally with describePayPalError for the message.
4. Also call the new resetPayPalClient() (see G11) after a successful save.

**Agent 3, Fixer (fixed).** CredentialsScreen.onSave has one try/catch/finally. It keeps the PayPal and AI messages, reports other failures as 'Could not store the keys in this device's encrypted storage: <message>', resets busy and status in finally, navigates only after saveCredentials resolves, and calls resetPayPalClient() after saving. The editing-mode loadCredentials also catches errors. NewJobScreen.onScope and DisputesScreen.onDraft are wrapped in try/catch/finally; onDraft uses describePayPalError.

*Files:* `app/src/screens/CredentialsScreen.tsx`, `app/src/screens/NewJobScreen.tsx`, `app/src/screens/DisputesScreen.tsx`

**Agent 4, Verifier (verified).** CredentialsScreen.onSave has one try/catch/finally with the PayPal, AI and encrypted-storage messages, resets busy and status in finally, navigates only after saveCredentials resolves, and calls resetPayPalClient(). NewJobScreen.onScope and DisputesScreen.onDraft are wrapped in try/catch/finally; onDraft uses describePayPalError.

### G9. Refund records are stored as final regardless of PayPal status and are never refreshed

- **File:** `app/src/services/holdproof.ts` line 273 · **Category:** paypal-integration

**Agent 1, Reviewer (medium).** executeRefund appends the refund with whatever `readBack.status` is (line 273). decideRefund treats any existing record for the criterion as 'Already refunded' and subtracts its amount from the remaining balance (judge.ts lines 113-125). refreshFromPayPal (lines 296-306) re-reads the authorization and capture only, never the refunds.

*Failure scenario:* A refund returns PENDING and later completes, or returns FAILED/CANCELLED. The Job screen shows the stale status permanently; a failed refund blocks any retry for that criterion and reduces the 'remaining' amount although no money moved.

*Proposed fix:* Count only COMPLETED and PENDING refunds in decideRefund's `alreadyRefunded`; in refreshFromPayPal call getRefund for each stored refund and update its status; when a refund is FAILED or CANCELLED allow a retry with a new request id suffix.

**Agent 2, Devil's Advocate (accept-with-changes, low).** Real: executeRefund stores readBack.status once (line 273), refreshFromPayPal never re-reads refunds, and decideRefund's 'once' and 'remaining' checks count every record. A PENDING refund that later completes is the realistic case; FAILED or CANCELLED is rare in Sandbox, so severity is low. Refinement: the filtering belongs inside the Judge, not in the service, so that the money rule stays in src/core/judge.ts and is covered by a test.

*Required fix:* 1. src/core/judge.ts: extend RefundInput.alreadyRefunded items with optional `status?: string`; inside decideRefund ignore entries whose status is FAILED or CANCELLED for both the 'once' and 'remaining' checks. Add tests in D:\hp\app\__tests__\judge.test.ts: a FAILED refund does not block a retry or reduce the remaining amount; a PENDING refund does both.
2. src/services/holdproof.ts refundDecision: pass `status: r.status`.
3. executeRefund: build the request id as `hp-refund-${job.id}-${criterionId}` plus `-r${n}` where n is the number of earlier FAILED/CANCELLED refunds for that criterion when n > 0 (unchanged when n is 0, so normal retries stay idempotent).
4. refreshFromPayPal: for each stored refund call getRefund and update its status; also refresh the capture status.

**Agent 3, Fixer (fixed).** RefundInput.alreadyRefunded items take an optional status; decideRefund ignores FAILED/CANCELLED entries for both the 'once' and 'remaining' checks. refundDecision passes r.status. executeRefund appends -r<n> to the request id only when n earlier FAILED/CANCELLED refunds exist for that criterion. refreshFromPayPal re-reads every stored refund with getRefund (and the capture), updates statuses and logs changes. Added Judge tests: FAILED/CANCELLED do not block a retry or reduce the remaining amount; PENDING/COMPLETED do both.

*Files:* `app/src/core/judge.ts`, `app/src/services/holdproof.ts`, `app/__tests__/judge.test.ts`, `app/__tests__/holdproof-service.test.ts`

**Agent 4, Verifier (verified).** judge.ts: alreadyRefunded items accept optional status; decideRefund filters FAILED/CANCELLED before the 'once' and 'remaining' checks. holdproof.ts refundDecision passes r.status; executeRefund appends -r<n> only when earlier FAILED/CANCELLED refunds exist; refreshFromPayPal re-reads each refund and the capture. Two new Judge tests and one refresh test pass.

### G10. Disputes screen and photo-hash label describe behaviour the code does not perform

- **File:** `app/src/screens/DisputesScreen.tsx` line 50 · **Category:** judge-rejection-risk

**Agent 1, Reviewer (low).** The screen text says 'HoldProof polls the PayPal Disputes API for this capture' and 'You decide whether to send it' (line 50), but checkDisputes runs once on mount and on a button press, and the only action is 'Copy draft' (line 79); there is no send call. VerifyScreen line 54 labels the photo check 'SHA-256 of the stored photo file', while D:\hp\app\src\storage\photos.ts lines 34-35 hash the base64 text of the file, not its bytes.

*Failure scenario:* A judge compares the on-screen claims with the behaviour: no polling occurs, no response can be sent, and hashing the exported JPEG with a standard tool gives a different SHA-256 from the one in the record. Each mismatch reads as an overstated claim.

*Proposed fix:* Reword to 'HoldProof checks the PayPal Disputes API when you open this screen or press Check again' and 'Copy the draft and submit it in the PayPal Resolution Center; PayPal decides the outcome'. Either hash the decoded bytes (Crypto.digest over the Uint8Array from file.bytes()) or label the value 'SHA-256 of the base64 encoding of the stored JPEG' in the UI, export and README.

**Agent 2, Devil's Advocate (accept-with-changes, medium).** Both mismatches are real. DisputesScreen line 50 says 'polls' and 'You decide whether to send it', but checkDisputes runs once on mount and on button press, and the only action is Copy draft. src/storage/photos.ts hashes the base64 TEXT of the file through digestStringAsync, so `sha256sum` on the JPEG gives a different value, while VerifyScreen line 54, the PDF export ('sha256 …') and README line 23 present it as the hash of the photo. I raise this to medium: it is an overstated verifiability claim in an app whose pitch is a tamper-evident record, and it is a wording-only fix. I reject switching to byte hashing now: it changes the evidence path (File.bytes plus Crypto.digest) that cannot be exercised on a device by the Fixer while the native build is being debugged, and it would invalidate the digests of existing jobs. Accurate labelling carries no runtime risk.

*Required fix:* 1. DisputesScreen text: 'HoldProof checks the PayPal Disputes API for this capture when you open this screen or press Check PayPal again. If a dispute exists, the Proposer drafts a response from the evidence record and the Critic removes anything the record does not support. HoldProof does not submit it: copy the draft and submit it yourself in the PayPal Resolution Center. PayPal decides the outcome.'
2. VerifyScreen line 54 detail: 'SHA-256 of the base64 text of the stored JPEG'.
3. exportRecord.ts: label both hashes 'sha256 (of the base64 text of the JPEG)'; in buildRecord add `photo_hash_method: 'SHA-256 over the base64 encoding of the stored JPEG file'`.
4. README.md (step 2 row and the verification section), docs/ARCHITECTURE.md and docs/SECURITY.md: state the same method and how to reproduce it (base64-encode the JPEG without line breaks, then SHA-256 the text). Replace any 'polls for disputes' wording with 'checks on demand'. Leave src/storage/photos.ts logic unchanged apart from a corrected comment.

**Agent 3, Fixer (fixed).** The Disputes text now uses the specified on-demand, not-submitted wording. The Verify detail reads 'SHA-256 of the base64 text of the stored JPEG'. The PDF labels both hashes 'sha256 (of the base64 text of the JPEG)'. buildRecord adds photo_hash_method. The photos.ts comment is corrected and its logic is unchanged. README gains a 'Verifying a record by hand' section with the reproduction method; the step 2 and step 6 rows and the endpoint table are updated (the unused getDispute endpoint was removed from the table). ARCHITECTURE, SECURITY and AGENT_WORKFLOW match.

*Files:* `app/src/screens/DisputesScreen.tsx`, `app/src/screens/VerifyScreen.tsx`, `app/src/services/exportRecord.ts`, `app/src/services/holdproof.ts`, `app/src/storage/photos.ts`, `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/AGENT_WORKFLOW.md`

**Agent 4, Verifier (verified).** DisputesScreen.tsx line 55 carries the on-demand, not-submitted wording. VerifyScreen.tsx line 54 reads 'SHA-256 of the base64 text of the stored JPEG'. exportRecord.ts labels both hashes 'sha256 (of the base64 text of the JPEG)'. buildRecord adds photo_hash_method. photos.ts has only a corrected comment. README (steps 2 and 6, endpoint table, 'Verifying a record by hand'), ARCHITECTURE.md and SECURITY.md state the same method.

### G11. PayPal client with client ID, secret and bearer token stays cached in memory after 'Remove keys'

- **File:** `app/src/services/holdproof.ts` line 16 · **Category:** security

**Agent 1, Reviewer (low).** Module-level `cached` (line 16) holds `key = clientId:clientSecret` and a PayPalClient instance with the secret and access token (lines 26-27). SettingsScreen.onClear (lines 19-31) calls clearCredentials only; nothing resets `cached`.

*Failure scenario:* After the user removes the keys, the secret and a valid sandbox access token remain in process memory until the app is killed, which contradicts the 'removed from this device' statement the popup must make.

*Proposed fix:* Export a resetPayPalClient() from holdproof.ts that sets cached = null, and call it from SettingsScreen.onClear and after saveCredentials.

**Agent 2, Devil's Advocate (accept, low).** Confirmed: module-level `cached` in src/services/holdproof.ts line 16 keeps the client id, secret and bearer token after SettingsScreen.onClear calls clearCredentials. Once the popup states that Settings removes the keys, the in-memory copy should be dropped as well. The fix is three lines.

*Required fix:* Export `resetPayPalClient()` from src/services/holdproof.ts that sets `cached = null`. Call it in SettingsScreen.onClear after clearCredentials and in CredentialsScreen.onSave after saveCredentials.

**Agent 3, Fixer (fixed).** Exported resetPayPalClient(), which sets cached = null. It is called after clearCredentials in SettingsScreen.onClear (now wrapped in try/catch with an ErrorBanner) and after saveCredentials in CredentialsScreen.onSave. A test confirms that a new client is built after the reset.

*Files:* `app/src/services/holdproof.ts`, `app/src/screens/SettingsScreen.tsx`, `app/src/screens/CredentialsScreen.tsx`, `app/__tests__/holdproof-service.test.ts`

**Agent 4, Verifier (verified).** holdproof.ts line 39 exports resetPayPalClient() (cached = null). It is called in SettingsScreen.onClear after clearCredentials and in CredentialsScreen.onSave after saveCredentials. A test confirms a new client is built after reset.

### G12. Missing end states and housekeeping in the job list

- **File:** `app/src/screens/JobScreen.tsx` line 88 · **Category:** ux-state

**Agent 1, Reviewer (low).** The status caption (lines 88-90) has no text for CANCELLED or for a job that reaches the Job screen in another state; an EXPIRED authorization is labelled VOIDED with 'The hold was voided' (holdproof.ts line 304). deleteJob exists in D:\hp\app\src\storage\jobs.ts (line 53) but no screen calls it, and JobScreen does not refresh from PayPal on open. AUTHORIZATION_HONOR_DAYS (judge.ts line 11) is declared and never used, so the 3-day honor period is not surfaced.

*Failure scenario:* Abandoned DRAFT and CANCELLED jobs accumulate on Home with no way to remove them; an expired hold is reported as voided; a hold older than three days shows no warning that capture is no longer guaranteed.

*Proposed fix:* Add captions for CANCELLED and expired holds, a 'Delete job' action for DRAFT/READY/CANCELLED/VOIDED jobs (also deleting their evidence files), a refreshFromPayPal call when JobScreen gains focus, and an informational Judge/UI note when the authorization is older than AUTHORIZATION_HONOR_DAYS.

**Agent 2, Devil's Advocate (accept-with-changes, low).** Mixed. Accepted: JobScreen lines 88-90 give no caption for CANCELLED, and refreshFromPayPal (line 304) folds EXPIRED into VOIDED so the screen says 'The hold was voided' for a hold that expired; that is an inaccurate statement about money. AUTHORIZATION_HONOR_DAYS is declared and unused; a one-line note is cheap and honest. Rejected: automatic refreshFromPayPal on focus (a manual Refresh exists, and an automatic call raises error banners whenever the phone is offline) and a Delete job feature with evidence-file deletion (new destructive scope with no bearing on acceptance, two days before the deadline).

*Required fix:* 1. JobScreen caption: add CANCELLED ('This job was cancelled. No money was held.') and, for VOIDED, choose the text from paypalStatus.authorization: EXPIRED gives 'The hold expired at PayPal and was released to the client.'; otherwise keep the voided text.
2. refreshFromPayPal: keep the VOIDED local status for EXPIRED but add a 'paypal' log entry naming the real authorization status.
3. JobScreen, when status is HELD and authorizedAt is older than AUTHORIZATION_HONOR_DAYS days: show an amber card 'This hold is more than 3 days old. PayPal guarantees the funds only during the honor period; capture may be declined after it.' Import the constant from src/core/judge.ts. Do not make it a Judge check.
4. Do not add auto-refresh on focus or job deletion.

**Agent 3, Fixer (fixed).** JobScreen adds a CANCELLED caption and an EXPIRED-specific VOIDED caption. It shows an amber card when a HELD job's authorizedAt is older than AUTHORIZATION_HONOR_DAYS (imported from judge.ts); this is not a Judge check. refreshFromPayPal keeps VOIDED for EXPIRED but now applies it only to HELD jobs with no capture, and adds a 'paypal' log entry naming the real authorization status. No auto-refresh on focus or job deletion was added.

*Files:* `app/src/screens/JobScreen.tsx`, `app/src/services/holdproof.ts`

**Agent 4, Verifier (verified).** JobScreen.tsx adds the CANCELLED caption, the EXPIRED-specific VOIDED caption, and an amber card when a HELD job's authorizedAt is older than AUTHORIZATION_HONOR_DAYS (imported from judge.ts, not a Judge check). refreshFromPayPal keeps VOIDED for EXPIRED and logs 'PayPal reports authorization <id> as EXPIRED.' (test passes). No auto-refresh or job deletion was added.

### M1. Popup does not disclose which user data leaves the phone (photos and job description go to the AI provider) (added by Agent 2)

**Agent 2 (high).** runVerdict (D:\hp\app\src\services\holdproof.ts lines 159-167) sends both photos as base64 to the AI provider, scopeJob sends the job description, and draftDispute sends the whole evidence record (which includes GPS coordinates and the timeline). The current notice and the Reviewer's list speak only about where the KEYS are sent.

*Required fix:* Include the data-flow sentence in the popup section 'Where keys and data are sent' as specified under G1: job description, BEFORE/AFTER photos and, for a dispute draft, the evidence record (including photo time and location) go to api.anthropic.com; job title, amount and evidence digest go to api-m.sandbox.paypal.com; nothing else leaves the phone. Mirror it in D:\hp\README.md and D:\hp\docs\SECURITY.md.

**Agent 3, Fixer (fixed).** The popup section 'Where the keys and your data are sent' states the data flows. The job description, the BEFORE/AFTER photos and, for a dispute draft, the evidence record (including photo times and locations) go to api.anthropic.com. The job title, amount and evidence digest go to api-m.sandbox.paypal.com. Nothing else leaves the phone, and there is no server and no analytics. This is mirrored in the README notice table and a SECURITY.md 'Data that leaves the phone' table.

**Agent 4, Verifier pass 1 (partial).** The popup section 'Where the keys and your data are sent' (config.ts lines 79-85) states the data flows to api.anthropic.com and api-m.sandbox.paypal.com exactly as the accepted fix specified; README.md line 21 and the SECURITY.md table mirror it.

*Remaining problem:* The PayPal list is incomplete against the code. executeRefund (holdproof.ts line 398-399) sends the contested criterion text to PayPal in note_to_payer ('Partial refund: "<criterion text>" was contested on site.'), and createAuthorizeOrder also sends the internal job id as reference_id. The popup, README and SECURITY.md say only 'the job title, the amount and the evidence digest'. Suggested wording: 'To api-m.sandbox.paypal.com: the job title, the amount, the evidence digest, a job reference id and, for a refund, the text of the contested criterion.' The AI list could also name the agreed criteria alongside the job description.

**Agent 3, repair round (fixed).** The data-flow statement now matches the code. PayPal receives: the job title, the amount, the evidence digest (custom_id), a job reference id (reference_id, which also builds the capture invoice_id) and, for a partial refund, the text of the contested criterion in note_to_payer. The AI provider receives: the job description and price, the agreed criteria, the BEFORE and AFTER photos and, for a dispute draft, the dispute summary and the evidence record. The popup section in config.ts, the README notice table row and the SECURITY.md data-flow table use the same wording.

**Agent 4, Verifier pass 2 (verified).** D:\hp\app\src\config.ts lines 79-85 now state that api-m.sandbox.paypal.com receives the job title, the amount, the evidence digest, a job reference id (also used to build the capture invoice id) and, for a partial refund, the text of the contested criterion in the note to the client. I traced each item to the code: holdproof.ts line 118-120 (referenceId: job.id, customId: job.digest, description with the job title), line 310 (invoice id HP-<job id prefix>), line 399 (refund note with criterion.text); client.ts lines 151-153, 186, 203. The capture note_to_payer in client.ts line 188 is a fixed sentence with no job data. The AI line names the job description and price, the agreed criteria, the BEFORE and AFTER photos and, for a dispute draft, the dispute summary and the evidence record including photo times and locations.

### M2. README and docs must be brought in line with every changed claim (added by Agent 2)

**Agent 2 (medium).** README lines 5-8 describe the popup; line 23 says 'SHA-256 of photo'; line 108 and the endpoint table describe polling; D:\hp\docs\SECURITY.md, ARCHITECTURE.md and QA_REPORT.md describe the same behaviour. After G1, G5, G7 and G10 these documents would contradict the app.

*Required fix:* After the code changes, update README.md, docs/SECURITY.md, docs/ARCHITECTURE.md and docs/QA_REPORT.md: full popup notice text (or its section list), data flows, photo hash method, disputes checked on demand and not submitted by the app, deep-link return limitation, location requirement for both photos, max_tokens value. Do not add statistics or test results that were not actually run.

**Agent 3, Fixer (fixed).** The docs now cover the popup section list and behaviour, data flows, the photo hash method and how to reproduce it, disputes checked on demand and not submitted, the deep-link return limitation, the location requirement for both photos, the polling stop and Check again, max_tokens 16000, the recovery rules, and the test count (46, from an actual run). The new device scenarios in QA_REPORT are marked Not run. No statistics were added.

**Agent 4, Verifier pass 1 (verified).** README.md, docs/SECURITY.md, docs/ARCHITECTURE.md, docs/QA_REPORT.md and docs/AGENT_WORKFLOW.md cover the popup section list, data flows, photo hash method and reproduction, disputes checked on demand and not submitted, the deep-link limitation, the location requirement, polling stop and Check again, and max_tokens 16000. The test count of 46 matches my own run. New device scenarios are marked Not run. No statistics were added.

*Remaining problem:* The data-flow wording inherits the M1 gap.

**Agent 3, repair round (fixed).** The data-flow gap that M2 inherited from M1 is closed by the same wording change in README.md and docs/SECURITY.md.

**Agent 4, Verifier pass 2 (verified).** D:\hp\README.md line 21 and D:\hp\docs\SECURITY.md line 23 carry the same data-flow wording as the popup, including the job reference id and the contested criterion text in note_to_payer.

### M3. No verification step defined for the fixes (added by Agent 2)

**Agent 2 (medium).** The existing tests cover judge, money/digest and the PayPal client only. G2, G4 and G9 change money-path logic.

*Required fix:* The Fixer must run `npx tsc --noEmit` and the Jest suite from D:\hp\app after the changes and report the real results; add Judge tests for the refund status rule (G9) and PayPal client tests for any new type or method. Do not run or modify anything under D:\hp\app\android, and do not commit or push.

**Agent 3, Fixer (fixed).** Added 2 Judge refund-status tests and a new holdproof-service test file with 15 tests (storage, AI and PayPalClient mocked). The PayPal client gained only an optional type field and no new method, so no client test was needed. tsc and jest were run from D:\hp\app. Nothing under android was touched, and nothing was committed or pushed.

**Agent 4, Verifier pass 1 (verified).** I ran both commands in D:\hp\app. `npx tsc --noEmit` exited 0 with no output. `npx jest` reported 4 suites and 46 tests passed. judge.test.ts has the two refund-status tests; holdproof-service.test.ts has 15 tests. git status shows nothing under app/android (it is ignored) and no commits were made.

**Agent 4, Verifier pass 2 (verified).** I ran both commands in D:\hp\app. npx tsc --noEmit: no output, exit code 0. npx jest: 4 suites passed, 46 tests passed, exit code 0. git status shows no change under app/android.

### M4. Cancel button on the Hold screen has no error handling (added by Agent 2)

**Agent 2 (low).** Line 83 of the screen: `onPress={async () => { await cancelUnapproved(jobId); navigation.popToTop(); }}` has no try/catch. After the G2 change cancelUnapproved performs a network call and can throw, which would become an unhandled rejection with no message.

*Required fix:* Covered by step 4 of the G2 fix: try/catch, ErrorBanner message, a busy state on the button, and popToTop only when the job is CANCELLED.

**Agent 3, Fixer (fixed).** Covered by G2 step 4: the Cancel job handler has try/catch, shows its message in the ErrorBanner, uses a busy/loading state, and calls popToTop only when the returned job is CANCELLED.

**Agent 4, Verifier pass 1 (verified).** HoldScreen.tsx lines 81-92 and 125: try/catch/finally, ErrorBanner, loading and disabled state on the button, popToTop only when the returned job is CANCELLED.

## Verifier summaries

**Pass 1:** Fifteen of the sixteen fixes are verified against the code; M1 is partial. The typecheck passes with no errors and all 46 tests pass, both run by me in D:\hp\app.

The popup covers every point of the mandatory item. It scrolls, the acknowledgement button sits outside the scroll area, the back button cannot dismiss it, Save stays disabled until acknowledgement, and the notice is re-readable from the setup screen and in Settings. I verified the layout by reading the code only; nothing was run on a device.

The one remaining problem is an accuracy gap in the data-flow statement. The popup, README.md and docs/SECURITY.md say PayPal receives only the job title, the amount and the evidence digest. The code also sends the contested criterion text in the refund note (D:\hp\app\src\services\holdproof.ts, executeRefund) and the job id as the order reference. A judge who compares the notice with the code could read this as an understated disclosure. The fix is a one-line wording change in D:\hp\app\src\config.ts, mirrored in the two documents.

I found no regressions. The Expo SDK 58 camera calls are unchanged, the PayPal host is still hard-coded to the sandbox, and no dependency was added.

Two items stay open for the owner:
- Confirm on a device that PayPal Sandbox accepts the holdproof:// return and cancel URLs at order creation; all device scenarios in docs/QA_REPORT.md are marked Not run.
- git status shows D:\hp\app\app.json modified and a new D:\hp\app\plugins folder (withShortCmakeObjectPaths). These come from the Android build work, not from the Fixer; decide whether to include them in the commit.

Nothing was edited, committed or pushed by this verification.

**Pass 2:** The one item that failed the first pass, M1, is now verified, and M2, which inherited its gap, is verified with it. The typecheck passes with exit code 0 and all 46 tests pass, both run by me in D:\hp\app.

The popup's data-flow section now matches what the code sends. I traced each PayPal item to its call: the job id as the order reference and in the capture invoice id, the digest as custom_id, the job title in the order description, and the contested criterion text in the refund note. D:\hp\README.md and D:\hp\docs\SECURITY.md use the same wording.

The popup covers every mandatory point, cannot be dismissed with the back button, keeps Save disabled until acknowledgement, and is re-readable from the setup screen and Settings. I verified this by reading the code only; nothing was run on a device.

I found no regressions and edited nothing. No commit or push was made, and app/android is untouched.

Three items remain for the owner:
- Confirm on a device that PayPal Sandbox accepts the holdproof:// return and cancel URLs at order creation; the device scenarios in docs/QA_REPORT.md are marked Not run.
- Decide whether the modified D:\hp\app\app.json and the untracked D:\hp\app\plugins folder belong in the commit. The first verification pass attributed them to the Android build work.
- Decide whether the untracked D:\hp\release folder belongs in the commit.
