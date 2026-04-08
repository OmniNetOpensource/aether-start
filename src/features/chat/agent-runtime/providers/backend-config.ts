import type { ChatBackend } from '@/features/chat/model-catalog';
import { getServerEnv } from '@/shared/worker/env';

export type BackendConfig = {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
};

export const buildSystemPrompt = () => {
  const now = new Date();
  const localDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const prompt = `
Today's date is: ${localDate}
No need to cite sources in your answers.
`;

  return `${prompt}
# When to search: Avoid searching in Chinese unless necessary; do not answer until you have enough context; if unsure, keep researching until you understand-do not just skim the surface, search deeply for information, and only answer after comprehensive research.

# When not to search: Known knowledge

- Learn to use Google search advanced techniques
`;
};

export const getBackendConfig = (backend: ChatBackend): BackendConfig => {
  const env = getServerEnv();

  if (backend === 'rightcode-claude') {
    const apiKey = env.ANTHROPIC_API_KEY_RIGHTCODE;
    const baseURL = env.ANTHROPIC_BASE_URL_RIGHTCODE;
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY_RIGHTCODE');
    if (!baseURL) throw new Error('Missing ANTHROPIC_BASE_URL_RIGHTCODE');
    return {
      apiKey,
      baseURL,
      defaultHeaders: {
        'User-Agent': 'aether',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
    };
  }

  if (backend === 'rightcode-claude-sale') {
    const apiKey = env.ANTHROPIC_API_KEY_RIGHTCODE_SALE;
    const baseURL = env.ANTHROPIC_BASE_URL_RIGHTCODE_SALE;
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY_RIGHTCODE_SALE');
    if (!baseURL) throw new Error('Missing ANTHROPIC_BASE_URL_RIGHTCODE_SALE');
    return {
      apiKey,
      baseURL,
      defaultHeaders: {
        'User-Agent': 'aether',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
    };
  }

  if (backend === 'rightcode-gemini') {
    const apiKey = env.GEMINI_API_KEY_RIGHTCODE;
    const baseURL = env.GEMINI_BASE_URL_RIGHTCODE;
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY_RIGHTCODE');
    if (!baseURL) throw new Error('Missing GEMINI_BASE_URL_RIGHTCODE');
    return {
      apiKey,
      baseURL,
      defaultHeaders: { 'User-Agent': 'aether' },
    };
  }

  if (backend === 'rightcode-openai') {
    const apiKey = env.OPENAI_API_KEY_RIGHTCODE;
    const baseURL = env.OPENAI_BASE_URL_RIGHTCODE;
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY_RIGHTCODE');
    if (!baseURL) throw new Error('Missing OPENAI_BASE_URL_RIGHTCODE');
    return {
      apiKey,
      baseURL,
      defaultHeaders: { 'User-Agent': 'aether' },
    };
  }

  if (backend === 'ikun') {
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

  if (backend === 'ikun-openai') {
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

  if (backend === 'ikun-gemini') {
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

  if (backend === 'dmx') {
    const apiKey = env.DMX_APIKEY;
    const baseURL = env.DMX_BASEURL;
    if (!apiKey) throw new Error('Missing DMX_APIKEY');
    if (!baseURL) throw new Error('Missing DMX_BASEURL');
    return {
      apiKey,
      baseURL,
      defaultHeaders: { 'User-Agent': 'aether' },
    };
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

  if (backend === 'cubence-claude') {
    const apiKey = env.CUBENCE_API_KEY;
    const baseURL = env.CUBENCE_BASE_URL;
    if (!apiKey) throw new Error('Missing CUBENCE_API_KEY');
    if (!baseURL) throw new Error('Missing CUBENCE_BASE_URL');
    return {
      apiKey,
      baseURL,
      defaultHeaders: {
        'User-Agent': 'aether',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
    };
  }

  if (backend === 'cubence-gemini') {
    const apiKey = env.CUBENCE_API_KEY;
    const baseURL = env.CUBENCE_BASE_URL;
    if (!apiKey) throw new Error('Missing CUBENCE_API_KEY');
    if (!baseURL) throw new Error('Missing CUBENCE_BASE_URL');
    return {
      apiKey,
      baseURL,
      defaultHeaders: { 'User-Agent': 'aether' },
    };
  }

  if (backend === 'cubence-openai') {
    const apiKey = env.CUBENCE_API_KEY;
    const baseURL = env.CUBENCE_BASE_URL;
    if (!apiKey) throw new Error('Missing CUBENCE_API_KEY');
    if (!baseURL) throw new Error('Missing CUBENCE_BASE_URL');
    return {
      apiKey,
      baseURL,
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
