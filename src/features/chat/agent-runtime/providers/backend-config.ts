import type { ModelConfig } from '@/features/chat/model-catalog';
import { getServerEnv } from '@/shared/worker/env';

export type BackendConfig = {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
};

export const buildCurrentDateSystemPrompt = () => {
  const now = new Date();
  const localDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return `Today's date is: ${localDate}`;
};

export const buildStableSystemPrompt = () => `No need to cite sources in your answers.

# When to search: Avoid searching in Chinese unless necessary; do not answer until you have enough context; if unsure, keep researching until you understand-do not just skim the surface, search deeply for information, and only answer after comprehensive research.

# When not to search: Known knowledge

- Learn to use Google search advanced techniques
`;

export const buildSystemPrompt = () =>
  `${buildCurrentDateSystemPrompt()}

${buildStableSystemPrompt()}`;

export const getBackendConfig = (modelConfig: ModelConfig): BackendConfig => {
  const env = getServerEnv();
  const { backend, format } = modelConfig;

  if (backend === 'moonshot') {
    const apiKey = env.MOONSHOT_API_KEY;
    if (!apiKey) throw new Error('Missing MOONSHOT_API_KEY');
    return {
      apiKey,
      baseURL: 'https://api.moonshot.cn/v1',
      defaultHeaders: { 'User-Agent': 'aether' },
    };
  }

  if (backend === 'ikun') {
    if (format === 'anthropic') {
      const apiKey = env.ANTHROPIC_API_KEY_IKUNCODE;
      const baseURL = env.ANTHROPIC_BASE_URL_IKUNCODE;
      if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY_IKUNCODE');
      if (!baseURL) throw new Error('Missing ANTHROPIC_BASE_URL_IKUNCODE');
      return {
        apiKey,
        baseURL,
        defaultHeaders: {
          'User-Agent': 'aether',
          'anthropic-beta': 'interleaved-thinking-2025-05-14',
        },
      };
    }

    if (format === 'gemini') {
      const apiKey = env.GEMINI_API_KEY_IKUNCODE;
      const baseURL = env.GEMINI_BASE_URL_IKUNCODE;
      if (!apiKey) throw new Error('Missing GEMINI_API_KEY_IKUNCODE');
      if (!baseURL) throw new Error('Missing GEMINI_BASE_URL_IKUNCODE');
      return {
        apiKey,
        baseURL,
        defaultHeaders: { 'User-Agent': 'aether' },
      };
    }

    if (format === 'openai-responses') {
      const apiKey = env.OPENAI_API_KEY_IKUNCODE;
      const baseURL = env.ANTHROPIC_BASE_URL_IKUNCODE;
      if (!apiKey) throw new Error('Missing OPENAI_API_KEY_IKUNCODE');
      if (!baseURL) throw new Error('Missing ANTHROPIC_BASE_URL_IKUNCODE');
      return {
        apiKey,
        baseURL,
        defaultHeaders: { 'User-Agent': 'aether' },
      };
    }

    throw new Error(`Unsupported ikun protocol: ${format}`);
  }

  if (backend === 'openrouter') {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');
    return {
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'User-Agent': 'aether' },
    };
  }

  if (backend === 'gemini-aistudio') {
    const apiKey = env.GEMINI_API_KEY_AISTUDIO;
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY_AISTUDIO');
    return {
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com',
      defaultHeaders: { 'User-Agent': 'aether' },
    };
  }

  throw new Error(`Unknown backend: ${backend}`);
};
