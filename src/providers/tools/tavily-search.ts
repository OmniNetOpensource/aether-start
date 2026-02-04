import {
  ChatTool,
  ToolDefinition,
  ToolHandler,
} from "./types";

type TavilySearchArgs = {
  query: string;
};

type TavilyResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  [key: string]: unknown;
};

type TavilySearchPayload = {
  query: string;
  results: Array<{
    title: string;
    url: string;
    description: string;
  }>;
  rawResults: TavilyResult[];
};

const parseTavilySearchArgs = (args: unknown): TavilySearchArgs => {
  if (!args || typeof args !== "object") {
    throw new Error("tavily_search requires an object with a query");
  }

  const { query } = args as { query?: unknown };

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("tavily_search requires a non-empty query string");
  }

  return { query };
};

const TAVILY_SEARCH_INTERVAL_MS = 2_000;
let lastTavilySearchAt = 0;
let tavilySearchQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const enqueueTavilySearchCall = async <T>(task: () => Promise<T>): Promise<T> => {
  const runTask = async () => {
    const now = Date.now();
    const elapsed = now - lastTavilySearchAt;

    if (elapsed < TAVILY_SEARCH_INTERVAL_MS) {
      const waitTime = TAVILY_SEARCH_INTERVAL_MS - elapsed;
      console.error(
        "[Tools:tavily_search] Throttling request, waiting",
        `${waitTime}ms`
      );
      await sleep(waitTime);
    }

    lastTavilySearchAt = Date.now();
    return task();
  };

  const queuedTask = tavilySearchQueue
    .catch(() => {})
    .then(runTask);

  tavilySearchQueue = queuedTask.then(() => {}).catch(() => {});
  return queuedTask;
};

const formatTavilySearchResponse = (
  query: string,
  data: { results?: TavilyResult[] }
): string => {
  const rawResults = Array.isArray(data.results) ? data.results : [];

  const results: TavilySearchPayload["results"] = rawResults
    .map((result) => {
      if (!result || typeof result !== "object") {
        return null;
      }

      const title =
        typeof result.title === "string" && result.title.trim().length > 0
          ? result.title
          : "";
      const url =
        typeof result.url === "string" && result.url.trim().length > 0
          ? result.url
          : "";
      const description =
        typeof result.content === "string" ? result.content : "";

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
    )
    .slice(0, 10);

  const payload: TavilySearchPayload = {
    query,
    results,
    rawResults: rawResults.slice(0, 10),
  };

  return JSON.stringify(payload);
};

const performTavilySearch = async (
  query: string,
  apiKey: string
): Promise<string> => {
  console.error("[Tools:tavily_search] Searching:", query);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 10,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        "[Tools:tavily_search] API error:",
        response.status,
        response.statusText
      );
      return `Tavily API error: ${response.status} ${response.statusText}`;
    }

    const data = (await response.json()) as { results?: TavilyResult[] };
    return formatTavilySearchResponse(query, data);
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
    console.error("[Tools:tavily_search] Error:", message);
    return `Tavily Search error: ${message}`;
  } finally {
    clearTimeout(timeoutId);
  }
};

const tavilySearch: ToolHandler = async (args) => {
  const { query } = parseTavilySearchArgs(args);
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    console.error("[Tools:tavily_search] Missing TAVILY_API_KEY");
    return "Error: TAVILY_API_KEY is not set";
  }

  return enqueueTavilySearchCall(() => performTavilySearch(query, apiKey));
};

const tavilySearchSpec: ChatTool = {
  type: "function",
  function: {
    name: "tavily_search",
    description:
      "Search the web using Tavily API, optimized for AI agents and LLMs. Get comprehensive, real-time search results with high-quality content extraction.",
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

export const tavilySearchTool: ToolDefinition = {
  spec: tavilySearchSpec,
  handler: tavilySearch,
};
