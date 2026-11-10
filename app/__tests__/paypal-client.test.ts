import { PayPalClient, PayPalError, approvalLink, describePayPalError } from '../src/paypal/client';

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error('Unexpected request');
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return { ok: r.status < 400, status: r.status, json: async () => (text ? JSON.parse(text) : {}), text: async () => text } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const TOKEN = { status: 200, body: { access_token: 'tok', expires_in: 32400 } };

describe('PayPalClient', () => {
  it('always targets the sandbox host by default', () => {
    const c = new PayPalClient('id', 'secret');
    expect((c as unknown as { baseUrl: string }).baseUrl).toBe('https://api-m.sandbox.paypal.com');
  });

  it('creates an AUTHORIZE order carrying the digest in custom_id, with an idempotency key', async () => {
    const { impl, calls } = mockFetch([TOKEN, { status: 201, body: { id: 'ORDER1', status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', href: 'https://sandbox.paypal.com/checkoutnow?token=ORDER1' }] } }]);
    const client = new PayPalClient('id', 'secret', 'https://api-m.sandbox.paypal.com', impl);
    const order = await client.createAuthorizeOrder({
      referenceId: 'job-1', customId: 'a'.repeat(64), description: 'x'.repeat(200), amount: '60.00', currency: 'USD',
      returnUrl: 'holdproof://approved', cancelUrl: 'holdproof://cancelled', requestId: 'hp-order-job-1',
    });
    expect(order.id).toBe('ORDER1');
    expect(approvalLink(order)).toContain('token=ORDER1');
    expect(calls[0].url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers['PayPal-Request-Id']).toBe('hp-order-job-1');
    const body = JSON.parse(String(calls[1].init.body));
    expect(body.intent).toBe('AUTHORIZE');
    expect(body.purchase_units[0].custom_id).toBe('a'.repeat(64));
    expect(body.purchase_units[0].description.length).toBeLessThanOrEqual(127);
  });

  it('reuses the access token until it nears expiry', async () => {
    const { impl, calls } = mockFetch([TOKEN, { status: 200, body: { id: 'O', status: 'APPROVED' } }, { status: 200, body: { id: 'O', status: 'APPROVED' } }]);
    const client = new PayPalClient('id', 'secret', 'https://api-m.sandbox.paypal.com', impl);
    await client.getOrder('O');
    await client.getOrder('O');
    expect(calls.filter((c) => c.url.endsWith('/v1/oauth2/token'))).toHaveLength(1);
  });

  it('handles 204 on void', async () => {
    const { impl } = mockFetch([TOKEN, { status: 204 }]);
    await expect(new PayPalClient('id', 'secret', 'https://x', impl).voidAuthorization('A', 'k')).resolves.toBeUndefined();
  });

  it('surfaces PayPal error details with the debug id', async () => {
    const { impl } = mockFetch([TOKEN, { status: 422, body: { name: 'UNPROCESSABLE_ENTITY', debug_id: 'dbg1', details: [{ issue: 'AUTHORIZATION_ALREADY_CAPTURED', description: 'Already captured.' }] } }]);
    const client = new PayPalClient('id', 'secret', 'https://x', impl);
    const err = await client.captureAuthorization('A', '60.00', 'USD', 'inv', 'k').catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(describePayPalError(err)).toBe('AUTHORIZATION_ALREADY_CAPTURED: Already captured. (debug id dbg1)');
  });

  it('reports rejected credentials clearly', async () => {
    const { impl } = mockFetch([{ status: 401, body: { error: 'invalid_client', error_description: 'Client Authentication failed' } }]);
    const err = await new PayPalClient('id', 'bad', 'https://x', impl).getAccessToken().catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.status).toBe(401);
  });
});
