import { z } from 'zod';

/** JSON Schemas sent to the model (structured outputs) and Zod mirrors used to validate the reply. */

export const scopeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'criteria', 'refused'],
  properties: {
    title: { type: 'string', description: 'Short job title, at most 60 characters.' },
    criteria: {
      type: 'array',
      description: 'Two to four acceptance criteria that a photograph can verify.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'visible_evidence'],
        properties: {
          text: { type: 'string' },
          visible_evidence: { type: 'string', description: 'What must be visible in the AFTER photo.' },
        },
      },
    },
    refused: {
      type: 'array',
      description: 'Requirements from the description that a photograph cannot verify.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'reason'],
        properties: { text: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
} as const;

export const ScopeSchema = z.object({
  title: z.string().min(1).max(120),
  criteria: z.array(z.object({ text: z.string().min(3), visible_evidence: z.string().min(3) })).min(1).max(6),
  refused: z.array(z.object({ text: z.string(), reason: z.string() })),
});
export type ScopeResult = z.infer<typeof ScopeSchema>;

export const proposalJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['same_scene', 'same_scene_reason', 'criteria', 'overall', 'summary'],
  properties: {
    same_scene: { type: 'boolean' },
    same_scene_reason: { type: 'string' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'pass', 'reason'],
        properties: { id: { type: 'string' }, pass: { type: 'boolean' }, reason: { type: 'string' } },
      },
    },
    overall: { type: 'string', enum: ['PASS', 'FAIL'] },
    summary: { type: 'string' },
  },
} as const;

export const ProposalSchema = z.object({
  same_scene: z.boolean(),
  same_scene_reason: z.string(),
  criteria: z.array(z.object({ id: z.string(), pass: z.boolean(), reason: z.string() })),
  overall: z.enum(['PASS', 'FAIL']),
  summary: z.string(),
});

export const critiqueJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['same_scene_confirmed', 'agree_with_proposal', 'objections', 'summary'],
  properties: {
    same_scene_confirmed: { type: 'boolean' },
    agree_with_proposal: { type: 'boolean' },
    objections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion_id', 'kind', 'detail'],
        properties: {
          criterion_id: { type: 'string', description: 'Criterion id, or "scene" for the whole photo.' },
          kind: {
            type: 'string',
            enum: ['different_scene', 'criterion_not_visible', 'criterion_unmet', 'not_photo_checkable', 'image_quality', 'other'],
          },
          detail: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
} as const;

export const CritiqueSchema = z.object({
  same_scene_confirmed: z.boolean(),
  agree_with_proposal: z.boolean(),
  objections: z.array(
    z.object({
      criterion_id: z.string(),
      kind: z.enum(['different_scene', 'criterion_not_visible', 'criterion_unmet', 'not_photo_checkable', 'image_quality', 'other']),
      detail: z.string(),
    }),
  ),
  summary: z.string(),
});

export const disputeDraftJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['response_text', 'facts_used'],
  properties: {
    response_text: { type: 'string' },
    facts_used: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const DisputeDraftSchema = z.object({ response_text: z.string().min(1), facts_used: z.array(z.string()) });

export const disputeCheckJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['unsupported_statements', 'cleaned_text'],
  properties: {
    unsupported_statements: { type: 'array', items: { type: 'string' } },
    cleaned_text: { type: 'string' },
  },
} as const;

export const DisputeCheckSchema = z.object({ unsupported_statements: z.array(z.string()), cleaned_text: z.string().min(1) });
