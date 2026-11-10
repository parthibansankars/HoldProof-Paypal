/**
 * The Judge: deterministic, model-free code. It is the ONLY component allowed to
 * authorise a PayPal money call. AI agents propose and critique; the Judge decides.
 * Every rule fails closed: anything missing, malformed or contradictory means no call.
 */
import type { Critique, GuardCheck, JobStatus, JudgeDecision, PhotoEvidence, Proposal } from '../types';
import { distanceMeters } from './geo';
import { toCents } from './money';

export const MAX_SCENE_DISTANCE_METERS = 150;
export const AUTHORIZATION_HONOR_DAYS = 3;

export interface CaptureInput {
  status: JobStatus;
  amount: string;
  authorizationId: string | null;
  authorizationExpiresAt: string | null;
  criteriaIds: string[];
  before: PhotoEvidence | null;
  after: PhotoEvidence | null;
  proposal: Proposal | null;
  critique: Critique | null;
  captureAmount: string;
  now: Date;
}

function check(id: string, label: string, ok: boolean, detail: string): GuardCheck {
  return { id, label, ok, detail };
}

export function decideCapture(input: CaptureInput): JudgeDecision {
  const checks: GuardCheck[] = [];
  const { proposal, critique } = input;

  checks.push(
    check('hold', 'PayPal hold is active', input.status === 'HELD' && !!input.authorizationId,
      input.status === 'HELD' ? `Authorization ${input.authorizationId ?? 'missing'}` : `Job status is ${input.status}`),
  );

  const notExpired = !input.authorizationExpiresAt || new Date(input.authorizationExpiresAt) > input.now;
  checks.push(check('expiry', 'Authorization has not expired', notExpired,
    input.authorizationExpiresAt ? `Expires ${input.authorizationExpiresAt}` : 'No expiry reported by PayPal'));

  checks.push(check('proposer-valid', 'Proposer response is valid', proposal !== null,
    proposal ? 'Matched the required schema' : 'Missing or invalid response'));
  checks.push(check('critic-valid', 'Critic response is valid', critique !== null,
    critique ? 'Matched the required schema' : 'Missing or invalid response'));

  if (proposal) {
    const byId = new Map(proposal.criteria.map((c) => [c.id, c]));
    const missing = input.criteriaIds.filter((id) => !byId.has(id));
    const failed = input.criteriaIds.filter((id) => byId.get(id)?.pass === false);
    checks.push(check('coverage', 'Every agreed criterion was assessed', missing.length === 0,
      missing.length ? `Not assessed: ${missing.join(', ')}` : `${input.criteriaIds.length} of ${input.criteriaIds.length} assessed`));
    checks.push(check('proposer-pass', 'Proposer passed every criterion', proposal.overall === 'PASS' && failed.length === 0 && missing.length === 0,
      failed.length ? `Failed: ${failed.join(', ')}` : `Overall ${proposal.overall}`));
    checks.push(check('scene', 'Proposer confirmed the same scene', proposal.same_scene, proposal.same_scene_reason));
  }

  if (critique) {
    checks.push(check('critic-scene', 'Critic confirmed the same scene', critique.same_scene_confirmed,
      critique.same_scene_confirmed ? 'Same scene confirmed' : 'Critic disputes the scene'));
    checks.push(check('critic-agree', 'Critic raised no objection', critique.agree_with_proposal && critique.objections.length === 0,
      critique.objections.length ? critique.objections.map((o) => `${o.criterion_id}: ${o.kind}`).join('; ') : 'No objection'));
  }

  let amountOk = false;
  let amountDetail = '';
  try {
    amountOk = toCents(input.captureAmount) === toCents(input.amount);
    amountDetail = `Capture ${input.captureAmount} ${amountOk ? '=' : '≠'} job ${input.amount}`;
  } catch (e) {
    amountDetail = (e as Error).message;
  }
  checks.push(check('amount', 'Capture amount equals the agreed amount', amountOk, amountDetail));

  const { before, after } = input;
  const timeOk = !!before && !!after && new Date(after.capturedAt) > new Date(before.capturedAt);
  checks.push(check('time', 'AFTER photo was taken after the BEFORE photo', timeOk,
    before && after ? `${before.capturedAt} → ${after.capturedAt}` : 'Photo evidence missing'));

  const hasGeo = !!before && !!after && before.lat !== null && before.lng !== null && after.lat !== null && after.lng !== null;
  const dist = hasGeo ? distanceMeters(before!.lat!, before!.lng!, after!.lat!, after!.lng!) : Number.POSITIVE_INFINITY;
  checks.push(check('location', `Both photos within ${MAX_SCENE_DISTANCE_METERS} m`, hasGeo && dist <= MAX_SCENE_DISTANCE_METERS,
    hasGeo ? `${Math.round(dist)} m apart` : 'Location missing on one or both photos'));

  const allowed = checks.every((c) => c.ok);
  return { allowed, action: allowed ? 'CAPTURE' : 'NONE', checks };
}

export interface RefundInput {
  status: JobStatus;
  captureId: string | null;
  amount: string;
  criteriaIds: string[];
  criterionId: string;
  /** Refunds recorded so far. Entries with status FAILED or CANCELLED moved no money and are ignored. */
  alreadyRefunded: { criterionId: string; amount: string; status?: string }[];
  requested: string;
}

/** A refund that PayPal reports as FAILED or CANCELLED moved no money. */
function refundMovedMoney(r: { status?: string }): boolean {
  return r.status !== 'FAILED' && r.status !== 'CANCELLED';
}

/** Cap for one contested criterion: an equal share of the job amount. */
export function refundCapCents(amount: string, criteriaCount: number): number {
  if (criteriaCount <= 0) return 0;
  return Math.floor(toCents(amount) / criteriaCount);
}

export function decideRefund(input: RefundInput): JudgeDecision {
  const checks: GuardCheck[] = [];
  checks.push(check('captured', 'Payment was captured', input.status === 'CAPTURED' && !!input.captureId,
    input.captureId ? `Capture ${input.captureId}` : `Job status is ${input.status}`));
  checks.push(check('criterion', 'Contested criterion is part of the agreement', input.criteriaIds.includes(input.criterionId),
    input.criterionId));
  const effective = input.alreadyRefunded.filter(refundMovedMoney);
  const repeat = effective.some((r) => r.criterionId === input.criterionId);
  checks.push(check('once', 'Criterion has not been refunded before', !repeat, repeat ? 'Already refunded' : 'First refund for this criterion'));

  let requestedCents = -1;
  try { requestedCents = toCents(input.requested); } catch { /* stays invalid */ }
  const cap = refundCapCents(input.amount, input.criteriaIds.length);
  checks.push(check('cap', 'Refund is within the per-criterion cap', requestedCents > 0 && requestedCents <= cap,
    `Requested ${input.requested}, cap ${(cap / 100).toFixed(2)}`));

  const refundedCents = effective.reduce((s, r) => s + toCents(r.amount), 0);
  const remaining = toCents(input.amount) - refundedCents;
  checks.push(check('remaining', 'Refund does not exceed the remaining captured amount', requestedCents > 0 && requestedCents <= remaining,
    `Remaining ${(remaining / 100).toFixed(2)}`));

  const allowed = checks.every((c) => c.ok);
  return { allowed, action: 'NONE', checks };
}

export function decideVoid(input: { status: JobStatus; authorizationId: string | null; captureId: string | null }): JudgeDecision {
  const checks = [
    check('held', 'PayPal hold is active', input.status === 'HELD' && !!input.authorizationId, `Job status is ${input.status}`),
    check('not-captured', 'Nothing has been captured', !input.captureId, input.captureId ? 'Already captured' : 'No capture'),
  ];
  return { allowed: checks.every((c) => c.ok), action: 'NONE', checks };
}
