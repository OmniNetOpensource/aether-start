import { afterEach, describe, expect, it } from 'vitest';

const originalGoogleGenAiUseVertexAi = process.env.GOOGLE_GENAI_USE_VERTEXAI;

afterEach(() => {
  if (originalGoogleGenAiUseVertexAi === undefined) {
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    return;
  }

  process.env.GOOGLE_GENAI_USE_VERTEXAI = originalGoogleGenAiUseVertexAi;
});

describe('getGeminiClient', () => {
  it('uses Gemini Developer API even when the process enables Vertex AI by default', async () => {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'True';

    const { getGeminiClient } = await import('./gemini-client');
    const client = getGeminiClient({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com',
      defaultHeaders: { 'User-Agent': 'aether-test' },
    });

    expect(Reflect.get(client, 'vertexai')).toBe(false);

    const apiClient = Reflect.get(client, 'apiClient');

    expect(apiClient.isVertexAI()).toBe(false);
    expect(apiClient.getApiVersion()).toBe('v1beta');
    expect(apiClient.getBaseUrl()).toBe('https://generativelanguage.googleapis.com');
  });
});
