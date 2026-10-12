import {
  createLlmClient,
  LlmOutputError,
  LlmProviderError,
  LlmRateLimitError,
  LlmTimeoutError,
  OpenAiCompatibleClient,
} from './llm.client.js';
import { readLlmConfig } from './llm.config.js';

const KEY = 'gsk_secret_key_never_logged';
const config = {
  enabled: true as const,
  baseUrl: 'https://llm.example.test/v1',
  apiKey: KEY,
  model: 'some-model',
  timeoutMs: 50,
};
const request = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  temperature: 0,
  json: true,
};

/** A fetch that never touches the network. */
function fakeFetch(
  respond: (url: string, init: RequestInit) => Promise<Response>,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const jsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('OpenAiCompatibleClient', () => {
  it('posts an OpenAI Chat Completions request and reads content and usage', async () => {
    const fetch = fakeFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          model: 'some-model-2026',
          choices: [{ message: { content: '{"a":1}' } }],
          usage: { prompt_tokens: 321, completion_tokens: 12 },
        }),
      ),
    );
    const client = new OpenAiCompatibleClient(config, fetch.fn);

    const completion = await client.complete(request);

    expect(completion).toEqual({
      content: '{"a":1}',
      model: 'some-model-2026',
      usage: { inputTokens: 321, outputTokens: 12 },
    });
    const { url, init } = fetch.calls[0];
    expect(url).toBe('https://llm.example.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${KEY}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'some-model',
      messages: request.messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
  });

  it('429 -> LlmRateLimitError, with Retry-After', async () => {
    const client = new OpenAiCompatibleClient(
      config,
      fakeFetch(() =>
        Promise.resolve(
          jsonResponse(
            429,
            { error: { message: 'slow down' } },
            { 'retry-after': '12' },
          ),
        ),
      ).fn,
    );
    const error = await client.complete(request).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(LlmRateLimitError);
    expect((error as LlmRateLimitError).retryAfterSeconds).toBe(12);
  });

  it("the provider's JSON check failing -> LlmOutputError (a bad answer, retried)", async () => {
    const client = new OpenAiCompatibleClient(
      config,
      fakeFetch(() =>
        Promise.resolve(
          jsonResponse(400, {
            error: { code: 'json_validate_failed', message: 'x' },
          }),
        ),
      ).fn,
    );
    await expect(client.complete(request)).rejects.toBeInstanceOf(
      LlmOutputError,
    );
  });

  it('other failures -> LlmProviderError, never containing the key', async () => {
    for (const respond of [
      () =>
        Promise.resolve(
          jsonResponse(401, { error: { message: 'Invalid API Key' } }),
        ),
      () => Promise.resolve(jsonResponse(503, null)),
      () =>
        Promise.reject(
          Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'ECONNREFUSED' },
          }),
        ),
    ]) {
      const client = new OpenAiCompatibleClient(config, fakeFetch(respond).fn);
      const error = (await client
        .complete(request)
        .catch((err: unknown) => err)) as Error;
      expect(error).toBeInstanceOf(LlmProviderError);
      expect(error.message).not.toContain(KEY);
    }
  });

  it('no answer within the timeout -> LlmTimeoutError (the request is aborted)', async () => {
    let aborted = false;
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const client = new OpenAiCompatibleClient(config, fakeFetch(hang).fn);
    await expect(client.complete(request)).rejects.toBeInstanceOf(
      LlmTimeoutError,
    );
    expect(aborted).toBe(true);
  });

  it('a reply without content gives content null (the parser retries)', async () => {
    const client = new OpenAiCompatibleClient(
      config,
      fakeFetch(() => Promise.resolve(jsonResponse(200, { choices: [] }))).fn,
    );
    expect((await client.complete(request)).content).toBeNull();
  });
});

describe('createLlmClient', () => {
  it('creates no client when disabled', () => {
    expect(createLlmClient(readLlmConfig({}))).toBeNull();
  });
});
