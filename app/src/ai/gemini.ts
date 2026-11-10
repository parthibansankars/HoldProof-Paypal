/**
 * Minimal Google Gemini API client (REST, no SDK), called directly from the phone in this hackathon build.
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent, key in x-goog-api-key.
 * The caller always validates the returned JSON; this module only transports text and maps errors.
 */
import { AI_BASE_URL, AI_MODEL } from '../config';

export type GeminiPart = { text: string } | { inlineData: { mimeType: 'image/jpeg'; data: string } };

export type GeminiResult = { ok: true; text: string } | { ok: false; error: string; retryable?: boolean };

/**
 * Structured-output request shapes, tried in order. The documented REST form uses responseFormat.text;
 * the SDK form uses responseMimeType + responseJsonSchema. If the API rejects one as an unknown field,
 * the next is tried and remembered. 'prompt' asks for JSON in the instructions only.
 */
export type FormatStrategy = 'responseFormat' | 'jsonSchema' | 'prompt';
const STRATEGIES: FormatStrategy[] = ['responseFormat', 'jsonSchema', 'prompt'];
let preferred: FormatStrategy | null = null;

export function resetFormatPreference(): void {
  preferred = null;
}

export interface GenerateOptions {
  system: string;
  parts: GeminiPart[];
  schema?: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function buildBody(opts: GenerateOptions, strategy: FormatStrategy): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = { maxOutputTokens: opts.maxOutputTokens ?? 16384 };
  let system = opts.system;
  if (opts.schema) {
    if (strategy === 'responseFormat') {
      generationConfig.responseFormat = { text: { mimeType: 'APPLICATION_JSON', schema: opts.schema } };
    } else if (strategy === 'jsonSchema') {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseJsonSchema = opts.schema;
    } else {
      system += `\n\nRespond with ONLY one JSON object, no prose and no code fences, that matches this JSON Schema:\n${JSON.stringify(opts.schema)}`;
    }
  }
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: opts.parts }],
    generationConfig,
  };
}

interface GeminiErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: Array<{ reason?: string }> };
}

/** True when a 400 says the request used a field this API version does not know. */
export function isUnknownFieldError(status: number, body: GeminiErrorBody): boolean {
  if (status !== 400) return false;
  const msg = body.error?.message ?? '';
  return /unknown name|invalid json payload|cannot find field|unknown field/i.test(msg) &&
    /responseFormat|responseJsonSchema|responseMimeType|response_format|response_json_schema/i.test(msg);
}

export function describeHttpError(status: number, body: GeminiErrorBody): { error: string; retryable: boolean } {
  const reason = body.error?.details?.find((d) => d.reason)?.reason;
  const msg = body.error?.message ?? `HTTP ${status}`;
  if (reason === 'API_KEY_INVALID' || /api key not valid/i.test(msg)) return { error: 'The Gemini API key was rejected.', retryable: false };
  if (status === 401 || status === 403) return { error: `The Gemini API key is not allowed to use ${AI_MODEL}: ${msg}`, retryable: false };
  if (status === 404) return { error: `The Gemini model ${AI_MODEL} was not found for this key: ${msg}`, retryable: false };
  if (status === 429) return { error: 'The Gemini free-tier rate limit was reached. Wait a minute and try again.', retryable: true };
  if (status >= 500) return { error: `The Gemini service is unavailable right now (HTTP ${status}). Try again shortly.`, retryable: true };
  return { error: `Gemini API error ${status}: ${msg}`, retryable: false };
}

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
}

export function extractText(json: GeminiResponse): GeminiResult {
  if (json.promptFeedback?.blockReason) {
    return { ok: false, error: `Gemini declined the request (${json.promptFeedback.blockReason}).` };
  }
  const candidate = json.candidates?.[0];
  if (!candidate) return { ok: false, error: 'Gemini returned no answer.' };
  const reason = candidate.finishReason ?? 'STOP';
  if (reason === 'MAX_TOKENS') {
    return { ok: false, error: 'The AI response was cut off before it finished. No money moved. Try again; for a photo check, capture the AFTER photo again.' };
  }
  if (reason !== 'STOP') return { ok: false, error: `Gemini stopped without a usable answer (${reason}).` };
  const text = (candidate.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  if (!text) return { ok: false, error: 'Gemini returned an empty answer.' };
  return { ok: true, text: stripFences(text) };
}

function stripFences(text: string): string {
  const m = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : text;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function postOnce(apiKey: string, body: unknown, opts: GenerateOptions): Promise<{ status: number; json: unknown } | { networkError: string }> {
  const fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  try {
    const res = await fetchImpl(`${AI_BASE_URL}/v1beta/models/${encodeURIComponent(AI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    return { status: res.status, json };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return { networkError: aborted ? 'The AI request timed out.' : 'The Gemini API could not be reached. Check the connection.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Sends one generateContent request with one retry for rate limits, 5xx and network errors. */
export async function generate(apiKey: string, opts: GenerateOptions): Promise<GeminiResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const order = opts.schema
    ? (preferred ? [preferred, ...STRATEGIES.filter((s) => s !== preferred)] : STRATEGIES)
    : (['prompt'] as FormatStrategy[]);

  for (const strategy of order) {
    const body = buildBody(opts, strategy);
    let last: GeminiResult = { ok: false, error: 'Unknown AI error' };
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await postOnce(apiKey, body, opts);
      if ('networkError' in res) {
        last = { ok: false, error: res.networkError, retryable: true };
      } else if (res.status >= 200 && res.status < 300) {
        if (opts.schema) preferred = strategy;
        return extractText(res.json as GeminiResponse);
      } else if (isUnknownFieldError(res.status, res.json as GeminiErrorBody)) {
        last = { ok: false, error: 'unsupported-format' };
        break; // try the next request shape
      } else {
        const d = describeHttpError(res.status, res.json as GeminiErrorBody);
        last = { ok: false, error: d.error, retryable: d.retryable };
      }
      if (!last.ok && last.retryable && attempt === 0) {
        await sleep(2000);
        continue;
      }
      break;
    }
    if (!last.ok && last.error !== 'unsupported-format') return last;
  }
  return { ok: false, error: 'The Gemini API rejected every structured-output request format.' };
}
