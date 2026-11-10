/**
 * HoldProof job lifecycle: Scope → Hold → Prove → Settle → Defend.
 * AI proposes and critiques; the Judge decides; the user confirms; PayPal confirms by read-back.
 */
import { APPROVAL_CANCEL_URL, APPROVAL_RETURN_URL } from '../config';
import { critiqueVerdict, draftDisputeResponse, proposeVerdict } from '../ai/agents';
import { buildCanonical, isHexDigest, shortDigest } from '../core/digest';
import { decideCapture, decideRefund, decideVoid } from '../core/judge';
import { fromCents, toCents } from '../core/money';
import { PayPalClient, approvalLink, describePayPalError, type PayPalDispute } from '../paypal/client';
import { loadCredentials } from '../storage/credentials';
import { getJob, saveJob, updateJob, withLog } from '../storage/jobs';
import { hashStoredPhoto, newId, readPhotoBase64, sha256 } from '../storage/photos';
import type { Criterion, Job, JudgeDecision, PhotoEvidence, RefusedCriterion, VerdictAttempt } from '../types';

let cached: { key: string; client: PayPalClient } | null = null;

async function requireCredentials() {
  const creds = await loadCredentials();
  if (!creds) throw new Error('Sandbox credentials are missing. Add them in Settings.');
  return creds;
}

export async function paypal(): Promise<PayPalClient> {
  const creds = await requireCredentials();
  const key = `${creds.paypalClientId}:${creds.paypalClientSecret}`;
  if (!cached || cached.key !== key) cached = { key, client: new PayPalClient(creds.paypalClientId, creds.paypalClientSecret) };
  return cached.client;
}

async function aiKey(): Promise<string> {
  return (await requireCredentials()).anthropicApiKey;
}

async function mustGet(id: string): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new Error('Job not found.');
  return job;
}

// ── Scope ────────────────────────────────────────────────────────────────────

export async function createJob(input: {
  title: string;
  description: string;
  amount: string;
  criteria: Criterion[];
  refused: RefusedCriterion[];
}): Promise<Job> {
  const job: Job = {
    id: newId(),
    createdAt: new Date().toISOString(),
    title: input.title,
    description: input.description,
    amount: fromCents(toCents(input.amount)),
    currency: 'USD',
    criteria: input.criteria,
    refused: input.refused,
    before: null,
    canonical: null,
    digest: null,
    orderId: null,
    approveUrl: null,
    authorizationId: null,
    authorizedAt: null,
    authorizationExpiresAt: null,
    captureId: null,
    capturedAt: null,
    refunds: [],
    paypalStatus: {},
    attempts: [],
    status: 'DRAFT',
    log: [],
  };
  return saveJob(withLog(job, 'ai', `Proposer scoped ${input.criteria.length} photo-checkable criteria; ${input.refused.length} refused.`));
}

// ── Anchor ───────────────────────────────────────────────────────────────────

export async function attachBeforePhoto(id: string, before: PhotoEvidence): Promise<Job> {
  const job = await mustGet(id);
  if (job.orderId) throw new Error('The BEFORE photo is locked once the PayPal order exists.');
  const canonical = buildCanonical({ title: job.title, amount: job.amount, currency: job.currency, criteria: job.criteria, before });
  const digest = await sha256(canonical);
  return saveJob(
    withLog({ ...job, before, canonical, digest, status: 'READY' }, 'user',
      `BEFORE photo captured. Evidence digest ${shortDigest(digest)} computed.`),
  );
}

// ── Hold ─────────────────────────────────────────────────────────────────────

export async function createHold(id: string): Promise<Job> {
  const job = await mustGet(id);
  if (job.orderId) return job;
  if (!job.digest || !isHexDigest(job.digest)) throw new Error('Evidence digest is missing.');
  const client = await paypal();
  const order = await client.createAuthorizeOrder({
    referenceId: job.id,
    customId: job.digest,
    description: `HoldProof ${shortDigest(job.digest)} · ${job.title}`,
    amount: job.amount,
    currency: job.currency,
    returnUrl: APPROVAL_RETURN_URL,
    cancelUrl: APPROVAL_CANCEL_URL,
    requestId: `hp-order-${job.id}`,
  });
  const url = approvalLink(order);
  if (!url) throw new Error('PayPal did not return an approval link.');
  return updateJob(id, (j) =>
    withLog({ ...j, orderId: order.id, approveUrl: url, status: 'AWAITING_APPROVAL', paypalStatus: { ...j.paypalStatus, order: order.status } },
      'paypal', `Order ${order.id} created (intent AUTHORIZE, ${j.amount} ${j.currency}). Status ${order.status}.`),
  );
}

/** Polls the order; once the client has approved, places the authorization hold. */
export async function syncHold(id: string): Promise<Job> {
  const job = await mustGet(id);
  if (!job.orderId || job.status !== 'AWAITING_APPROVAL') return job;
  const client = await paypal();
  const order = await client.getOrder(job.orderId);
  if (order.status !== job.paypalStatus.order) {
    await updateJob(id, (j) => withLog({ ...j, paypalStatus: { ...j.paypalStatus, order: order.status } }, 'paypal', `Order status ${order.status}.`));
  }
  if (order.status !== 'APPROVED') return mustGet(id);

  const authorized = await client.authorizeOrder(job.orderId, `hp-auth-${job.id}`);
  const auth = authorized.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error('PayPal did not return an authorization.');
  const readBack = await client.getAuthorization(auth.id);
  return updateJob(id, (j) =>
    withLog(
      {
        ...j,
        authorizationId: readBack.id,
        authorizedAt: new Date().toISOString(),
        authorizationExpiresAt: readBack.expiration_time ?? auth.expiration_time ?? null,
        status: readBack.status === 'CREATED' || readBack.status === 'PENDING' ? 'HELD' : j.status,
        paypalStatus: { ...j.paypalStatus, order: authorized.status, authorization: readBack.status },
      },
      'paypal',
      `Authorization ${readBack.id} placed: ${readBack.amount.value} ${readBack.amount.currency_code} held (status ${readBack.status}).`,
    ),
  );
}

export async function cancelUnapproved(id: string): Promise<Job> {
  return updateJob(id, (j) =>
    j.status === 'AWAITING_APPROVAL' ? withLog({ ...j, status: 'CANCELLED' }, 'user', 'Job cancelled before the client approved the hold.') : j,
  );
}

// ── Prove ────────────────────────────────────────────────────────────────────

export async function runVerdict(id: string, after: PhotoEvidence): Promise<VerdictAttempt> {
  const job = await mustGet(id);
  if (!job.before) throw new Error('BEFORE photo missing.');
  const key = await aiKey();
  const [beforeB64, afterB64] = await Promise.all([readPhotoBase64(job.before.fileName), readPhotoBase64(after.fileName)]);

  await updateJob(id, (j) => withLog(j, 'ai', 'Proposer is checking the AFTER photo against the criteria.'));
  const proposal = await proposeVerdict(key, job.criteria, beforeB64, afterB64);

  let critique: Awaited<ReturnType<typeof critiqueVerdict>> | null = null;
  if (proposal.ok) {
    await updateJob(id, (j) => withLog(j, 'ai', `Proposer: ${proposal.value.overall}. Critic is looking for reasons it is wrong.`));
    critique = await critiqueVerdict(key, job.criteria, beforeB64, afterB64, proposal.value);
  }

  const fresh = await mustGet(id);
  const decision = decideCapture({
    status: fresh.status,
    amount: fresh.amount,
    authorizationId: fresh.authorizationId,
    authorizationExpiresAt: fresh.authorizationExpiresAt,
    criteriaIds: fresh.criteria.map((c) => c.id),
    before: fresh.before,
    after,
    proposal: proposal.ok ? proposal.value : null,
    critique: critique?.ok ? critique.value : null,
    captureAmount: fresh.amount,
    now: new Date(),
  });

  const attempt: VerdictAttempt = {
    id: newId(),
    at: new Date().toISOString(),
    after,
    proposal: proposal.ok ? proposal.value : null,
    proposalError: proposal.ok ? null : proposal.error,
    critique: critique?.ok ? critique.value : null,
    critiqueError: critique === null ? (proposal.ok ? null : 'Not run: no valid proposal.') : critique.ok ? null : critique.error,
    decision,
    executed: false,
  };
  const failed = decision.checks.filter((c) => !c.ok).map((c) => c.label);
  await updateJob(id, (j) =>
    withLog({ ...j, attempts: [...j.attempts, attempt] }, 'judge',
      decision.allowed ? `Judge: all ${decision.checks.length} checks passed. Capture of ${j.amount} ${j.currency} permitted.`
        : `Judge: capture refused, no PayPal call. Failed: ${failed.join('; ')}.`),
  );
  return attempt;
}

// ── Settle ───────────────────────────────────────────────────────────────────

/** Executes a capture the Judge permitted. Re-runs the Judge on fresh state immediately before the call. */
export async function executeCapture(id: string, attemptId: string): Promise<Job> {
  const job = await mustGet(id);
  const attempt = job.attempts.find((a) => a.id === attemptId);
  if (!attempt) throw new Error('Verdict not found.');
  if (attempt.executed) return job;
  const decision = decideCapture({
    status: job.status,
    amount: job.amount,
    authorizationId: job.authorizationId,
    authorizationExpiresAt: job.authorizationExpiresAt,
    criteriaIds: job.criteria.map((c) => c.id),
    before: job.before,
    after: attempt.after,
    proposal: attempt.proposal,
    critique: attempt.critique,
    captureAmount: job.amount,
    now: new Date(),
  });
  if (!decision.allowed) throw new Error('The Judge no longer permits this capture.');

  const client = await paypal();
  const capture = await client.captureAuthorization(job.authorizationId!, job.amount, job.currency, `HP-${job.id.slice(0, 18)}`, `hp-capture-${job.id}`);
  const readBack = await client.getCapture(capture.id);
  return updateJob(id, (j) =>
    withLog(
      {
        ...j,
        captureId: readBack.id,
        capturedAt: new Date().toISOString(),
        status: readBack.status === 'COMPLETED' || readBack.status === 'PENDING' ? 'CAPTURED' : j.status,
        paypalStatus: { ...j.paypalStatus, capture: readBack.status, authorization: 'CAPTURED' },
        attempts: j.attempts.map((a) => (a.id === attemptId ? { ...a, executed: true } : a)),
      },
      'paypal',
      `Capture ${readBack.id} confirmed by PayPal: status ${readBack.status}${readBack.amount ? `, ${readBack.amount.value} ${readBack.amount.currency_code}` : ''}.`,
    ),
  );
}

export function refundDecision(job: Job, criterionId: string, amount: string): JudgeDecision {
  return decideRefund({
    status: job.status,
    captureId: job.captureId,
    amount: job.amount,
    criteriaIds: job.criteria.map((c) => c.id),
    criterionId,
    alreadyRefunded: job.refunds.map((r) => ({ criterionId: r.criterionId, amount: r.amount })),
    requested: amount,
  });
}

export async function executeRefund(id: string, criterionId: string, amount: string): Promise<Job> {
  const job = await mustGet(id);
  const decision = refundDecision(job, criterionId, amount);
  if (!decision.allowed) throw new Error(`Refund refused: ${decision.checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}`);
  const criterion = job.criteria.find((c) => c.id === criterionId)!;
  const client = await paypal();
  const refund = await client.refundCapture(job.captureId!, fromCents(toCents(amount)), job.currency,
    `Partial refund: "${criterion.text}" was contested on site.`, `hp-refund-${job.id}-${criterionId}`);
  const readBack = await client.getRefund(refund.id);
  const capture = await client.getCapture(job.captureId!);
  return updateJob(id, (j) =>
    withLog(
      {
        ...j,
        refunds: [...j.refunds, { id: readBack.id, criterionId, amount: fromCents(toCents(amount)), status: readBack.status, createdAt: new Date().toISOString() }],
        paypalStatus: { ...j.paypalStatus, capture: capture.status },
      },
      'paypal',
      `Refund ${readBack.id} of ${amount} ${j.currency} for ${criterionId}: status ${readBack.status}. Capture now ${capture.status}.`,
    ),
  );
}

export async function executeVoid(id: string): Promise<Job> {
  const job = await mustGet(id);
  const decision = decideVoid({ status: job.status, authorizationId: job.authorizationId, captureId: job.captureId });
  if (!decision.allowed) throw new Error('This hold cannot be voided.');
  const client = await paypal();
  await client.voidAuthorization(job.authorizationId!, `hp-void-${job.id}`);
  const readBack = await client.getAuthorization(job.authorizationId!);
  return updateJob(id, (j) =>
    withLog({ ...j, status: readBack.status === 'VOIDED' ? 'VOIDED' : j.status, paypalStatus: { ...j.paypalStatus, authorization: readBack.status } },
      'paypal', `Authorization ${readBack.id} voided: status ${readBack.status}. The hold is released to the client.`),
  );
}

/** Refreshes money state from PayPal (authoritative). */
export async function refreshFromPayPal(id: string): Promise<Job> {
  const job = await mustGet(id);
  if (job.status === 'AWAITING_APPROVAL') return syncHold(id);
  const client = await paypal();
  const status = { ...job.paypalStatus };
  if (job.authorizationId) status.authorization = (await client.getAuthorization(job.authorizationId)).status;
  if (job.captureId) status.capture = (await client.getCapture(job.captureId)).status;
  let next: Job['status'] = job.status;
  if (status.authorization === 'VOIDED' || status.authorization === 'EXPIRED') next = job.captureId ? job.status : 'VOIDED';
  return updateJob(id, (j) => ({ ...j, paypalStatus: status, status: next }));
}

// ── Defend ───────────────────────────────────────────────────────────────────

export interface VerifyResult {
  digestRecomputed: string;
  digestMatchesRecord: boolean;
  customIdFromPayPal: string | null;
  digestMatchesPayPal: boolean;
  beforePhotoHashMatches: boolean;
  orderStatus: string | null;
  checkedAt: string;
}

export async function verifyRecord(id: string): Promise<VerifyResult> {
  const job = await mustGet(id);
  if (!job.before || !job.digest || !job.orderId) throw new Error('This job has no anchored record yet.');
  const photoHash = await hashStoredPhoto(job.before.fileName);
  const canonical = buildCanonical({ title: job.title, amount: job.amount, currency: job.currency, criteria: job.criteria, before: job.before });
  const recomputed = await sha256(canonical);
  const order = await (await paypal()).getOrder(job.orderId);
  const customId = order.purchase_units?.[0]?.custom_id ?? null;
  const result: VerifyResult = {
    digestRecomputed: recomputed,
    digestMatchesRecord: recomputed === job.digest,
    customIdFromPayPal: customId,
    digestMatchesPayPal: customId === recomputed,
    beforePhotoHashMatches: photoHash === job.before.sha256,
    orderStatus: order.status,
    checkedAt: new Date().toISOString(),
  };
  const ok = result.digestMatchesPayPal && result.beforePhotoHashMatches;
  await updateJob(id, (j) => withLog(j, 'user', ok ? 'Record verified: digest matches the custom_id stored in PayPal.' : 'Record verification FAILED: the record does not match PayPal.'));
  return result;
}

export function buildRecord(job: Job): Record<string, unknown> {
  const passed = [...job.attempts].reverse().find((a) => a.executed) ?? job.attempts[job.attempts.length - 1] ?? null;
  return {
    app: 'HoldProof (PayPal Sandbox hackathon build)',
    job: { id: job.id, title: job.title, description: job.description, amount: job.amount, currency: job.currency },
    criteria: job.criteria.map((c) => ({ id: c.id, text: c.text })),
    refused_criteria: job.refused,
    evidence_digest: job.digest,
    canonical_record: job.canonical,
    before_photo: job.before,
    after_photo: passed?.after ?? null,
    paypal: {
      order_id: job.orderId,
      authorization_id: job.authorizationId,
      capture_id: job.captureId,
      refunds: job.refunds,
      last_known_status: job.paypalStatus,
    },
    verdict: passed
      ? { proposer: passed.proposal, critic: passed.critique, judge_checks: passed.decision.checks, executed: passed.executed }
      : null,
    timeline: job.log,
  };
}

export async function checkDisputes(id: string): Promise<PayPalDispute[]> {
  const job = await mustGet(id);
  if (!job.captureId) return [];
  const disputes = await (await paypal()).listDisputes(job.captureId);
  await updateJob(id, (j) => withLog(j, 'paypal', disputes.length ? `${disputes.length} dispute(s) found for capture ${j.captureId}.` : `No disputes for capture ${j.captureId}.`));
  return disputes;
}

export async function draftDispute(id: string, dispute: PayPalDispute) {
  const job = await mustGet(id);
  const summary = `Dispute ${dispute.dispute_id}, reason ${dispute.reason ?? 'unknown'}, status ${dispute.status}, stage ${dispute.dispute_life_cycle_stage ?? 'unknown'}.`;
  return draftDisputeResponse(await aiKey(), JSON.stringify(buildRecord(job)), summary);
}

export { describePayPalError };
