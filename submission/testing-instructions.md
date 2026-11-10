# Testing instructions (template)

> Paste into Devpost's testing-instructions field and fill in the bracketed values THERE ONLY.
> Never commit real credentials to this repository.

---

**HoldProof — testing instructions (PayPal Sandbox only, hackathon demonstration)**

**1. Install**
Download the APK: https://github.com/parthibansankars/HoldProof-Paypal/raw/main/release/app-release.apk
Install it on an Android phone (Android 8+; allow installs from your browser or file manager). Grant Camera and Location when asked, and keep Location Services on: evidence photos without a location are refused by design.

**2. Enter the test keys** (the app asks on first launch, after the hackathon notice)
- PayPal Sandbox Client ID: [PASTE SANDBOX CLIENT ID]
- PayPal Sandbox Client Secret: [PASTE SANDBOX CLIENT SECRET]
- Gemini API key: [PASTE GEMINI API KEY]

The app checks each key before saving it and stores them only in the phone's encrypted storage. They are sandbox and test keys and move no real money.

**3. Client approval account** (used on PayPal's own page, never typed into the app)
- PayPal Sandbox buyer email: [PASTE SANDBOX BUYER EMAIL]
- PayPal Sandbox buyer password: [PASTE SANDBOX BUYER PASSWORD]

**4. Happy path (about 5 minutes)**
1. Tap **Start a new job** → **Use the demo job** → **Generate photo-checkable criteria**. Note the refused criteria. Agree.
2. Take the **BEFORE** photo of a small cluttered area (for example a desk corner with a few objects).
3. Tap **Ask client to approve**. Either scan the QR code with a second phone, or tap **Open approval on this phone**. Log in with the sandbox buyer account above and approve. The app shows **HELD** within a few seconds.
4. Clear the area, tap **Job done · take the AFTER photo**, and photograph the same spot from the same position.
5. Watch the **Proposer**, **Critic** and **Judge** results, then tap **Release** and confirm. The app shows the capture status read back from PayPal.

**5. Failure path (shows that the AI cannot move money on its own)**
Start another job, approve the hold, then take the AFTER photo of a *different* place. The Critic objects, the Judge refuses, and **no PayPal call is made**. Tap **Abandon job · void the hold** to release it.

**6. Also try**
- **Verify record**: recomputes the evidence fingerprint and matches it with the `custom_id` stored in the PayPal order.
- **Export record (PDF)**.
- On a released job, **Client contests a criterion**: a capped partial refund through PayPal.

**Notes**
- Each photo check makes two AI calls and takes roughly 20 to 60 seconds.
- You can see every transaction in the sandbox merchant account at https://www.sandbox.paypal.com (business login: [PASTE SANDBOX BUSINESS EMAIL] / [PASTE SANDBOX BUSINESS PASSWORD], optional).
- These keys stay active until judging ends on 15 December 2026.
