## Inspiration

A solo worker standing at a stranger's door faces the same question every time: will this person pay when the job is done? The client faces the mirror question: will this stranger do the work if I pay first? Today one side always carries the risk. When something goes wrong, the argument that follows is built from memory, a few phone photos and a chat history.

We wanted the money and the proof to live in the same place. PayPal already offers a way to commit money without moving it: an **authorization hold**. We asked what would happen if the hold were placed before the work started, and released only when the evidence showed that the agreed work was done.

## What it does

HoldProof runs one loop on one Android phone:

1. **Scope.** The worker describes the job. AI turns it into two to four criteria that a photograph can check, and refuses criteria it cannot check, such as "good quality".
2. **Hold.** The worker takes a BEFORE photo with the in-app camera. HoldProof places a PayPal hold for the job amount, and the client approves it in their own PayPal account by scanning a QR code. The worker sees **HELD** before starting.
3. **Prove.** The worker takes an AFTER photo. Two AI agents compare it with the BEFORE photo and the agreed criteria.
4. **Settle.** Deterministic code captures the payment on a pass, issues a capped partial refund if the client contests a criterion on site, or releases the hold if the job is abandoned. A failed check makes no PayPal call.
5. **Defend.** The evidence record can be verified against PayPal at any time, exported as a PDF, and used to draft a response if a dispute is opened.

## How we built it

**Choosing the problem.** We ran three AI agents against each other before writing code. An *Innovator* proposed real-world problems and solutions, a *Devil's Advocate* tried to destroy each one, and a *Grand Judge* scored the survivors on the five judging criteria. Over three rounds, ten ideas were rejected or merged, among them invoice-fraud checks, dispute builders, collections agents and negotiating sales agents. HoldProof survived because PayPal money movement *is* the product, not a checkout button added at the end.

**No backend.** The app calls the PayPal Sandbox REST APIs directly. Every money state comes from PayPal, and the app confirms it by polling PayPal's own status endpoints, which give authoritative answers:

| Step | PayPal Sandbox API |
|---|---|
| Hold | `POST /v2/checkout/orders` (intent `AUTHORIZE`), `POST /v2/checkout/orders/{id}/authorize` |
| Release on pass | `POST /v2/payments/authorizations/{id}/capture` |
| Abandoned job | `POST /v2/payments/authorizations/{id}/void` |
| Contested criterion | `POST /v2/payments/captures/{id}/refund` |
| Status | `GET` on orders, authorizations, captures and refunds |
| Dispute | `GET /v1/customer/disputes` |

**PayPal as the evidence anchor.** Before the client approves, HoldProof computes a digest of the agreement and the BEFORE photo:

$$
d = \operatorname{SHA\text{-}256}\big(\,c \;\|\; h_{\text{before}} \;\|\; t \;\|\; g\,\big)
$$

where $c$ is the criteria text, $h_{\text{before}}$ is the hash of the BEFORE photo, $t$ is the capture time and $g$ is the GPS position. The digest is written into the order's `custom_id`, and a prefix is shown to the client before approval. Once the order is authorized, the record is anchored inside PayPal: changing the criteria or the photo afterwards produces a different $d$, and the **Verify record** screen exposes the mismatch.

**Three agents at runtime.** The AI never moves money on its own:

- the **Proposer** (a model call) proposes a verdict for each criterion;
- the **Critic** (an independent model call) looks for reasons the verdict is wrong. It can downgrade a verdict, never upgrade one;
- the **Judge** (deterministic, unit-tested code) is the only component allowed to call PayPal.

The Judge releases money only when every condition holds:

$$
\text{capture} \iff P_{\text{pass}} \,\wedge\, \neg C_{\text{object}} \,\wedge\, S_{\text{valid}} \,\wedge\, (a_{\text{capture}} = a_{\text{job}})
$$

where $P_{\text{pass}}$ means the Proposer passed every criterion, $C_{\text{object}}$ means the Critic objected, $S_{\text{valid}}$ means both responses matched the schema, and $a$ is the amount. Disagreement, a timeout or a mismatch fails closed: no PayPal call, and the worker is asked to retake the photo.

**Stack.** Android app in React Native 0.88 with Expo SDK 58 and TypeScript. PayPal Sandbox REST APIs called directly (Orders v2, Payments v2, Disputes v1). Claude (`claude-opus-5-5`) through the Anthropic TypeScript SDK with JSON-schema structured output, validated again with Zod. Expo Camera, Location, Crypto (SHA-256), Secure Store (Android Keystore), SQLite, Print (PDF) and Sharing; `react-native-qrcode-svg` for the approval QR code. Jest for the Judge, money, digest and PayPal client tests. Every dependency uses the MIT or Apache 2.0 licence.

## Challenges we faced

- **Building without a server.** Without a server there are no webhooks, no shared database and nowhere to keep a secret. We redesigned the product so that one phone, acting as one PayPal sandbox business account, completes the whole loop, and so that PayPal itself stores the evidence anchor.
- **Credentials on a device.** The app asks for sandbox credentials on first launch and keeps them only in Android encrypted storage. Credentials never ship in the APK or the repository, and the app works only against the sandbox. The README describes the production design, in which our own backend holds the secret and receives signature-verified webhooks.
- **Trusting the AI with money.** A single model can be confidently wrong. Splitting the decision between a Proposer, a Critic and a deterministic Judge made the failure mode "no payment" instead of "wrong payment".
- **Stating limits honestly.** HoldProof proves that the record was not changed after approval. It does not prove that the photos are truthful, and it does not judge workmanship. It is an authorization hold with AI evidence checking, not escrow.
- [Fill in after the build: problems found during PayPal sandbox testing and on the device.]

## What we learned

- An authorization hold is an underused trust tool: the worker sees money committed before starting, and the client keeps it until the evidence arrives.
- Making AI agents argue is as useful for choosing a product as for running one. The Devil's Advocate rejected most early ideas for reasons we would otherwise have discovered only during the demo.
- Fields that the payer approves, such as `custom_id`, can carry a commitment, so the payment rail doubles as a tamper-evidence store without a blockchain or a server.
- [Fill in after the build: what PayPal sandbox testing taught us.]

## What's next

- Move the PayPal and AI calls behind our own backend for production, with webhooks and server-side amount checks.
- Support jobs with several milestones and give the client a full in-app view.
- Pilot with a small group of solo service workers.

> HoldProof was built for the PayPal AI Hackathon 2026 and runs only against PayPal Sandbox.
