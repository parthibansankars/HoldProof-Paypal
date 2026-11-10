import { decideCapture, decideRefund, decideVoid, refundCapCents, type CaptureInput } from '../src/core/judge';
import type { Critique, PhotoEvidence, Proposal } from '../src/types';

const before: PhotoEvidence = { fileName: 'b.jpg', sha256: 'a'.repeat(64), capturedAt: '2026-11-10T10:00:00.000Z', lat: 12.97161, lng: 77.59456, accuracyMeters: 5 };
const after: PhotoEvidence = { fileName: 'a.jpg', sha256: 'b'.repeat(64), capturedAt: '2026-11-10T11:00:00.000Z', lat: 12.97165, lng: 77.5946, accuracyMeters: 5 };

const passProposal: Proposal = {
  same_scene: true,
  same_scene_reason: 'Same garage door and shelf.',
  criteria: [
    { id: 'c1', pass: true, reason: 'Floor is clear.' },
    { id: 'c2', pass: true, reason: 'Swept.' },
  ],
  overall: 'PASS',
  summary: 'Done.',
};
const cleanCritique: Critique = { same_scene_confirmed: true, agree_with_proposal: true, objections: [], summary: 'No objection.' };

function input(overrides: Partial<CaptureInput> = {}): CaptureInput {
  return {
    status: 'HELD',
    amount: '60.00',
    authorizationId: 'AUTH-1',
    authorizationExpiresAt: '2026-12-09T10:00:00Z',
    criteriaIds: ['c1', 'c2'],
    before,
    after,
    proposal: passProposal,
    critique: cleanCritique,
    captureAmount: '60.00',
    now: new Date('2026-11-10T11:05:00Z'),
    ...overrides,
  };
}

const failed = (d: ReturnType<typeof decideCapture>) => d.checks.filter((c) => !c.ok).map((c) => c.id);

describe('decideCapture', () => {
  it('permits capture only when every check passes', () => {
    const d = decideCapture(input());
    expect(d.allowed).toBe(true);
    expect(d.action).toBe('CAPTURE');
  });

  it('refuses a PASS verdict when the capture amount differs from the job', () => {
    const d = decideCapture(input({ captureAmount: '600.00' }));
    expect(d.allowed).toBe(false);
    expect(failed(d)).toEqual(['amount']);
  });

  it('fails closed when the Proposer response is missing', () => {
    const d = decideCapture(input({ proposal: null }));
    expect(d.allowed).toBe(false);
    expect(failed(d)).toContain('proposer-valid');
  });

  it('fails closed when the Critic response is missing', () => {
    const d = decideCapture(input({ critique: null }));
    expect(d.allowed).toBe(false);
    expect(failed(d)).toContain('critic-valid');
  });

  it('refuses when the Critic objects even though the Proposer passed', () => {
    const d = decideCapture(input({
      critique: { same_scene_confirmed: false, agree_with_proposal: false, objections: [{ criterion_id: 'scene', kind: 'different_scene', detail: 'Different wall.' }], summary: 'x' },
    }));
    expect(d.allowed).toBe(false);
    expect(failed(d)).toEqual(expect.arrayContaining(['critic-scene', 'critic-agree']));
  });

  it('refuses when a criterion was not assessed', () => {
    const d = decideCapture(input({ proposal: { ...passProposal, criteria: [passProposal.criteria[0]] } }));
    expect(d.allowed).toBe(false);
    expect(failed(d)).toEqual(expect.arrayContaining(['coverage', 'proposer-pass']));
  });

  it('refuses when a criterion failed even if overall says PASS', () => {
    const d = decideCapture(input({ proposal: { ...passProposal, criteria: [passProposal.criteria[0], { id: 'c2', pass: false, reason: 'Dusty.' }] } }));
    expect(d.allowed).toBe(false);
    expect(failed(d)).toContain('proposer-pass');
  });

  it('refuses when there is no active hold', () => {
    expect(decideCapture(input({ status: 'CAPTURED' })).allowed).toBe(false);
    expect(decideCapture(input({ authorizationId: null })).allowed).toBe(false);
  });

  it('refuses an expired authorization', () => {
    const d = decideCapture(input({ authorizationExpiresAt: '2026-11-10T11:00:00Z' }));
    expect(failed(d)).toEqual(['expiry']);
  });

  it('refuses when the AFTER photo predates the BEFORE photo', () => {
    const d = decideCapture(input({ after: { ...after, capturedAt: '2026-11-10T09:00:00.000Z' } }));
    expect(failed(d)).toEqual(['time']);
  });

  it('refuses when the photos are far apart or location is missing', () => {
    expect(failed(decideCapture(input({ after: { ...after, lat: 13.0, lng: 77.6 } })))).toEqual(['location']);
    expect(failed(decideCapture(input({ after: { ...after, lat: null, lng: null } })))).toEqual(['location']);
  });

  it('treats a malformed amount as a failed check, not a crash', () => {
    const d = decideCapture(input({ captureAmount: '60.001' }));
    expect(d.allowed).toBe(false);
    expect(failed(d)).toEqual(['amount']);
  });
});

describe('decideRefund', () => {
  const base = { status: 'CAPTURED' as const, captureId: 'CAP-1', amount: '60.00', criteriaIds: ['c1', 'c2', 'c3'], criterionId: 'c2', alreadyRefunded: [], requested: '20.00' };

  it('caps a refund at an equal share of the job', () => {
    expect(refundCapCents('60.00', 3)).toBe(2000);
    expect(decideRefund(base).allowed).toBe(true);
    expect(decideRefund({ ...base, requested: '20.01' }).allowed).toBe(false);
  });

  it('allows only one refund per criterion', () => {
    expect(decideRefund({ ...base, alreadyRefunded: [{ criterionId: 'c2', amount: '5.00' }] }).allowed).toBe(false);
  });

  it('refuses unknown criteria, zero amounts and uncaptured jobs', () => {
    expect(decideRefund({ ...base, criterionId: 'c9' }).allowed).toBe(false);
    expect(decideRefund({ ...base, requested: '0.00' }).allowed).toBe(false);
    expect(decideRefund({ ...base, status: 'HELD', captureId: null }).allowed).toBe(false);
  });
});

describe('decideVoid', () => {
  it('voids only an active, uncaptured hold', () => {
    expect(decideVoid({ status: 'HELD', authorizationId: 'A', captureId: null }).allowed).toBe(true);
    expect(decideVoid({ status: 'CAPTURED', authorizationId: 'A', captureId: 'C' }).allowed).toBe(false);
    expect(decideVoid({ status: 'AWAITING_APPROVAL', authorizationId: null, captureId: null }).allowed).toBe(false);
  });
});
