/**
 * Money-path tests for src/services/holdproof.ts with storage, AI and the PayPal client mocked.
 * No network and no Expo native modules are used.
 */
import type { Job, VerdictAttempt } from '../src/types';

const mockStore = new Map<string, Job>();
const mockPayPal = {
  getOrder: jest.fn(),
  authorizeOrder: jest.fn(),
  getAuthorization: jest.fn(),
  captureAuthorization: jest.fn(),
  getCapture: jest.fn(),
  getRefund: jest.fn(),
  createAuthorizeOrder: jest.fn(),
};

jest.mock('../src/storage/credentials', () => ({
  loadCredentials: async () => ({ paypalClientId: 'client-id-123', paypalClientSecret: 'client-secret-123', anthropicApiKey: 'sk-ant-test-123' }),
}));

jest.mock('../src/storage/jobs', () => {
  const withLog = (job: Job, kind: string, message: string): Job => ({ ...job, log: [...job.log, { at: new Date().toISOString(), kind: kind as never, message }] });
  return {
    getJob: async (id: string) => (mockStore.has(id) ? JSON.parse(JSON.stringify(mockStore.get(id))) : null),
    saveJob: async (job: Job) => { mockStore.set(job.id, JSON.parse(JSON.stringify(job))); return job; },
    updateJob: async (id: string, patch: (j: Job) => Job) => {
      const j = mockStore.get(id);
      if (!j) throw new Error('not found');
      const next = patch(JSON.parse(JSON.stringify(j)));
      mockStore.set(id, JSON.parse(JSON.stringify(next)));
      return next;
    },
    withLog,
  };
});

jest.mock('../src/storage/photos', () => ({
  sha256: async () => 'a'.repeat(64),
  newId: () => 'id-' + Math.random().toString(36).slice(2),
  hashStoredPhoto: async () => null,
  readPhotoBase64: async () => '',
}));

jest.mock('../src/ai/agents', () => ({ critiqueVerdict: jest.fn(), draftDisputeResponse: jest.fn(), proposeVerdict: jest.fn() }));

jest.mock('../src/paypal/client', () => {
  const actual = jest.requireActual('../src/paypal/client');
  return { ...actual, PayPalClient: jest.fn().mockImplementation(() => mockPayPal) };
});

// Imported after the mocks are registered.
import { PayPalClient, PayPalError } from '../src/paypal/client';
import { cancelUnapproved, createHold, executeCapture, paypal, refreshFromPayPal, resetPayPalClient, syncHold } from '../src/services/holdproof';

const AUTH = { id: 'AUTH-1', status: 'CREATED', amount: { value: '60.00', currency_code: 'USD' }, expiration_time: '2099-01-01T00:00:00Z' };

function baseJob(over: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    createdAt: '2026-11-01T10:00:00.000Z',
    title: 'Clear garage corner',
    description: 'Clear the corner',
    amount: '60.00',
    currency: 'USD',
    criteria: [{ id: 'c1', text: 'Floor is clear', visibleEvidence: 'no boxes' }],
    refused: [],
    before: { fileName: 'b.jpg', sha256: 'b'.repeat(64), capturedAt: '2026-11-01T10:00:00.000Z', lat: 10, lng: 20, accuracyMeters: 5 },
    canonical: '{}',
    digest: 'a'.repeat(64),
    orderId: 'ORDER-1',
    approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1',
    authorizationId: null,
    authorizedAt: null,
    authorizationExpiresAt: null,
    captureId: null,
    capturedAt: null,
    refunds: [],
    paypalStatus: { order: 'PAYER_ACTION_REQUIRED' },
    attempts: [],
    status: 'AWAITING_APPROVAL',
    log: [],
    ...over,
  };
}

function passingAttempt(): VerdictAttempt {
  return {
    id: 'att-1',
    at: '2026-11-01T12:00:00.000Z',
    after: { fileName: 'a.jpg', sha256: 'c'.repeat(64), capturedAt: '2026-11-01T12:00:00.000Z', lat: 10, lng: 20, accuracyMeters: 5 },
    proposal: { same_scene: true, same_scene_reason: 'same walls', criteria: [{ id: 'c1', pass: true, reason: 'clear' }], overall: 'PASS', summary: 'ok' },
    proposalError: null,
    critique: { same_scene_confirmed: true, agree_with_proposal: true, objections: [], summary: 'agree' },
    critiqueError: null,
    decision: { allowed: true, action: 'CAPTURE', checks: [] },
    executed: false,
  };
}

function heldJob(over: Partial<Job> = {}): Job {
  return baseJob({
    status: 'HELD',
    authorizationId: 'AUTH-1',
    authorizedAt: '2026-11-01T11:00:00.000Z',
    authorizationExpiresAt: '2099-01-01T00:00:00Z',
    paypalStatus: { order: 'COMPLETED', authorization: 'CREATED' },
    attempts: [passingAttempt()],
    ...over,
  });
}

beforeEach(() => {
  mockStore.clear();
  Object.values(mockPayPal).forEach((f) => f.mockReset());
  resetPayPalClient();
});

describe('syncHold', () => {
  it('adopts an authorization that already exists when the order is COMPLETED, without authorizing again', async () => {
    mockStore.set('job-1', baseJob());
    mockPayPal.getOrder.mockResolvedValue({ id: 'ORDER-1', status: 'COMPLETED', purchase_units: [{ payments: { authorizations: [{ id: 'AUTH-1', status: 'CREATED' }] } }] });
    mockPayPal.getAuthorization.mockResolvedValue(AUTH);
    const job = await syncHold('job-1');
    expect(job.status).toBe('HELD');
    expect(job.authorizationId).toBe('AUTH-1');
    expect(job.paypalStatus.authorization).toBe('CREATED');
    expect(mockPayPal.authorizeOrder).not.toHaveBeenCalled();
  });

  it('marks the job CANCELLED when the authorization reads DENIED, and never leaves it waiting with an authorization', async () => {
    mockStore.set('job-1', baseJob());
    mockPayPal.getOrder.mockResolvedValue({ id: 'ORDER-1', status: 'APPROVED' });
    mockPayPal.authorizeOrder.mockResolvedValue({ id: 'ORDER-1', status: 'COMPLETED', purchase_units: [{ payments: { authorizations: [{ id: 'AUTH-1', status: 'DENIED' }] } }] });
    mockPayPal.getAuthorization.mockResolvedValue({ ...AUTH, status: 'DENIED' });
    const job = await syncHold('job-1');
    expect(job.status).toBe('CANCELLED');
    expect(job.log[job.log.length - 1].message).toContain('no money is held');
  });

  it('marks the job CANCELLED when PayPal no longer has the order (404)', async () => {
    mockStore.set('job-1', baseJob());
    mockPayPal.getOrder.mockRejectedValue(new PayPalError('not found', 404, 'RESOURCE_NOT_FOUND'));
    const job = await syncHold('job-1');
    expect(job.status).toBe('CANCELLED');
  });

  it('marks the job CANCELLED when the order is VOIDED', async () => {
    mockStore.set('job-1', baseJob());
    mockPayPal.getOrder.mockResolvedValue({ id: 'ORDER-1', status: 'VOIDED' });
    expect((await syncHold('job-1')).status).toBe('CANCELLED');
  });
});

describe('cancelUnapproved', () => {
  it('refuses to cancel when the client has already approved, and keeps the hold', async () => {
    mockStore.set('job-1', baseJob());
    mockPayPal.getOrder.mockResolvedValue({ id: 'ORDER-1', status: 'APPROVED' });
    mockPayPal.authorizeOrder.mockResolvedValue({ id: 'ORDER-1', status: 'COMPLETED', purchase_units: [{ payments: { authorizations: [{ id: 'AUTH-1', status: 'CREATED' }] } }] });
    mockPayPal.getAuthorization.mockResolvedValue(AUTH);
    await expect(cancelUnapproved('job-1')).rejects.toThrow('already approved');
    expect(mockStore.get('job-1')!.status).toBe('HELD');
  });

  it('cancels locally while the order still waits for the client', async () => {
    mockStore.set('job-1', baseJob());
    mockPayPal.getOrder.mockResolvedValue({ id: 'ORDER-1', status: 'PAYER_ACTION_REQUIRED' });
    expect((await cancelUnapproved('job-1')).status).toBe('CANCELLED');
  });

  it('does not cancel blind when PayPal cannot be reached', async () => {
    mockStore.set('job-1', baseJob());
    mockPayPal.getOrder.mockRejectedValue(new TypeError('Network request failed'));
    await expect(cancelUnapproved('job-1')).rejects.toThrow('Network request failed');
    expect(mockStore.get('job-1')!.status).toBe('AWAITING_APPROVAL');
  });
});

describe('createHold', () => {
  it('refuses to create an order when the BEFORE photo has no location', async () => {
    const job = baseJob({ status: 'READY', orderId: null, approveUrl: null });
    job.before = { ...job.before!, lat: null, lng: null };
    mockStore.set('job-1', job);
    await expect(createHold('job-1')).rejects.toThrow('no location');
    expect(mockPayPal.createAuthorizeOrder).not.toHaveBeenCalled();
  });
});

describe('executeCapture', () => {
  it('leaves the job HELD and the attempt unexecuted when the capture is DECLINED, and reads the authorization back', async () => {
    mockStore.set('job-1', heldJob());
    mockPayPal.captureAuthorization.mockResolvedValue({ id: 'CAP-1', status: 'DECLINED' });
    mockPayPal.getCapture.mockResolvedValue({ id: 'CAP-1', status: 'DECLINED' });
    mockPayPal.getAuthorization.mockResolvedValue({ ...AUTH, status: 'CREATED' });
    const job = await executeCapture('job-1', 'att-1');
    expect(job.status).toBe('HELD');
    expect(job.captureId).toBeNull();
    expect(job.attempts[0].executed).toBe(false);
    expect(job.paypalStatus).toMatchObject({ capture: 'DECLINED', authorization: 'CREATED' });
    expect(mockPayPal.captureAuthorization.mock.calls[0][4]).toBe('hp-capture-job-1-att-1');
  });

  it('records a COMPLETED capture with the authorization status read back from PayPal', async () => {
    mockStore.set('job-1', heldJob());
    mockPayPal.captureAuthorization.mockResolvedValue({ id: 'CAP-1', status: 'COMPLETED' });
    mockPayPal.getCapture.mockResolvedValue({ id: 'CAP-1', status: 'COMPLETED', amount: { value: '60.00', currency_code: 'USD' } });
    mockPayPal.getAuthorization.mockResolvedValue({ ...AUTH, status: 'CAPTURED' });
    const job = await executeCapture('job-1', 'att-1');
    expect(job.status).toBe('CAPTURED');
    expect(job.captureId).toBe('CAP-1');
    expect(job.attempts[0].executed).toBe(true);
    expect(job.paypalStatus.authorization).toBe('CAPTURED');
  });

  it('adopts the existing capture when PayPal answers AUTHORIZATION_ALREADY_CAPTURED', async () => {
    mockStore.set('job-1', heldJob());
    mockPayPal.captureAuthorization.mockRejectedValue(new PayPalError('already captured', 422, 'UNPROCESSABLE_ENTITY', 'dbg', 'AUTHORIZATION_ALREADY_CAPTURED'));
    mockPayPal.getOrder.mockResolvedValue({ id: 'ORDER-1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP-9', status: 'COMPLETED' }] } }] });
    mockPayPal.getCapture.mockResolvedValue({ id: 'CAP-9', status: 'COMPLETED' });
    mockPayPal.getAuthorization.mockResolvedValue({ ...AUTH, status: 'CAPTURED' });
    const job = await executeCapture('job-1', 'att-1');
    expect(job.status).toBe('CAPTURED');
    expect(job.captureId).toBe('CAP-9');
    expect(job.attempts[0].executed).toBe(true);
  });
});

describe('refreshFromPayPal', () => {
  it('promotes a HELD job to CAPTURED when PayPal reports the authorization as CAPTURED', async () => {
    mockStore.set('job-1', heldJob());
    mockPayPal.getAuthorization.mockResolvedValue({ ...AUTH, status: 'CAPTURED' });
    mockPayPal.getOrder.mockResolvedValue({ id: 'ORDER-1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP-9', status: 'COMPLETED' }] } }] });
    mockPayPal.getCapture.mockResolvedValue({ id: 'CAP-9', status: 'COMPLETED' });
    const job = await refreshFromPayPal('job-1');
    expect(job.status).toBe('CAPTURED');
    expect(job.captureId).toBe('CAP-9');
  });

  it('shows an EXPIRED hold as VOIDED and logs the real authorization status', async () => {
    mockStore.set('job-1', heldJob());
    mockPayPal.getAuthorization.mockResolvedValue({ ...AUTH, status: 'EXPIRED' });
    const job = await refreshFromPayPal('job-1');
    expect(job.status).toBe('VOIDED');
    expect(job.paypalStatus.authorization).toBe('EXPIRED');
    expect(job.log.some((l) => l.message.includes('EXPIRED'))).toBe(true);
  });

  it('refreshes stored refund statuses', async () => {
    mockStore.set('job-1', heldJob({
      status: 'CAPTURED', captureId: 'CAP-1',
      refunds: [{ id: 'R-1', criterionId: 'c1', amount: '10.00', status: 'PENDING', createdAt: '2026-11-01T13:00:00.000Z' }],
    }));
    mockPayPal.getAuthorization.mockResolvedValue({ ...AUTH, status: 'CAPTURED' });
    mockPayPal.getCapture.mockResolvedValue({ id: 'CAP-1', status: 'PARTIALLY_REFUNDED' });
    mockPayPal.getRefund.mockResolvedValue({ id: 'R-1', status: 'COMPLETED' });
    const job = await refreshFromPayPal('job-1');
    expect(job.refunds[0].status).toBe('COMPLETED');
    expect(job.paypalStatus.capture).toBe('PARTIALLY_REFUNDED');
  });
});

describe('resetPayPalClient', () => {
  it('drops the cached client so that the next call builds a new one', async () => {
    const ctor = PayPalClient as unknown as jest.Mock;
    ctor.mockClear();
    await paypal();
    await paypal();
    expect(ctor).toHaveBeenCalledTimes(1);
    resetPayPalClient();
    await paypal();
    expect(ctor).toHaveBeenCalledTimes(2);
  });
});
