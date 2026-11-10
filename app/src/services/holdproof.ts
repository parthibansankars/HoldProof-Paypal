/**
 * HoldProof job lifecycle: Scope → Hold → Prove → Settle → Defend.
 * AI proposes and critiques; the Judge decides; the user confirms; PayPal confirms by read-back.
 */
import { APPROVAL_CANCEL_URL, APPROVAL_RETURN_URL } from '../config';
import { critiqueVerdict, draftDisputeResponse, proposeVerdict } from '../ai/agents';
import { buildCanonical, isHexDigest, shortDigest } from '../core/digest';
import { decideCapture, decideRefund, decideVoid } from '../core/judge';
import { fromCents, toCents } from '../core/money';
import {
  PayPalClient,
  PayPalError,
  approvalLink,
  describePayPalError,
  type PayPalAuthorization,
  type PayPalDispute,
} from '../paypal/client';
import { loadCredentials } from '../storage/credentials';
import { getJob, saveJob, updateJob, withLog } from '../storage/jobs';
import { hashStoredPhoto, newId, readPhotoBase64, sha256 } from '../storage/photos';
import type { Criterion, Job, JudgeDecision, LogKind, PhotoEvidence, RefusedCriterion, VerdictAttempt } from '../types';

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

/** Drops the cached PayPal client (client ID, secret and access token) from memory. Call after keys change or are removed. */
export function resetPayPalClient(): void {
  cached = null;
}

const isNotFound = (e: unknown) => e instanceof PayPalError && e.status === 404;
const captureSucceeded = (status: string) => status === 'COMPLETED' || status === 'PENDING';
const refundCounts = (status: string) => status !== 'FAILED' && status !== 'CANCELLED';

async function aiKey(): Promise<string> {
  return (await requireCredentials()).aiApiKey;
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
  if (!job.before || job.before.lat === null || job.before.lng === null) {
    throw new Error('The BEFORE photo has no location. Retake it with location enabled before asking the client to approve.');
  }
  const client = await paypal();
  const order = await client.createAuthorizeOrder({
    referenceId: job.id,
    customId: job.digest,
    description: `HoldProof ${shortDigest(job.digest)} - ${job.title}`,
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

/** Marks a job that is still waiting for approval as CANCELLED, with a log entry. */
function cancelWaiting(id: string, kind: LogKind, message: string): Promise<Job> {
  return updateJob(id, (j) => (j.status === 'AWAITING_APPROVAL' ? withLog({ ...j, status: 'CANCELLED' }, kind, message) : j));
}

/**
 * Persists an authorization read back from PayPal. CREATED or PENDING means money is held (HELD);
 * DENIED, VOIDED or EXPIRED means nothing is held (CANCELLED). A job never stays AWAITING_APPROVAL
 * with an authorization stored.
 */
async function adoptAuthorization(id: string, orderStatus: string, readBack: PayPalAuthorization, fallbackExpiry?: string): Promise<Job> {
  const base = (j: Job): Job => ({
    ...j,
    authorizationId: readBack.id,
    authorizedAt: j.authorizedAt ?? new Date().toISOString(),
    authorizationExpiresAt: readBack.expiration_time ?? fallbackExpiry ?? null,
    paypalStatus: { ...j.paypalStatus, order: orderStatus, authorization: readBack.status },
  });
  if (readBack.status === 'DENIED' || readBack.status === 'VOIDED' || readBack.status === 'EXPIRED') {
    return updateJob(id, (j) =>
      j.status === 'AWAITING_APPROVAL'
        ? withLog({ ...base(j), status: 'CANCELLED' }, 'paypal', `Authorization ${readBack.id} is ${readBack.status}; no money is held.`)
        : j,
    );
  }
  // CREATED or PENDING: the hold is in place. CAPTURED / PARTIALLY_CAPTURED can only come from this app; they are
  // treated as HELD so that refreshFromPayPal can adopt the capture instead of leaving the job waiting.
  return updateJob(id, (j) =>
    j.status === 'AWAITING_APPROVAL'
      ? withLog({ ...base(j), status: 'HELD' }, 'paypal',
        `Authorization ${readBack.id} placed: ${readBack.amount.value} ${readBack.amount.currency_code} held (status ${readBack.status}).`)
      : j,
  );
}

/** Polls the order; once the client has approved, places the authorization hold. */
export async function syncHold(id: string): Promise<Job> {
  const job = await mustGet(id);
  if (!job.orderId || job.status !== 'AWAITING_APPROVAL') return job;
  const orderId = job.orderId;
  const client = await paypal();
  let order;
  try {
    order = await client.getOrder(orderId);
  } catch (e) {
    if (isNotFound(e)) {
      return cancelWaiting(id, 'paypal', `PayPal no longer has order ${orderId} (expired or removed). No money was held. Start a new job to ask again.`);
    }
    throw e;
  }
  const orderStatus = order.status;
  if (orderStatus !== job.paypalStatus.order) {
    await updateJob(id, (j) => withLog({ ...j, paypalStatus: { ...j.paypalStatus, order: orderStatus } }, 'paypal', `Order status ${orderStatus}.`));
  }

  if (orderStatus === 'VOIDED') {
    return cancelWaiting(id, 'paypal', `Order ${orderId} was voided by PayPal. No money was held.`);
  }

  if (orderStatus === 'COMPLETED') {
    // Authorized earlier but not saved (for example the app stopped between authorize and saving): adopt it.
    const existing = order.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!existing) throw new Error('PayPal reports the order as completed but returned no authorization.');
    const readBack = await client.getAuthorization(existing.id);
    return adoptAuthorization(id, orderStatus, readBack, existing.expiration_time);
  }

  if (orderStatus !== 'APPROVED') return mustGet(id);

  const authorized = await client.authorizeOrder(orderId, `hp-auth-${job.id}`);
  const auth = authorized.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error('PayPal did not return an authorization.');
  const readBack = await client.getAuthorization(auth.id);
  return adoptAuthorization(id, authorized.status, readBack, auth.expiration_time);
}

/**
 * Cancels a job whose order the client has not approved. Checks PayPal first, so an approval that
 * already happened is never abandoned with a live hold.
 */
export async function cancelUnapproved(id: string): Promise<Job> {
  const job = await mustGet(id);
  if (job.status !== 'AWAITING_APPROVAL') return job;
  if (job.orderId) {
    let synced: Job | null = null;
    try {
      synced = await syncHold(id);
    } catch (e) {
      if (!isNotFound(e)) throw e; // never cancel blind
    }
    if (synced?.status === 'HELD') throw new Error('The client has already approved. The hold is active; open the job to void it.');
    if (synced && synced.status !== 'AWAITING_APPROVAL') return synced;
  }
  return cancelWaiting(id, 'user', 'Job cancelled before the client approved the hold.');
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
  let captureId: string;
  try {
    // The attempt id is part of the idempotency key, so a new verdict after a failed capture is a new request.
    const capture = await client.captureAuthorization(job.authorizationId!, job.amount, job.currency, `HP-${job.id.slice(0, 18)}`,
      `hp-capture-${job.id}-${attemptId}`);
    captureId = capture.id;
  } catch (e) {
    if (e instanceof PayPalError && e.issue === 'AUTHORIZATION_ALREADY_CAPTURED') return adoptExistingCapture(id, attemptId);
    throw e;
  }
  const readBack = await client.getCapture(captureId);
  const authBack = await client.getAuthorization(job.authorizationId!);
  if (!captureSucceeded(readBack.status)) {
    return updateJob(id, (j) =>
      withLog({ ...j, paypalStatus: { ...j.paypalStatus, capture: readBack.status, authorization: authBack.status } },
        'error', `Capture ${readBack.id} returned ${readBack.status}; no money moved. The hold is unchanged.`),
    );
  }
  return updateJob(id, (j) =>
    withLog(
      {
        ...j,
        captureId: readBack.id,
        capturedAt: new Date().toISOString(),
        status: 'CAPTURED',
        paypalStatus: { ...j.paypalStatus, capture: readBack.status, authorization: authBack.status },
        attempts: j.attempts.map((a) => (a.id === attemptId ? { ...a, executed: true } : a)),
      },
      'paypal',
      `Capture ${readBack.id} confirmed by PayPal: status ${readBack.status}${readBack.amount ? `, ${readBack.amount.value} ${readBack.amount.currency_code}` : ''}.`,
    ),
  );
}

/**
 * The authorization is already captured at PayPal but the job has no capture stored (for example the app
 * stopped after the capture call). Finds the capture on the order, reads it back, and records it.
 */
async function adoptExistingCapture(id: string, attemptId: string | null): Promise<Job> {
  const job = await mustGet(id);
  if (!job.orderId || !job.authorizationId) throw new Error('This job has no PayPal hold.');
  const authorizationId = job.authorizationId;
  const client = await paypal();
  const order = await client.getOrder(job.orderId);
  const found = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!found) throw new Error('PayPal reports the hold as captured, but no capture was found on the order.');
  const readBack = await client.getCapture(found.id);
  const authBack = await client.getAuthorization(authorizationId);
  if (!captureSucceeded(readBack.status)) {
    return updateJob(id, (j) =>
      withLog({ ...j, paypalStatus: { ...j.paypalStatus, capture: readBack.status, authorization: authBack.status } },
        'error', `Capture ${readBack.id} found at PayPal with status ${readBack.status}; no money moved.`),
    );
  }
  return updateJob(id, (j) =>
    withLog(
      {
        ...j,
        captureId: readBack.id,
        capturedAt: j.capturedAt ?? new Date().toISOString(),
        status: 'CAPTURED',
        paypalStatus: { ...j.paypalStatus, order: order.status, capture: readBack.status, authorization: authBack.status },
        attempts: attemptId ? j.attempts.map((a) => (a.id === attemptId ? { ...a, executed: true } : a)) : j.attempts,
      },
      'paypal',
      `Capture ${readBack.id} found at PayPal and recorded: status ${readBack.status}.`,
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
    alreadyRefunded: job.refunds.map((r) => ({ criterionId: r.criterionId, amount: r.amount, status: r.status })),
    requested: amount,
  });
}

export async function executeRefund(id: string, criterionId: string, amount: string): Promise<Job> {
  const job = await mustGet(id);
  const decision = refundDecision(job, criterionId, amount);
  if (!decision.allowed) throw new Error(`Refund refused: ${decision.checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}`);
  const criterion = job.criteria.find((c) => c.id === criterionId)!;
  // Same request id for a plain retry (idempotent); a new suffix only after an earlier refund failed or was cancelled.
  const failedBefore = job.refunds.filter((r) => r.criterionId === criterionId && !refundCounts(r.status)).length;
  const requestId = `hp-refund-${job.id}-${criterionId}${failedBefore > 0 ? `-r${failedBefore}` : ''}`;
  const client = await paypal();
  const refund = await client.refundCapture(job.captureId!, fromCents(toCents(amount)), job.currency,
    `Partial refund: "${criterion.text}" was contested on site.`, requestId);
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
  const notes: string[] = [];
  if (job.authorizationId) status.authorization = (await client.getAuthorization(job.authorizationId)).status;

  if (job.status === 'HELD' && !job.captureId && (status.authorization === 'CAPTURED' || status.authorization === 'PARTIALLY_CAPTURED')) {
    return adoptExistingCapture(id, null);
  }

  if (job.captureId) status.capture = (await client.getCapture(job.captureId)).status;

  const refunds = await Promise.all(
    job.refunds.map(async (r) => {
      const fresh = (await client.getRefund(r.id)).status;
      if (fresh !== r.status) notes.push(`Refund ${r.id} is now ${fresh}.`);
      return { ...r, status: fresh };
    }),
  );

  let next: Job['status'] = job.status;
  // An EXPIRED hold is shown as VOIDED locally (money is back with the client); the log names the real status.
  if (job.status === 'HELD' && !job.captureId && (status.authorization === 'VOIDED' || status.authorization === 'EXPIRED')) next = 'VOIDED';
  if (status.authorization && status.authorization !== job.paypalStatus.authorization) {
    notes.push(`PayPal reports authorization ${job.authorizationId} as ${status.authorization}.`);
  }
  return updateJob(id, (j) => {
    let out: Job = { ...j, paypalStatus: status, status: next, refunds: j.refunds.map((r) => refunds.find((x) => x.id === r.id) ?? r) };
    for (const n of notes) out = withLog(out, 'paypal', n);
    return out;
  });
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
    photo_hash_method: 'SHA-256 over the base64 encoding of the stored JPEG file',
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
