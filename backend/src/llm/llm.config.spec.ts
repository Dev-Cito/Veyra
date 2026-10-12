import { readLlmConfig } from './llm.config.js';

const complete = {
  LLM_ENABLED: 'true',
  LLM_BASE_URL: 'https://api.groq.com/openai/v1/',
  LLM_API_KEY: 'gsk_test',
  LLM_MODEL: 'openai/gpt-oss-20b',
};

describe('readLlmConfig', () => {
  it('is disabled unless LLM_ENABLED is exactly "true"', () => {
    for (const value of [undefined, 'false', '1', 'TRUE']) {
      expect(readLlmConfig({ ...complete, LLM_ENABLED: value }).enabled).toBe(
        false,
      );
    }
  });

  it('is disabled, never throwing, when the configuration is incomplete', () => {
    expect(readLlmConfig({ LLM_ENABLED: 'true' })).toEqual({
      enabled: false,
      reason: 'missing LLM_BASE_URL, LLM_API_KEY, LLM_MODEL',
    });
    expect(
      readLlmConfig({ ...complete, LLM_BASE_URL: 'not a url' }).enabled,
    ).toBe(false);
    expect(readLlmConfig({ ...complete, LLM_TIMEOUT_MS: '-5' }).enabled).toBe(
      false,
    );
  });

  it('is enabled with a complete configuration, 15 s timeout by default', () => {
    expect(readLlmConfig(complete)).toEqual({
      enabled: true,
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk_test',
      model: 'openai/gpt-oss-20b',
      timeoutMs: 15000,
    });
    expect(
      readLlmConfig({ ...complete, LLM_TIMEOUT_MS: '8000' }),
    ).toMatchObject({ timeoutMs: 8000 });
  });
});
