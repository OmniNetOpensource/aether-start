import { ChatTool, ToolDefinition, ToolHandler } from "./types";
import { getLogger } from "@/server/agents/services/logger";
import { getServerEnv } from '@/server/env'

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
  query: string;
  results: Array<{
    title: string;
    url: string;
    description: string;
  }>;
  rawResults: SearchResult[];
};

const parseSearchArgs = (args: unknown): SearchArgs => {
  if (!args || typeof args !== "object") {
    throw new Error("search requires an object with a query");
  }

  const { query } = args as { query?: unknown };

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("search requires a non-empty query string");
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

  const queuedTask = searchQueue.catch(() => {}).then(runTask);

  searchQueue = queuedTask.then(() => {}).catch(() => {});
  return queuedTask;
};

const formatSearchResponse = (
  query: string,
  data: { organic?: SearchResult[] },
): string => {
  const rawResults = Array.isArray(data.organic) ? data.organic : [];

  const results: SearchPayload["results"] = rawResults
    .map((result) => {
      if (!result || typeof result !== "object") {
        return null;
      }

      const title =
        typeof result.title === "string" && result.title.trim().length > 0
          ? result.title
          : "";
      const url =
        typeof result.link === "string" && result.link.trim().length > 0
          ? result.link
          : "";
      const description =
        typeof result.snippet === "string" ? result.snippet : "";

      if (!title && !url) {
        return null;
      }

      return {
        title: title || url,
        url,
        description,
      };
    })
    .filter(
      (
        result,
      ): result is {
        title: string;
        url: string;
        description: string;
      } => Boolean(result && result.url),
    );

  const payload: SearchPayload = {
    query,
    results,
    rawResults,
  };

  return JSON.stringify(payload);
};

const performSearch = async (
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> => {
  const myHeaders = new Headers();
  myHeaders.append("X-API-KEY", apiKey);
  myHeaders.append("Content-Type", "application/json");

  const raw = JSON.stringify({
    q: query,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  const linkedAbort = () => controller.abort()
  signal?.addEventListener('abort', linkedAbort)

  const requestOptions: RequestInit = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
    signal: controller.signal,
  };

  try {
    const response = await fetch(
      "https://google.serper.dev/search",
      requestOptions,
    );

    if (!response.ok) {
      getLogger().log(
        "SEARCH",
        `API error: ${response.status} ${response.statusText}`,
      );
      return `Search API error: ${response.status} ${response.statusText}`;
    }

    const data = (await response.json()) as { organic?: SearchResult[] };
    return formatSearchResponse(query, data);
  } catch (error) {
    const isAbortError =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError";
    const message = isAbortError
      ? "Request timed out"
      : typeof error === "object" && error !== null
        ? (error as Error).message
        : String(error);
    getLogger().log("SEARCH", `Error: ${message}`);
    return `Search error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort)
    clearTimeout(timeoutId);
  }
};

const search: ToolHandler = async (args, _onProgress, signal) => {
  const { query } = parseSearchArgs(args);
  const { SERP_API_KEY: apiKey } = getServerEnv()

  if (!apiKey) {
    getLogger().log("SEARCH", "Missing SERP_API_KEY");
    return "Error: SERP_API_KEY is not set";
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  return enqueueSearchCall(() => performSearch(query, apiKey, signal));
};

const searchSpec: ChatTool = {
  type: "function",
  function: {
    name: "search",
    description: "Search the web using Google Search",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
};

export const searchTool: ToolDefinition = {
  spec: searchSpec,
  handler: search,
};
