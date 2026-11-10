/**
 * Direct PayPal Sandbox REST client (hackathon build, no backend).
 * Every money state shown in the app is read back from these endpoints; nothing is inferred.
 */
import { PAYPAL_BASE_URL } from '../config';

export class PayPalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly name: string,
    public readonly debugId?: string,
    public readonly issue?: string,
  ) {
    super(message);
  }
}

export interface PayPalLink { href: string; rel: string; method?: string }

export interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links?: PayPalLink[];
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    description?: string;
    amount?: { currency_code: string; value: string };
    payments?: {
      authorizations?: Array<{ id: string; status: string; expiration_time?: string; amount?: { value: string; currency_code: string } }>;
    };
  }>;
}

export interface PayPalAuthorization {
  id: string;
  status: 'CREATED' | 'CAPTURED' | 'DENIED' | 'PARTIALLY_CAPTURED' | 'VOIDED' | 'PENDING' | 'EXPIRED';
  amount: { value: string; currency_code: string };
  expiration_time?: string;
  custom_id?: string;
}

export interface PayPalCapture {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
  amount?: { value: string; currency_code: string };
}

export interface PayPalRefund {
  id: string;
  status: 'CANCELLED' | 'FAILED' | 'PENDING' | 'COMPLETED';
  amount?: { value: string; currency_code: string };
}

export interface PayPalDispute {
  dispute_id: string;
  status: string;
  reason?: string;
  dispute_life_cycle_stage?: string;
  dispute_amount?: { value: string; currency_code: string };
  create_time?: string;
  disputed_transactions?: Array<{ seller_transaction_id?: string }>;
}

interface TokenCache { value: string; expiresAt: number }

function basicAuth(clientId: string, secret: string): string {
  return `Basic ${globalThis.btoa(`${clientId}:${secret}`)}`;
}

export class PayPalClient {
  private token: TokenCache | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly baseUrl: string = PAYPAL_BASE_URL,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await this.fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(this.clientId, this.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      throw new PayPalError(
        json.error_description ?? 'PayPal rejected the sandbox credentials.',
        res.status,
        json.error ?? 'AUTHENTICATION_FAILURE',
      );
    }
    this.token = { value: json.access_token, expiresAt: Date.now() + Number(json.expires_in ?? 0) * 1000 };
    return this.token.value;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, requestId?: string): Promise<T> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
    if (requestId) headers['PayPal-Request-Id'] = requestId; // idempotency for every POST
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? (method === 'POST' ? '{}' : undefined) : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const issue = json.details?.[0]?.issue as string | undefined;
      const description = json.details?.[0]?.description as string | undefined;
      throw new PayPalError(
        description ?? json.message ?? `PayPal returned HTTP ${res.status}`,
        res.status,
        json.name ?? 'PAYPAL_ERROR',
        json.debug_id,
        issue,
      );
    }
    return json as T;
  }

  createAuthorizeOrder(input: {
    referenceId: string;
    customId: string;
    description: string;
    amount: string;
    currency: string;
    returnUrl: string;
    cancelUrl: string;
    requestId: string;
  }): Promise<PayPalOrder> {
    return this.request<PayPalOrder>('POST', '/v2/checkout/orders', {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: input.amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'HoldProof (Sandbox)',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'CONTINUE',
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    }, input.requestId);
  }

  getOrder(orderId: string): Promise<PayPalOrder> {
    return this.request<PayPalOrder>('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  authorizeOrder(orderId: string, requestId: string): Promise<PayPalOrder> {
    return this.request<PayPalOrder>('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, undefined, requestId);
  }

  getAuthorization(authorizationId: string): Promise<PayPalAuthorization> {
    return this.request<PayPalAuthorization>('GET', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`);
  }

  captureAuthorization(authorizationId: string, amount: string, currency: string, invoiceId: string, requestId: string): Promise<PayPalCapture> {
    return this.request<PayPalCapture>('POST', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, {
      amount: { value: amount, currency_code: currency },
      invoice_id: invoiceId,
      final_capture: true,
      note_to_payer: 'Released by HoldProof after the agreed job was verified.',
    }, requestId);
  }

  voidAuthorization(authorizationId: string, requestId: string): Promise<void> {
    return this.request<void>('POST', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, undefined, requestId);
  }

  getCapture(captureId: string): Promise<PayPalCapture> {
    return this.request<PayPalCapture>('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`);
  }

  refundCapture(captureId: string, amount: string, currency: string, note: string, requestId: string): Promise<PayPalRefund> {
    return this.request<PayPalRefund>('POST', `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
      amount: { value: amount, currency_code: currency },
      note_to_payer: note.slice(0, 255),
    }, requestId);
  }

  getRefund(refundId: string): Promise<PayPalRefund> {
    return this.request<PayPalRefund>('GET', `/v2/payments/refunds/${encodeURIComponent(refundId)}`);
  }

  async listDisputes(captureId: string): Promise<PayPalDispute[]> {
    const json = await this.request<{ items?: PayPalDispute[] }>(
      'GET',
      `/v1/customer/disputes?disputed_transaction_id=${encodeURIComponent(captureId)}`,
    );
    return json.items ?? [];
  }

  getDispute(disputeId: string): Promise<PayPalDispute> {
    return this.request<PayPalDispute>('GET', `/v1/customer/disputes/${encodeURIComponent(disputeId)}`);
  }
}

export function approvalLink(order: PayPalOrder): string | null {
  const link = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  return link?.href ?? null;
}

export function describePayPalError(e: unknown): string {
  if (e instanceof PayPalError) {
    const id = e.debugId ? ` (debug id ${e.debugId})` : '';
    return `${e.issue ?? e.name}: ${e.message}${id}`;
  }
  if (e instanceof TypeError) return 'Network error: PayPal Sandbox could not be reached. Check the connection and try again.';
  return (e as Error)?.message ?? 'Unknown PayPal error';
}
