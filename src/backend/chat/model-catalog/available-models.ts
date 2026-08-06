import { z } from 'zod';
import { getServerEnv } from '@/backend/platform/cloudflare/env';
import {
  createModelId,
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_INFO,
  IKUN_BASE_URL,
  type ChatBackend,
} from '@/shared/chat/model-catalog';

const modelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      display_name: z.string().optional(),
    }),
  ),
});

const geminiModelListSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      displayName: z.string(),
      supportedGenerationMethods: z.array(z.string()).nullable(),
    }),
  ),
  nextPageToken: z.string().nullish(),
});

const availableModelsSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
  }),
);

const MODEL_LIST_CACHE_TTL_SECONDS = 60 * 60;

const toModelInfo = (backend: ChatBackend, provider: string, model: string, name?: string) => {
  if (backend === 'ikun' && model === 'claude-opus-4-6') {
    return DEFAULT_MODEL_INFO;
  }

  return {
    id: createModelId(backend, model),
    name: `${name ?? model}+${provider}`,
  };
};

const fetchModelList = async (
  provider: string,
  backend: ChatBackend,
  url: string,
  headers: Record<string, string>,
) => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${provider} model list request failed: ${response.status}`);
  }

  return modelListSchema
    .parse(await response.json())
    .data.map((model) =>
      toModelInfo(backend, provider, model.id, model.name ?? model.display_name),
    );
};

const fetchGeminiModelList = async (
  provider: string,
  backend: ChatBackend,
  baseURL: string,
  apiKey: string,
) => {
  const models: { id: string; name: string }[] = [];
  let pageToken: string | null | undefined;

  do {
    const url = new URL(`${baseURL.replace(/\/$/, '')}/v1beta/models`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${provider} model list request failed: ${response.status}`);
    }

    const page = geminiModelListSchema.parse(await response.json());
    models.push(
      ...page.models
        .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model) =>
          toModelInfo(backend, provider, model.name.replace(/^models\//, ''), model.displayName),
        ),
    );
    pageToken = page.nextPageToken;
  } while (pageToken);

  return models;
};

export const getAvailableModels = async () => {
  const cacheKey = 'https://aether-model-list.invalid/v1';
  const modelListCache = await caches.open('aether:model-list:v1');
  const cachedResponse = await modelListCache.match(cacheKey);
  if (cachedResponse) {
    return availableModelsSchema.parse(await cachedResponse.json());
  }

  const env = getServerEnv();
  const requests: Promise<{ id: string; name: string }[]>[] = [];

  if (env.ANTHROPIC_API_KEY_IKUNCODE) {
    requests.push(
      fetchModelList('ikun', 'ikun', `${IKUN_BASE_URL}/v1/models`, {
        Authorization: `Bearer ${env.ANTHROPIC_API_KEY_IKUNCODE}`,
        'x-api-key': env.ANTHROPIC_API_KEY_IKUNCODE,
        'anthropic-version': '2023-06-01',
      }),
    );
  }

  if (env.OPENAI_API_KEY_IKUNCODE) {
    requests.push(
      fetchModelList('ikun', 'ikun', `${IKUN_BASE_URL}/v1/models`, {
        Authorization: `Bearer ${env.OPENAI_API_KEY_IKUNCODE}`,
      }),
    );
  }

  const ikunGeminiApiKey = env.GEMINI_API_KEY_IKUNCODE;
  const ikunGeminiBaseURL = env.GEMINI_BASE_URL_IKUNCODE;
  if (ikunGeminiApiKey && ikunGeminiBaseURL) {
    requests.push(fetchGeminiModelList('ikun', 'ikun', ikunGeminiBaseURL, ikunGeminiApiKey));
  }

  const aiStudioApiKey = env.GEMINI_API_KEY_AISTUDIO;
  if (aiStudioApiKey) {
    requests.push(
      fetchGeminiModelList(
        'aistudio',
        'gemini-aistudio',
        'https://generativelanguage.googleapis.com',
        aiStudioApiKey,
      ),
    );
  }

  if (env.MOONSHOT_API_KEY) {
    requests.push(
      fetchModelList('moonshot', 'moonshot', 'https://api.moonshot.cn/v1/models', {
        Authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
      }),
    );
  }

  if (env.OPENROUTER_API_KEY) {
    requests.push(
      fetchModelList('openrouter', 'openrouter', 'https://openrouter.ai/api/v1/models', {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      }),
    );
  }

  const models = new Map((await Promise.all(requests)).flat().map((model) => [model.id, model]));
  models.delete(DEFAULT_MODEL_ID);
  const availableModels = [DEFAULT_MODEL_INFO, ...models.values()];

  await modelListCache.put(
    cacheKey,
    new Response(JSON.stringify(availableModels), {
      headers: {
        'Cache-Control': `public, max-age=${MODEL_LIST_CACHE_TTL_SECONDS}`,
        'Content-Type': 'application/json',
      },
    }),
  );

  return availableModels;
};
