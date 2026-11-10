import { buildBody, extractText, generate, resetFormatPreference } from '../src/ai/gemini';

type Reply = { status: number; body?: unknown } | 'network';

function mockFetch(replies: Reply[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = replies.shift();
    if (!r) throw new Error('Unexpected request');
    if (r === 'network') throw new TypeError('Network request failed');
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return { status: r.status, text: async () => text } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (text: string, extra: object = {}) => ({
  status: 200,
  body: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }], ...extra },
});
const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] };
const noSleep = async () => undefined;

beforeEach(() => resetFormatPreference());

describe('Gemini transport', () => {
  it('posts to the generateContent endpoint with the key header and the documented structured-output field', async () => {
    const { impl, calls } = mockFetch([ok('{"a":"x"}')]);
    const res = await generate('AIza-test', { system: 'sys', parts: [{ text: 'hi' }], schema, fetchImpl: impl, sleep: noSleep });
    expect(res).toEqual({ ok: true, text: '{"a":"x"}' });
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.generationConfig.responseFormat.text).toEqual({ mimeType: 'APPLICATION_JSON', schema });
    expect(body.systemInstruction.parts[0].text).toBe('sys');
  });

  it('falls back to responseJsonSchema when the API rejects responseFormat as an unknown field, and remembers it', async () => {
    const unknown = { status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received. Unknown name "responseFormat" at \'generation_config\': Cannot find field.' } } };
    const { impl, calls } = mockFetch([unknown, ok('{"a":"y"}'), ok('{"a":"z"}')]);
    const first = await generate('k', { system: 's', parts: [{ text: 't' }], schema, fetchImpl: impl, sleep: noSleep });
    expect(first).toEqual({ ok: true, text: '{"a":"y"}' });
    expect(JSON.parse(String(calls[1].init.body)).generationConfig.responseJsonSchema).toEqual(schema);
    await generate('k', { system: 's', parts: [{ text: 't' }], schema, fetchImpl: impl, sleep: noSleep });
    expect(JSON.parse(String(calls[2].init.body)).generationConfig.responseJsonSchema).toEqual(schema);
  });

  it('retries once on a rate limit, then succeeds', async () => {
    const { impl, calls } = mockFetch([{ status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } } }, ok('{"a":"r"}')]);
    const res = await generate('k', { system: 's', parts: [{ text: 't' }], schema, fetchImpl: impl, sleep: noSleep });
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('reports a rejected key without retrying', async () => {
    const { impl, calls } = mockFetch([{ status: 400, body: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } } }]);
    const res = await generate('bad', { system: 's', parts: [{ text: 't' }], schema, fetchImpl: impl, sleep: noSleep });
    expect(res).toEqual({ ok: false, error: 'The Gemini API key was rejected.', retryable: false });
    expect(calls).toHaveLength(1);
  });

  it('reports a network failure after one retry', async () => {
    const { impl, calls } = mockFetch(['network', 'network']);
    const res = await generate('k', { system: 's', parts: [{ text: 't' }], schema, fetchImpl: impl, sleep: noSleep });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('asks for JSON in the instructions when no schema field is used', () => {
    const body = buildBody({ system: 'sys', parts: [{ text: 't' }], schema }, 'prompt') as { systemInstruction: { parts: Array<{ text: string }> }; generationConfig: Record<string, unknown> };
    expect(body.systemInstruction.parts[0].text).toContain('JSON Schema');
    expect(body.generationConfig.responseFormat).toBeUndefined();
  });

  it('sends images as inlineData parts', async () => {
    const { impl, calls } = mockFetch([ok('{"a":"i"}')]);
    await generate('k', { system: 's', parts: [{ text: 'BEFORE' }, { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }], schema, fetchImpl: impl, sleep: noSleep });
    expect(JSON.parse(String(calls[0].init.body)).contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
  });
});

describe('extractText (fail closed)', () => {
  it('ignores thought parts and strips code fences', () => {
    expect(extractText({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking…', thought: true }, { text: '```json\n{"a":1}\n```' }] } }] }))
      .toEqual({ ok: true, text: '{"a":1}' });
  });

  it('refuses blocked prompts, safety stops, truncation and empty answers', () => {
    expect(extractText({ promptFeedback: { blockReason: 'SAFETY' } }).ok).toBe(false);
    expect(extractText({ candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '{}' }] } }] }).ok).toBe(false);
    expect(extractText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"a"' }] } }] }).ok).toBe(false);
    expect(extractText({ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] }).ok).toBe(false);
    expect(extractText({}).ok).toBe(false);
  });
});
