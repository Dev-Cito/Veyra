export const DEFAULT_LLM_TIMEOUT_MS = 15_000;

export type LlmConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      baseUrl: string;
      apiKey: string;
      model: string;
      timeoutMs: number;
    };

/**
 * Reads the LLM settings. Never throws: with LLM_ENABLED other than 'true' or
 * an incomplete configuration, the feature is simply off (POST …/parse answers
 * 503) and the rest of the app runs as usual. Same contract as readMailConfig.
 *
 * Any provider speaking the OpenAI Chat Completions API works (Groq, NVIDIA
 * NIM, OpenRouter, Cerebras…): switching is a change of LLM_BASE_URL,
 * LLM_API_KEY and LLM_MODEL, not of code.
 */
export function readLlmConfig(env: NodeJS.ProcessEnv): LlmConfig {
  if (env.LLM_ENABLED !== 'true') {
    return { enabled: false, reason: 'LLM_ENABLED is not "true"' };
  }
  const missing = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'].filter(
    (name) => !env[name]?.trim(),
  );
  let baseUrl: URL | null = null;
  if (env.LLM_BASE_URL?.trim()) {
    try {
      baseUrl = new URL(env.LLM_BASE_URL.trim());
    } catch {
      missing.push('LLM_BASE_URL (not a URL)');
    }
  }
  const timeout = env.LLM_TIMEOUT_MS?.trim()
    ? Number(env.LLM_TIMEOUT_MS)
    : DEFAULT_LLM_TIMEOUT_MS;
  if (!(Number.isInteger(timeout) && timeout > 0)) {
    missing.push('LLM_TIMEOUT_MS (not a positive integer)');
  }
  if (missing.length > 0 || !baseUrl) {
    return { enabled: false, reason: `missing ${missing.join(', ')}` };
  }
  return {
    enabled: true,
    baseUrl: baseUrl.toString().replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY!.trim(),
    model: env.LLM_MODEL!.trim(),
    timeoutMs: timeout,
  };
}
