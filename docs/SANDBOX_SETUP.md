# PayPal Sandbox setup and money flow

> Hackathon demonstration only. Every account and key in this guide belongs to the PayPal
> **Sandbox**, a test environment with test money. No real money moves at any point.

This guide explains which PayPal accounts HoldProof uses, how the receiver of the money is
chosen, how to create every account and key from scratch, and what happens at each step of a job.
It also lists the problems we met during testing and how to resolve each one.

---

## 1. The accounts involved

A test needs one developer login and two sandbox accounts.

| # | Account | Role in HoldProof | Where it is created | Where it is used |
|---|---|---|---|---|
| 0 | **Developer login** (a real PayPal account) | Owns the developer dashboard; creates the sandbox accounts and the app keys | [developer.paypal.com](https://developer.paypal.com) → Sign Up | Only to sign in to the dashboard |
| 1 | **Sandbox Business account**, United States | **Receiver**: the worker, who is paid | Dashboard → [Sandbox Accounts](https://developer.paypal.com/dashboard/accounts) | Never typed into the app. It is linked to the app keys (see section 2) |
| 2 | **Sandbox Personal account**, United States | **Payer**: the client, who approves the hold | Dashboard → [Sandbox Accounts](https://developer.paypal.com/dashboard/accounts) | Logs in on PayPal's own approval page (`www.sandbox.paypal.com`) |

Two other keys are entered in the app:

| Key | Purpose | Where it comes from |
|---|---|---|
| PayPal **Client ID** and **Secret** | Lets the app call the PayPal Sandbox REST APIs on behalf of account 1 | Dashboard → [Apps & Credentials](https://developer.paypal.com/dashboard/applications/sandbox) |
| **Gemini API key** | Runs the Proposer and Critic AI agents | [Google AI Studio](https://aistudio.google.com/apikey) (free tier) |

---

## 2. How the receiver is chosen

**The receiver is never entered in the app.** PayPal decides it from the Client ID and Secret.

1. In the dashboard, every Client ID and Secret belongs to one **app**.
2. When the app is created, it is linked to one **sandbox Business account** (account 1).
3. HoldProof creates every order with that Client ID and Secret.
4. PayPal therefore makes account 1 the **payee** of the order. When the hold is released, the money
   goes to account 1.

```
 Client ID + Secret ──belongs to──▶ Dashboard app ──linked to──▶ Sandbox Business account (receiver)
         │
         └── entered in HoldProof ──▶ order created ──▶ payee = that Business account
```

**To see which account receives the money:** open
[Apps & Credentials](https://developer.paypal.com/dashboard/applications/sandbox), click the app.
The page shows **Sandbox Account: sb-…@business.example.com**. The same address appears in the
`payee` section of every order the app creates.

**To change the receiver:** create a new app linked to a different Business account, and enter
that app's Client ID and Secret in HoldProof (Settings → Remove keys from this device, then enter the
new keys).

**In production** each worker would connect their own PayPal account through PayPal's partner
onboarding, and the backend would set each order's payee to that worker. See
[README → Production architecture](../README.md#production-architecture-our-own-backend-service).

---

## 3. Create everything from scratch

### Step 1 — Developer login (account 0)

1. On a PC, open [developer.paypal.com](https://developer.paypal.com) and click **Sign Up**, or sign
   in if you already have a PayPal account.
2. Sign-up creates a **real** PayPal account, so PayPal sends a real SMS code to your phone. If it
   says *"We can't send a new code right now"*, wait 30 to 60 minutes or use a different number. Do
   not request codes repeatedly.
3. Open the [dashboard](https://developer.paypal.com/dashboard/).

> PayPal automatically creates two default sandbox accounts in **your own country**. If that is not
> the United States, do not use them for this test. Create the two accounts below instead.

### Step 2 — Payer, the client (account 2)

1. Open [Sandbox Accounts](https://developer.paypal.com/dashboard/accounts) → **Create account**.
2. Choose **Personal** and **United States** → **Create**.
3. On the new row, click **⋮ → View/Edit account**. Note the email (`sb-…@personal.example.com`) and
   password. Set the PayPal balance to 5000 if it is lower.

### Step 3 — Receiver, the worker (account 1)

1. On the same page, **Create account** → **Business** and **United States** → **Create**.

### Step 4 — Client ID and Secret linked to the receiver

1. Open [Apps & Credentials](https://developer.paypal.com/dashboard/applications/sandbox) and make
   sure **Sandbox** is selected.
2. **Create App** → name `HoldProof`, type **Merchant**.
3. For **Sandbox Account**, choose the **Business** account from step 3, not the Personal one.
4. **Create App**, then copy the **Client ID** and **Secret**.

### Step 5 — Gemini API key

1. Open [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in with a Google
   account and **Create API key**. No payment card is needed.

### Step 6 — Enter the keys in HoldProof

1. Install [`release/app-release.apk`](../release/app-release.apk) on an Android phone.
2. Read the hackathon notice, then enter the Client ID, Secret and Gemini key. The app checks each
   key before saving it in the phone's encrypted storage (Android Keystore). Nothing is saved in
   project files.

---

## 4. What happens during a job

| Step | Who acts | What the app does | PayPal API | Money |
|---|---|---|---|---|
| 1. Agree the job | Worker | Gemini turns the job description into photo-checkable criteria; refuses criteria a photo cannot prove | — | — |
| 2. BEFORE photo | Worker | Records time and location; computes a SHA-256 digest of the agreement and the photo | — | — |
| 3. Create the order | App (with account 1's keys) | Creates an order with intent `AUTHORIZE`; the digest goes in `custom_id` | `POST /v1/oauth2/token`, `POST /v2/checkout/orders` | — |
| 4. Client approves | Client (account 2) | Shows a QR code, or **Open approval on this phone** | PayPal approval page on `www.sandbox.paypal.com` | — |
| 5. Return page | PayPal | Sends the client's browser to the public project page on GitHub. The client can close it | — | — |
| 6. Hold placed | App | Polls the order every 3 seconds; when it is `APPROVED`, authorizes it and reads the authorization back | `GET /v2/checkout/orders/{id}`, `POST …/authorize`, `GET /v2/payments/authorizations/{id}` | **Held** on account 2, not moved. App shows **HELD** |
| 7. AFTER photo | Worker | Same place, same position | — | — |
| 8. Verdict | Proposer (AI), Critic (AI), Judge (fixed rules) | AI compares photos to each criterion; the Critic looks for misses; the Judge runs 11 deterministic checks and fails closed | — | — |
| 9a. Release | Worker | Captures the authorization and reads the capture back | `POST /v2/payments/authorizations/{id}/capture`, `GET /v2/payments/captures/{id}` | Moves from account 2 to account 1 |
| 9b. Cancel | Worker | Voids the authorization | `POST /v2/payments/authorizations/{id}/void` | Hold released back to account 2 |
| 10. Contest | Client | Capped partial refund for one contested criterion | `POST /v2/payments/captures/{id}/refund`, `GET /v2/payments/refunds/{id}` | Part returned to account 2 |
| 11. Dispute | — | Reads disputes and drafts a response from the evidence record | `GET /v1/customer/disputes` | — |

**Why the return page is GitHub and not the app.** The app has no server to host a return page, and
the app link `holdproof://approved` ended PayPal Sandbox checkout in a generic error. The app does not
need the redirect: it confirms the hold by reading the order back from PayPal.

**Checking the money.** Log in at [www.sandbox.paypal.com](https://www.sandbox.paypal.com) with
account 1 to see the capture arrive, or with account 2 to see the hold and the payment. Passwords
are under **⋮ → View/Edit account** on the Sandbox Accounts page.

---

## 5. Problems met during testing and their fixes

| What you see | Cause | Fix |
|---|---|---|
| PayPal page *"Things don't appear to be working"*, address contains `genericError?code=REVGQVVMVA%3D%3D` (`DEFAULT`) | The payer is the same account as the receiver (the Business account that owns the keys). PayPal refuses a payment to yourself | Approve with the **Personal** account (account 2) |
| Redirected to GitHub with `approval=approved`, but the app stays on **Waiting for PayPal · order CREATED** | The payer account was registered by hand on the sandbox website (unverified, outside the US). PayPal declines it at the last step but still redirects. A direct authorize returns `INSTRUMENT_DECLINED` | Use a **dashboard-created United States Personal account** and pay with the **PayPal balance**. Cancel the stuck job and start a new one |
| *"We can't send a new code right now"* while creating a payer account | You are on the real PayPal sign-up page (`www.paypal.com/.../signup`), not the sandbox | Close it. Sandbox accounts are created in the dashboard, with no phone and no code |
| The sandbox asks for a security code at login | Sandbox step-up check | Enter `111111`. If it keeps asking, log in once at `www.sandbox.paypal.com` on a PC, or create another Personal account |
| Dashboard link redirects to `www.paypal.com/signin?returnUri=…developer.paypal.com…` | Normal: the dashboard signs in through PayPal | Sign in with the **developer login** (account 0). Do not sign up again |
| The same failed order keeps failing | PayPal can keep refusing an order after a failed attempt | Cancel the job and start a new one |

### Checking an order directly (optional)

Run in PowerShell on a PC. It asks for the sandbox keys, keeps them in that terminal only, and
prints the order status. Replace `ORDER_ID` with the order id.

```powershell
$id     = Read-Host 'Sandbox Client ID'
$secret = Read-Host 'Sandbox Client Secret'
$basic  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${id}:${secret}"))
$tok = (Invoke-RestMethod -Method Post -Uri 'https://api-m.sandbox.paypal.com/v1/oauth2/token' `
        -Headers @{ Authorization = "Basic $basic" } -Body 'grant_type=client_credentials' `
        -ContentType 'application/x-www-form-urlencoded').access_token
$o = Invoke-RestMethod -Uri 'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_ID' `
        -Headers @{ Authorization = "Bearer $tok" }
"Status: $($o.status)"
"Payee:  $($o.purchase_units[0].payee.email_address)"
```

`CREATED` means the client has not finished approving; `APPROVED` means the app will place the hold
on its next check; `COMPLETED` means the hold has been placed. The output includes the payer's
details when present, so do not paste it publicly.
