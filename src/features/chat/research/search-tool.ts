import { ChatTool, ToolDefinition, ToolHandler } from '../agent-runtime/tool-types';
import {
  stringifySearchClientPayload,
  type SearchClientResult,
} from '@/features/chat/research/search-result-payload';
import { log } from '@/features/chat/agent-runtime';
import { getServerEnv } from '@/shared/worker/env';

type SearchArgs = {
  query: string;
};

type SearchResult = {
  title?: unknown;
  link?: unknown;
  snippet?: unknown;
  [key: string]: unknown;
};

type SearchPayload = {
  client: {
    results: SearchClientResult[];
  };
  ai: string;
};

type NormalizedSearchResult = {
  title: string;
  url: string;
  description: string;
};

const normalizeSearchResult = (result: SearchResult): NormalizedSearchResult | null => {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const url =
    typeof result.link === 'string' && result.link.trim().length > 0 ? result.link.trim() : '';

  if (!url) {
    return null;
  }

  const title =
    typeof result.title === 'string' && result.title.trim().length > 0 ? result.title.trim() : url;
  const description = typeof result.snippet === 'string' ? result.snippet : '';

  return {
    title,
    url,
    description,
  };
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

export const formatSearchResponse = async (data: { organic?: SearchResult[] }): Promise<string> => {
  const rawResults = Array.isArray(data.organic) ? data.organic : [];
  const normalizedResults = rawResults
    .map((result) => normalizeSearchResult(result))
    .filter((result): result is NormalizedSearchResult => Boolean(result));
  const clientResults: SearchClientResult[] = normalizedResults.map((result) => ({
    title: result.title,
    url: result.url,
  }));

  const payload: SearchPayload = {
    client: {
      results: clientResults,
    },
    ai: buildAiMarkdown(normalizedResults),
  };

  return JSON.stringify({
    client: JSON.parse(stringifySearchClientPayload(payload.client)),
    ai: payload.ai,
  });
};

const parseSearchArgs = (args: unknown): SearchArgs => {
  if (!args || typeof args !== 'object') {
    throw new Error('search requires an object with a query');
  }

  const { query } = args as { query?: unknown };

  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('search requires a non-empty query string');
  }

  return { query };
};

const SEARCH_INTERVAL_MS = 2_000;
let lastSearchAt = 0;
let searchQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const enqueueSearchCall = async <T>(task: () => Promise<T>): Promise<T> => {
  const waitForTurn = searchQueue;
  let releaseQueue = () => {};
  searchQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await waitForTurn;

  const runTask = async () => {
    const now = Date.now();
    const elapsed = now - lastSearchAt;

    if (elapsed < SEARCH_INTERVAL_MS) {
      const waitTime = SEARCH_INTERVAL_MS - elapsed;
      await sleep(waitTime);
    }

    lastSearchAt = Date.now();
    return task();
  };

  try {
    return await runTask();
  } finally {
    releaseQueue();
  }
};

const performSearch = async (
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> => {
  const myHeaders = new Headers();
  myHeaders.append('X-API-KEY', apiKey);
  myHeaders.append('Content-Type', 'application/json');

  const raw = JSON.stringify({
    q: query,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  const linkedAbort = () => controller.abort();
  signal?.addEventListener('abort', linkedAbort);

  const requestOptions: RequestInit = {
    method: 'POST',
    headers: myHeaders,
    body: raw,
    redirect: 'follow',
    signal: controller.signal,
  };

  try {
    const response = await fetch('https://google.serper.dev/search', requestOptions);

    if (!response.ok) {
      log('SEARCH', `API error: ${response.status} ${response.statusText}`);
      return `Search API error: ${response.status} ${response.statusText}`;
    }

    const data = (await response.json()) as { organic?: SearchResult[] };
    return await formatSearchResponse(data);
  } catch (error) {
    const isAbortError =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError';
    const message = isAbortError
      ? 'Request timed out'
      : typeof error === 'object' && error !== null
        ? (error as Error).message
        : String(error);
    log('SEARCH', `Error: ${message}`);
    return `Search error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort);
    clearTimeout(timeoutId);
  }
};

const search: ToolHandler = async (args, signal) => {
  const { query } = parseSearchArgs(args);
  const { SERP_API_KEY: apiKey } = getServerEnv();

  if (!apiKey) {
    log('SEARCH', 'Missing SERP_API_KEY');
    return 'Error: SERP_API_KEY is not set';
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return enqueueSearchCall(() => performSearch(query, apiKey, signal));
};

const searchSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'search',
    description: 'Search the web using Google Search',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
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
