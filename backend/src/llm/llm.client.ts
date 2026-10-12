import type { LlmConfig } from './llm.config.js';

/** Injection token; null means "LLM disabled". Tests replace it with a fake. */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletion {
  /** The model's text; null when the provider returned none. */
  content: string | null;
  /** The model that answered, as reported by the provider. */
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/** Anything that completes a chat: the OpenAI-compatible client, or a test fake. */
export interface LlmClient {
  readonly model: string;
  complete(request: {
    messages: LlmMessage[];
    temperature: number;
    /** Ask for a JSON object (response_format json_object). */
    json: boolean;
  }): Promise<LlmCompletion>;
}

/** No answer within LLM_TIMEOUT_MS. */
export class LlmTimeoutError extends Error {
  constructor() {
    super('The language model did not answer in time');
    this.name = 'LlmTimeoutError';
  }
}

/** The provider's own rate limit (HTTP 429). */
export class LlmRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super('The language model provider rate limit was reached');
    this.name = 'LlmRateLimitError';
  }
}

/**
 * The provider rejected the model's own output (e.g. Groq's 400
 * json_validate_failed in JSON mode): a bad answer, worth one retry.
 */
export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmOutputError';
  }
}

/** Anything else: network failure, 401 (bad key), 5xx. */
export class LlmProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

type FetchFn = typeof fetch;

/**
 * POST {baseUrl}/chat/completions, as defined by OpenAI and implemented by
 * Groq, NVIDIA NIM, OpenRouter, Cerebras… Plain fetch, no provider SDK.
 *
 * The API key only ever goes into the Authorization header: it is never part
 * of an error message, so no log line can contain it.
 */
export class OpenAiCompatibleClient implements LlmClient {
  readonly model: string;

  constructor(
    private readonly config: Extract<LlmConfig, { enabled: true }>,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.model = config.model;
  }

  async complete(request: {
    messages: LlmMessage[];
    temperature: number;
    json: boolean;
  }): Promise<LlmCompletion> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchFn(
          `${this.config.baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: this.config.model,
              messages: request.messages,
              temperature: request.temperature,
              ...(request.json
                ? { response_format: { type: 'json_object' } }
                : {}),
            }),
            signal: controller.signal,
          },
        );
      } catch (err) {
        throw controller.signal.aborted
          ? new LlmTimeoutError()
          : new LlmProviderError(`request failed: ${describe(err)}`);
      }

      // The body is read under the same timeout.
      const body: unknown = await response.json().catch(() => {
        if (controller.signal.aborted) {
          throw new LlmTimeoutError();
        }
        return null;
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        throw new LlmRateLimitError(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
        );
      }
      if (!response.ok) {
        const error = (
          body as { error?: { code?: unknown; message?: unknown } } | null
        )?.error;
        if (response.status === 400 && error?.code === 'json_validate_failed') {
          throw new LlmOutputError('the model did not produce valid JSON');
        }
        const detail =
          typeof error?.message === 'string'
            ? `: ${error.message.slice(0, 200)}`
            : '';
        throw new LlmProviderError(`HTTP ${response.status}${detail}`);
      }

      const data = body as {
        model?: unknown;
        choices?: { message?: { content?: unknown } }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      } | null;
      const content = data?.choices?.[0]?.message?.content;
      const tokens = (value: unknown) =>
        typeof value === 'number' ? value : null;
      return {
        content: typeof content === 'string' ? content : null,
        model: typeof data?.model === 'string' ? data.model : this.config.model,
        usage: {
          inputTokens: tokens(data?.usage?.prompt_tokens),
          outputTokens: tokens(data?.usage?.completion_tokens),
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: { code?: unknown } }).cause?.code;
    return typeof cause === 'string'
      ? `${err.message} (${cause})`
      : err.message;
  }
  return 'unknown error';
}

export function createLlmClient(config: LlmConfig): LlmClient | null {
  return config.enabled ? new OpenAiCompatibleClient(config) : null;
}
