import {
  ChatTool,
  ToolDefinition,
  ToolHandler,
} from "./types";

type SerperSearchArgs = {
  query: string;
};

type SerperResult = {
  title?: unknown;
  link?: unknown;
  snippet?: unknown;
  [key: string]: unknown;
};

type SerperSearchPayload = {
  query: string;
  results: Array<{
    title: string;
    url: string;
    description: string;
  }>;
  rawResults: SerperResult[];
};

const parseSerperSearchArgs = (args: unknown): SerperSearchArgs => {
  if (!args || typeof args !== "object") {
    throw new Error("serper_search requires an object with a query");
  }

  const { query } = args as { query?: unknown };

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("serper_search requires a non-empty query string");
  }

  return { query };
};

const SERPER_SEARCH_INTERVAL_MS = 2_000;
let lastSerperSearchAt = 0;
let serperSearchQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const enqueueSerperSearchCall = async <T>(task: () => Promise<T>): Promise<T> => {
  const runTask = async () => {
    const now = Date.now();
    const elapsed = now - lastSerperSearchAt;

    if (elapsed < SERPER_SEARCH_INTERVAL_MS) {
      const waitTime = SERPER_SEARCH_INTERVAL_MS - elapsed;
      console.error(
        "[Tools:serper_search] Throttling request, waiting",
        `${waitTime}ms`
      );
      await sleep(waitTime);
    }

    lastSerperSearchAt = Date.now();
    return task();
  };

  const queuedTask = serperSearchQueue
    .catch(() => {})
    .then(runTask);

  serperSearchQueue = queuedTask.then(() => {}).catch(() => {});
  return queuedTask;
};

const formatSerperSearchResponse = (
  query: string,
  data: { organic?: SerperResult[] }
): string => {
  const rawResults = Array.isArray(data.organic) ? data.organic : [];

  const results: SerperSearchPayload["results"] = rawResults
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
        result
      ): result is {
        title: string;
        url: string;
        description: string;
      } => Boolean(result && result.url)
    );

  const payload: SerperSearchPayload = {
    query,
    results,
    rawResults,
  };

  return JSON.stringify(payload);
};

const performSerperSearch = async (
  query: string,
  apiKey: string
): Promise<string> => {
  console.error("[Tools:serper_search] Searching:", query);

  const myHeaders = new Headers();
  myHeaders.append("X-API-KEY", apiKey);
  myHeaders.append("Content-Type", "application/json");

  const raw = JSON.stringify({
    q: query,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

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
      requestOptions
    );

    if (!response.ok) {
      console.error(
        "[Tools:serper_search] API error:",
        response.status,
        response.statusText
      );
      return `Serper API error: ${response.status} ${response.statusText}`;
    }

    const data = (await response.json()) as { organic?: SerperResult[] };
    return formatSerperSearchResponse(query, data);
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
    console.error("[Tools:serper_search] Error:", message);
    return `Serper Search error: ${message}`;
  } finally {
    clearTimeout(timeoutId);
  }
};

const serperSearch: ToolHandler = async (args) => {
  const { query } = parseSerperSearchArgs(args);
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) {
    console.error("[Tools:serper_search] Missing SERP_API_KEY");
    return "Error: SERP_API_KEY is not set";
  }

  return enqueueSerperSearchCall(() => performSerperSearch(query, apiKey));
};

const serperSearchSpec: ChatTool = {
  type: "function",
  function: {
    name: "serper_search",
    description:
      "Search the web using Serper.dev Google Search API for fast, relevant results.",
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

export const serperSearchTool: ToolDefinition = {
  spec: serperSearchSpec,
  handler: serperSearch,
};
