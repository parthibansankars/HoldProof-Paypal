# Agent workflow

HoldProof uses three roles at runtime. Two are AI model calls; the third is deterministic code.

| Role | Kind | Input | Output | Can move money? |
|---|---|---|---|---|
| **Proposer** | Model call (`claude-opus-5-5`, structured JSON output) | Job text (scope) or BEFORE + AFTER photos and criteria (verdict) | Criteria and refusals, or a per-criterion verdict with reasons | No |
| **Critic** | Separate model call with an adversarial prompt | The photos, the criteria, and only the Proposer's pass/fail flags (not its reasoning) | Objections (`different_scene`, `criterion_unmet`, `criterion_not_visible`, `not_photo_checkable`, `image_quality`, `other`) | No; it can only object |
| **Judge** | Deterministic TypeScript, unit tested | Job state, both agent outputs, photo metadata, amount | Allowed or refused, with every check shown | Permits a call; the worker confirms; PayPal executes |

## Sequence for one verdict

1. The worker captures the AFTER photo in the in-app camera (time, GPS, SHA-256 recorded).
2. The Proposer receives the BEFORE and AFTER images and the criteria and returns `same_scene`, a verdict for each criterion and an overall result.
3. If the Proposer's response is valid, the Critic receives the same images, the criteria and the proposed flags, and looks for reasons the verdict is wrong.
4. The Judge evaluates 11 checks. Any failure means no PayPal call.
5. If every check passes, the Verdict screen offers **Release**. On confirmation, the Judge is re-run on fresh state, then the app calls `capture`, then reads the capture back from PayPal.

## Failure handling

- **Refusal, truncation, invalid JSON or a schema mismatch** becomes an error for that agent, and the Judge's validity check fails.
- **Network errors and timeouts:** the SDK retries twice with a 120-second timeout; after that the result is an error, and the Judge fails closed.
- **Model fallback:** requests use the server-side fallback beta (`fallbacks: "default"`), so a policy decline can be retried on a fallback model inside the same call.
- **Cost control:** photos are resized to 1024 px JPEG before upload; effort is `medium` (`low` for the dispute check); the Critic runs only when the Proposer produced a valid verdict.

## Dispute drafting

The Proposer drafts a response using only the evidence record. The Critic then removes statements the record does not support. The worker sees what was removed, copies the draft and decides whether to send it. PayPal decides the dispute.
