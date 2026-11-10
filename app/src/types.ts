export type JobStatus =
  | 'DRAFT' // criteria agreed, no BEFORE photo yet
  | 'READY' // BEFORE photo taken, evidence digest computed, no PayPal order yet
  | 'AWAITING_APPROVAL' // PayPal order created, waiting for the client to approve
  | 'HELD' // PayPal authorization placed: money committed, not moved
  | 'CAPTURED' // money captured after a passing verdict
  | 'VOIDED' // authorization voided, hold released back to the client
  | 'CANCELLED'; // order never approved and abandoned

export interface Criterion {
  id: string;
  text: string;
  visibleEvidence: string;
}

export interface RefusedCriterion {
  text: string;
  reason: string;
}

export interface PhotoEvidence {
  fileName: string;
  sha256: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
}

export interface CriterionVerdict {
  id: string;
  pass: boolean;
  reason: string;
}

export interface Proposal {
  same_scene: boolean;
  same_scene_reason: string;
  criteria: CriterionVerdict[];
  overall: 'PASS' | 'FAIL';
  summary: string;
}

export type ObjectionKind =
  | 'different_scene'
  | 'criterion_not_visible'
  | 'criterion_unmet'
  | 'not_photo_checkable'
  | 'image_quality'
  | 'other';

export interface Objection {
  criterion_id: string;
  kind: ObjectionKind;
  detail: string;
}

export interface Critique {
  same_scene_confirmed: boolean;
  agree_with_proposal: boolean;
  objections: Objection[];
  summary: string;
}

export interface GuardCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface JudgeDecision {
  allowed: boolean;
  action: 'CAPTURE' | 'NONE';
  checks: GuardCheck[];
}

export interface VerdictAttempt {
  id: string;
  at: string;
  after: PhotoEvidence;
  proposal: Proposal | null;
  proposalError: string | null;
  critique: Critique | null;
  critiqueError: string | null;
  decision: JudgeDecision;
  executed: boolean;
}

export interface RefundRecord {
  id: string;
  criterionId: string;
  amount: string;
  status: string;
  createdAt: string;
}

export type LogKind = 'paypal' | 'ai' | 'judge' | 'user' | 'error';

export interface LogEntry {
  at: string;
  kind: LogKind;
  message: string;
}

export interface Job {
  id: string;
  createdAt: string;
  title: string;
  description: string;
  amount: string; // decimal string with two places, e.g. "60.00"
  currency: 'USD';
  criteria: Criterion[];
  refused: RefusedCriterion[];
  before: PhotoEvidence | null;
  canonical: string | null;
  digest: string | null;
  orderId: string | null;
  approveUrl: string | null;
  authorizationId: string | null;
  authorizedAt: string | null;
  authorizationExpiresAt: string | null;
  captureId: string | null;
  capturedAt: string | null;
  refunds: RefundRecord[];
  paypalStatus: { order?: string; authorization?: string; capture?: string };
  attempts: VerdictAttempt[];
  status: JobStatus;
  log: LogEntry[];
}

export interface Credentials {
  paypalClientId: string;
  paypalClientSecret: string;
  aiApiKey: string;
}
