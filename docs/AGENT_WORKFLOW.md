# Agent workflow

HoldProof uses three roles at runtime. Two are AI model calls; the third is deterministic code.

| Role | Kind | Input | Output | Can move money? |
|---|---|---|---|---|
| **Proposer** | Model call (Google Gemini `gemini-3.5-flash-lite`, structured JSON output) | Job text (scope) or BEFORE + AFTER photos and criteria (verdict) | Criteria and refusals, or a per-criterion verdict with reasons | No |
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
- **Blocked prompts and safety stops:** a `promptFeedback.blockReason`, or any finish reason other than `STOP`, is an error for that agent.
- **Network errors, rate limits and timeouts:** one retry after two seconds for network errors, HTTP 429 and 5xx, with a 120-second timeout per request; after that the result is an error, and the Judge fails closed.
- **Structured output:** the request uses the documented REST field `generationConfig.responseFormat.text.schema`; if the API rejects it as an unknown field, the transport retries with `responseMimeType` + `responseJsonSchema`, then with the schema in the instructions. Every answer is still validated with Zod.
- **Cost and quota control:** photos are resized to 1024 px JPEG before upload, and the Critic runs only when the Proposer produced a valid verdict. A free Gemini key is enough for demos.

## Dispute drafting

The Proposer drafts a response using only the evidence record. The Critic then removes statements the record does not support. The worker sees what was removed, copies the draft and, if they choose, submits it in the PayPal Resolution Center; HoldProof never submits it. PayPal decides the dispute.
