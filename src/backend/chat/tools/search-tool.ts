import { isAbortError } from '@/backend/chat/abort';
import type { ChatTool, ToolDefinition, ToolHandler } from '@/shared/chat/tool-types';
import type { SearchClientResult } from '@/shared/chat/research/search-result-payload';
import { log } from '@/backend/chat/logger';
import { getServerEnv } from '@/backend/platform/cloudflare/env';
import { requestJustOneApi } from './shared/justone-api';
import { createRateLimitedQueue } from './shared/rate-limit';

type SearchPlatform = 'google' | 'weixin' | 'rednote';

type SearchArgs = {
  query: string;
  platform: SearchPlatform;
};

type NormalizedSearchResult = {
  title: string;
  url: string;
  description: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const readWeixinText = (value: unknown) => readString(value).replace(/<[^>]*>/g, '');

const normalizeGoogleResult = (result: unknown): NormalizedSearchResult | null => {
  if (!isRecord(result)) {
    return null;
  }

  const url = readString(result.link);
  if (!url) {
    return null;
  }

  return {
    title: readString(result.title) || url,
    url,
    description: readString(result.snippet),
  };
};

const normalizeWeixinResults = (data: unknown): NormalizedSearchResult[] | null => {
  if (!isRecord(data) || !Array.isArray(data.data)) {
    return null;
  }

  const results: NormalizedSearchResult[] = [];

  for (const group of data.data) {
    if (!isRecord(group) || !Array.isArray(group.items)) {
      continue;
    }

    for (const item of group.items) {
      if (!isRecord(item)) {
        continue;
      }

      const url = readString(item.doc_url);
      if (!url) {
        continue;
      }

      results.push({
        title: readWeixinText(item.title) || url,
        url,
        description: readWeixinText(item.desc),
      });
    }
  }

  return results;
};

const normalizeRednoteResults = (data: unknown): NormalizedSearchResult[] | null => {
  if (!isRecord(data) || !Array.isArray(data.notes)) {
    return null;
  }

  const results: NormalizedSearchResult[] = [];

  for (const note of data.notes) {
    if (!isRecord(note)) {
      continue;
    }

    const id = readString(note.id);
    const title = readString(note.title);
    if (!id || !title) {
      continue;
    }

    const url = `https://www.xiaohongshu.com/explore/${encodeURIComponent(id)}`;
    results.push({
      title,
      url,
      description: readString(note.desc),
    });
  }

  return results;
};

const buildAiMarkdown = (results: NormalizedSearchResult[]): string => {
  if (results.length === 0) {
    return 'No valid search results.';
  }

  return results
    .map(
      (result, index) =>
        `[${index + 1}]title: ${result.title}\n` +
        `[${index + 1}]description: ${result.description}\n` +
        `[${index + 1}]url: ${result.url}`,
    )
    .join('\n\n');
};

const formatNormalizedSearchResponse = (normalizedResults: NormalizedSearchResult[]): string => {
  const clientResults: SearchClientResult[] = normalizedResults.map((result) => ({
    title: result.title,
    url: result.url,
  }));

  return JSON.stringify({
    client: {
      results: clientResults,
    },
    ai: buildAiMarkdown(normalizedResults),
  });
};

const parseSearchArgs = (args: unknown): SearchArgs => {
  if (!isRecord(args)) {
    throw new Error('search requires an object with a query');
  }

  const query = readString(args.query);
  if (!query) {
    throw new Error('search requires a non-empty query string');
  }

  if (
    args.platform !== undefined &&
    args.platform !== 'google' &&
    args.platform !== 'weixin' &&
    args.platform !== 'rednote'
  ) {
    throw new Error('search platform must be google, weixin, or rednote');
  }

  return {
    query,
    platform: args.platform ?? 'google',
  };
};

const enqueueSearchCall = createRateLimitedQueue(2_000);

const performGoogleSearch = async (
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  const linkedAbort = () => controller.abort();
  signal?.addEventListener('abort', linkedAbort);

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query }),
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      log('SEARCH', `API error: ${response.status} ${response.statusText}`);
      return `Error: Search API returned HTTP ${response.status} ${response.statusText}`;
    }

    const data: unknown = await response.json();
    const rawResults = isRecord(data) && Array.isArray(data.organic) ? data.organic : [];
    const normalizedResults = rawResults
      .map((result) => normalizeGoogleResult(result))
      .filter((result): result is NormalizedSearchResult => result !== null);
    return formatNormalizedSearchResponse(normalizedResults);
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const message = isAbortError(error)
      ? 'Request timed out'
      : error instanceof Error
        ? error.message
        : String(error);
    log('SEARCH', `Error: ${message}`);
    return `Error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort);
    clearTimeout(timeoutId);
  }
};

const search: ToolHandler = async (args, signal) => {
  const { query, platform } = parseSearchArgs(args);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (platform === 'google') {
    const { SERP_API_KEY: apiKey } = getServerEnv();
    if (!apiKey) {
      log('SEARCH', 'Missing SERP_API_KEY');
      return 'Error: SERP_API_KEY is not set';
    }

    return enqueueSearchCall(() => performGoogleSearch(query, apiKey, signal));
  }

  const response =
    platform === 'weixin'
      ? await requestJustOneApi(
          {
            endpoint: '/api/weixin/search-article/v1',
            method: 'POST',
            parameters: new URLSearchParams({
              keyword: query,
              publishTimeType: 'ALL',
              sortType: 'COMPREHENSIVE',
              currentPage: '1',
              offset: '0',
              cookies_buffer: '',
            }),
          },
          signal,
        )
      : await requestJustOneApi(
          {
            endpoint: '/api/xiaohongshu/search-note/v4',
            method: 'GET',
            parameters: new URLSearchParams({
              keyword: query,
              page: '1',
              sortType: 'general',
              noteType: 'ALL',
              timeFilter: 'ALL',
            }),
          },
          signal,
        );

  if (!response.ok) {
    return `Error: ${response.error}`;
  }

  const normalizedResults =
    platform === 'weixin'
      ? normalizeWeixinResults(response.data)
      : normalizeRednoteResults(response.data);

  if (!normalizedResults) {
    log('SEARCH', `Invalid ${platform} search response`);
    return `Error: Invalid ${platform} search response`;
  }

  return formatNormalizedSearchResponse(normalizedResults);
};

const searchSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'search',
    description: 'Search Google, Weixin Official Account articles, or RedNote notes',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        platform: {
          type: 'string',
          enum: ['google', 'weixin', 'rednote'],
          default: 'google',
          description: 'Search platform. Omit for Google.',
        },
      },
      required: ['query'],
    },
  },
};

export const searchTool: ToolDefinition = {
  spec: searchSpec,
  handler: search,
};
