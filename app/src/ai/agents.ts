/**
 * Runtime agents. The Proposer and the Critic are independent model calls with fixed JSON schemas.
 * Neither can move money: their output goes to the deterministic Judge (src/core/judge.ts).
 * Any refusal, schema failure or network failure returns an error instead of a verdict (fail closed).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { AI_MODEL } from '../config';
import type { Criterion, Critique, Proposal } from '../types';
import {
  CritiqueSchema,
  DisputeCheckSchema,
  DisputeDraftSchema,
  ProposalSchema,
  ScopeSchema,
  critiqueJsonSchema,
  disputeCheckJsonSchema,
  disputeDraftJsonSchema,
  proposalJsonSchema,
  scopeJsonSchema,
  type ScopeResult,
} from './schemas';

export type AgentResult<T> = { ok: true; value: T } | { ok: false; error: string };

function makeClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    // React Native is not a browser, but the SDK's environment check can misdetect it.
    // The key is user-entered and stored in the device keystore (sandbox hackathon build).
    dangerouslyAllowBrowser: true,
    timeout: 120_000,
    maxRetries: 2,
  });
}

type ImageInput = { base64: string; label: string };

async function callStructured<T>(
  apiKey: string,
  opts: {
    system: string;
    text: string;
    images?: ImageInput[];
    schema: Record<string, unknown>;
    validator: ZodType<T>;
    effort: 'low' | 'medium' | 'high';
    maxTokens?: number;
  },
): Promise<AgentResult<T>> {
  try {
    const client = makeClient(apiKey);
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const img of opts.images ?? []) {
      content.push({ type: 'text', text: img.label });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.base64 } });
    }
    content.push({ type: 'text', text: opts.text });

    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: opts.system,
      output_config: { effort: opts.effort, format: { type: 'json_schema', schema: opts.schema } },
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      return { ok: false, error: 'The AI model declined this request.' };
    }
    if (response.stop_reason === 'max_tokens') {
      return { ok: false, error: 'The AI response was cut off before it finished.' };
    }
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    if (!text) return { ok: false, error: 'The AI model returned no answer.' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'The AI answer was not valid JSON.' };
    }
    const result = opts.validator.safeParse(parsed);
    if (!result.success) return { ok: false, error: 'The AI answer did not match the required schema.' };
    return { ok: true, value: result.data };
  } catch (e) {
    return { ok: false, error: describeAiError(e) };
  }
}

export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The AI API key was rejected.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'The AI API key does not have access to this model.';
  if (e instanceof Anthropic.RateLimitError) return 'The AI provider is rate limiting requests. Try again shortly.';
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'The AI request timed out.';
  if (e instanceof Anthropic.APIConnectionError) return 'The AI provider could not be reached. Check the connection.';
  if (e instanceof Anthropic.APIError) return `AI provider error ${e.status ?? ''}: ${e.message}`.trim();
  return (e as Error)?.message ?? 'Unknown AI error';
}

/** Checks that the key works without spending tokens on a generation. */
export async function testAiKey(apiKey: string): Promise<AgentResult<string>> {
  try {
    const model = await makeClient(apiKey).models.retrieve(AI_MODEL);
    return { ok: true, value: model.display_name ?? model.id };
  } catch (e) {
    return { ok: false, error: describeAiError(e) };
  }
}

const SCOPE_SYSTEM = `You are the Proposer agent in HoldProof, a payment app for solo service workers.
A worker describes a small in-person job. Turn it into acceptance criteria that can be verified ONLY by comparing a BEFORE photo and an AFTER photo of the same place.
Rules:
- Return two to four criteria. Each must describe a visible end state (for example "No boxes remain on the floor of the marked corner").
- Refuse anything a photo cannot prove: quality judgements, durability, hidden work, smell, noise, time spent, customer satisfaction, price. List each refused requirement with a one-line reason.
- Keep each criterion under 120 characters, concrete and testable. No marketing language.`;

export function scopeJob(apiKey: string, description: string, amount: string): Promise<AgentResult<ScopeResult>> {
  return callStructured(apiKey, {
    system: SCOPE_SYSTEM,
    text: `Job description from the worker:\n"""${description}"""\nAgreed price: ${amount} USD.`,
    schema: scopeJsonSchema as unknown as Record<string, unknown>,
    validator: ScopeSchema,
    effort: 'medium',
  });
}

function criteriaBlock(criteria: Criterion[]): string {
  return criteria.map((c) => `${c.id}: ${c.text} (must be visible: ${c.visibleEvidence})`).join('\n');
}

const PROPOSER_SYSTEM = `You are the Proposer agent in HoldProof. You receive a BEFORE photo, an AFTER photo and the agreed acceptance criteria for a job.
Decide, from the photos only:
1. same_scene: is the AFTER photo of the same place as the BEFORE photo? Look at fixed features (walls, floor, fixtures, windows, permanent objects). If unsure, answer false.
2. For every criterion id, pass or fail, with a one-line reason that names what you can see.
3. overall is PASS only if same_scene is true and every criterion passes.
Do not assume work that is not visible. A criterion that cannot be seen in the AFTER photo fails.`;

export function proposeVerdict(
  apiKey: string,
  criteria: Criterion[],
  beforeBase64: string,
  afterBase64: string,
): Promise<AgentResult<Proposal>> {
  return callStructured(apiKey, {
    system: PROPOSER_SYSTEM,
    images: [
      { base64: beforeBase64, label: 'BEFORE photo (taken before work started):' },
      { base64: afterBase64, label: 'AFTER photo (submitted as proof of completion):' },
    ],
    text: `Agreed acceptance criteria:\n${criteriaBlock(criteria)}\n\nReturn your verdict for every criterion id listed above.`,
    schema: proposalJsonSchema as unknown as Record<string, unknown>,
    validator: ProposalSchema,
    effort: 'medium',
  });
}

const CRITIC_SYSTEM = `You are the Critic agent in HoldProof. Another agent has proposed a verdict on whether a job was completed. Money is released only if you raise no objection, so your job is to find reasons the proposal is WRONG.
Check independently, from the photos:
- Is the AFTER photo really the same place as the BEFORE photo? Reused, cropped, different-room or stock-looking photos are a "different_scene" objection.
- For each criterion the proposal passed: is it actually visible and met? If not, object with "criterion_unmet" or "criterion_not_visible".
- Is any criterion not checkable by photo? Object with "not_photo_checkable".
- Is the image too dark, blurred or obstructed to judge? Object with "image_quality".
You may only object or agree. You can never turn a failed criterion into a pass. If you are uncertain, object.
agree_with_proposal is true only if you have zero objections.`;

export function critiqueVerdict(
  apiKey: string,
  criteria: Criterion[],
  beforeBase64: string,
  afterBase64: string,
  proposal: Proposal,
): Promise<AgentResult<Critique>> {
  // The Critic sees the proposed verdict flags, not the Proposer's reasoning, to keep the check independent.
  const flags = proposal.criteria.map((c) => `${c.id}: ${c.pass ? 'PASS' : 'FAIL'}`).join('\n');
  return callStructured(apiKey, {
    system: CRITIC_SYSTEM,
    images: [
      { base64: beforeBase64, label: 'BEFORE photo:' },
      { base64: afterBase64, label: 'AFTER photo:' },
    ],
    text:
      `Agreed acceptance criteria:\n${criteriaBlock(criteria)}\n\n` +
      `Proposed verdict:\nsame_scene: ${proposal.same_scene ? 'YES' : 'NO'}\n${flags}\noverall: ${proposal.overall}\n\n` +
      'Look for reasons this verdict is wrong.',
    schema: critiqueJsonSchema as unknown as Record<string, unknown>,
    validator: CritiqueSchema,
    effort: 'medium',
  });
}

const DISPUTE_DRAFT_SYSTEM = `You are the Proposer agent in HoldProof, drafting a seller's response to a PayPal dispute.
Use ONLY facts present in the evidence record provided. Do not invent facts, promises, quotes or legal claims.
Write in plain, polite, factual English, under 250 words. State that PayPal makes the final decision.
List every fact you used in facts_used.`;

const DISPUTE_CHECK_SYSTEM = `You are the Critic agent in HoldProof. You receive an evidence record and a draft dispute response.
Remove every statement that the evidence record does not support. Return the removed statements and the cleaned text.
Do not add new content.`;

export async function draftDisputeResponse(
  apiKey: string,
  recordJson: string,
  disputeSummary: string,
): Promise<AgentResult<{ text: string; removed: string[] }>> {
  const draft = await callStructured(apiKey, {
    system: DISPUTE_DRAFT_SYSTEM,
    text: `Dispute: ${disputeSummary}\n\nEvidence record (JSON):\n${recordJson}`,
    schema: disputeDraftJsonSchema as unknown as Record<string, unknown>,
    validator: DisputeDraftSchema,
    effort: 'medium',
  });
  if (!draft.ok) return draft;
  const checked = await callStructured(apiKey, {
    system: DISPUTE_CHECK_SYSTEM,
    text: `Evidence record (JSON):\n${recordJson}\n\nDraft response:\n"""${draft.value.response_text}"""`,
    schema: disputeCheckJsonSchema as unknown as Record<string, unknown>,
    validator: DisputeCheckSchema,
    effort: 'low',
  });
  if (!checked.ok) return checked;
  return { ok: true, value: { text: checked.value.cleaned_text, removed: checked.value.unsupported_statements } };
}
