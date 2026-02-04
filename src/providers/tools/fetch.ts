import {
  ChatTool,
  ToolDefinition,
  ToolHandler,
  ToolProgressCallback,
} from "./types";

type FetchUrlArgs = {
  url: string;
};

const parseFetchUrlArgs = (args: unknown): FetchUrlArgs => {
  if (!args || typeof args !== "object") {
    throw new Error("fetch_url requires an object with a URL");
  }

  const url = (args as { url?: unknown }).url;
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error("fetch_url requires a non-empty URL string");
  }

  try {
    new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  return { url };
};

const FETCH_URL_INTERVAL_MS = 2_000;
let lastFetchUrlAt = 0;
let fetchUrlQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const enqueueFetchUrlCall = async <T>(task: () => Promise<T>): Promise<T> => {
  const runTask = async () => {
    const now = Date.now();
    const elapsed = now - lastFetchUrlAt;

    if (elapsed < FETCH_URL_INTERVAL_MS) {
      const waitTime = FETCH_URL_INTERVAL_MS - elapsed;
      console.error(
        "[Tools:fetch_url] Throttling request, waiting",
        `${waitTime}ms`
      );
      await sleep(waitTime);
    }

    lastFetchUrlAt = Date.now();
    return task();
  };

  const queuedTask = fetchUrlQueue
    .catch(() => {})
    .then(runTask);

  fetchUrlQueue = queuedTask.then(() => {}).catch(() => {});
  return queuedTask;
};

const PROGRESS_CHUNK_BYTES = 50 * 1024;
const PROGRESS_INTERVAL_MS = 500;

const formatKilobytes = (bytes: number) => (bytes / 1024).toFixed(1);

const emitProgress = async (
  onProgress: ToolProgressCallback | undefined,
  update: Parameters<ToolProgressCallback>[0]
) => {
  if (onProgress) {
    await onProgress(update);
  }
};

const readStreamWithProgress = async (
  response: Response,
  onProgress?: ToolProgressCallback
): Promise<string> => {
  if (!response.body) {
    const text = await response.text();
    await emitProgress(onProgress, {
      stage: "complete",
      message: `接收完成，总计 ${formatKilobytes(text.length)} KB`,
      receivedBytes: text.length,
    });
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let result = "";
  let receivedBytes = 0;
  const totalBytesHeader = response.headers.get("content-length");
  const totalBytes =
    totalBytesHeader && !Number.isNaN(Number(totalBytesHeader))
      ? Number(totalBytesHeader)
      : undefined;
  let lastReportedBytes = 0;
  let lastReportedTime = Date.now();

  await emitProgress(onProgress, {
    stage: "receiving",
    message: "已连接，开始接收数据...",
    receivedBytes,
    totalBytes,
  });

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    receivedBytes += value.byteLength;
    result += decoder.decode(value, { stream: true });

    const now = Date.now();
    if (
      receivedBytes - lastReportedBytes >= PROGRESS_CHUNK_BYTES ||
      now - lastReportedTime >= PROGRESS_INTERVAL_MS
    ) {
      lastReportedBytes = receivedBytes;
      lastReportedTime = now;

      await emitProgress(onProgress, {
        stage: "receiving",
        message: `正在接收数据 (${formatKilobytes(receivedBytes)} KB${
          totalBytes !== undefined ? ` / ${formatKilobytes(totalBytes)} KB` : ""
        })`,
        receivedBytes,
        totalBytes,
      });
    }
  }

  result += decoder.decode();

  await emitProgress(onProgress, {
    stage: "complete",
    message: `接收完成，总计 ${formatKilobytes(receivedBytes)} KB${
      totalBytes !== undefined ? ` / ${formatKilobytes(totalBytes)} KB` : ""
    }`,
    receivedBytes,
    totalBytes,
  });

  return result;
};

const performFetchUrl = async (
  url: string,
  apiKey: string,
  onProgress?: ToolProgressCallback
): Promise<string> => {
  const jinaUrl = `https://r.jina.ai/${url}`;
  console.error("[Tools:fetch_url] Fetching URL:", url, "via Jina:", jinaUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    await emitProgress(onProgress, {
      stage: "start",
      message: "开始连接 Jina AI Reader...",
    });

    const jinaResponse = await fetch(jinaUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Token-Budget": "30000",
      },
      signal: controller.signal,
    });

    if (!jinaResponse.ok) {
      console.error(
        "[Tools:fetch_url] Jina AI Reader HTTP error:",
        jinaResponse.status,
        jinaResponse.statusText
      );
      await emitProgress(onProgress, {
        stage: "error",
        message: `Jina AI Reader 返回 HTTP ${jinaResponse.status}`,
      });
      return `Error: HTTP ${jinaResponse.status} ${jinaResponse.statusText}`;
    }

    const jinaText = await readStreamWithProgress(jinaResponse, onProgress);
    console.error(
      "[Tools:fetch_url] Jina AI Reader success, text length:",
      jinaText.length,
      "bytes"
    );

    return jinaText;
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
    console.error("[Tools:fetch_url] Error:", message);
    await emitProgress(onProgress, {
      stage: "error",
      message: `请求失败：${message}`,
    });
    return `Error: ${message}`;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchUrl: ToolHandler = async (args, onProgress) => {
  const { url } = parseFetchUrlArgs(args);
  const apiKey = process.env.JINA_API_KEY;

  if (!apiKey) {
    console.error("[Tools:fetch_url] Missing JINA_API_KEY");
    return "Error: JINA_API_KEY is not set";
  }

  return enqueueFetchUrlCall(() => performFetchUrl(url, apiKey, onProgress));
};

const fetchUrlSpec: ChatTool = {
  type: "function",
  function: {
    name: "fetch_url",
    description:
      "Fetch more detailed content from a URL and convert it to plain text. Useful for reading web pages, documentation, or API responses.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch",
          format: "uri",
        },
      },
      required: ["url"],
    },
  },
};

export const fetchUrlTool: ToolDefinition = {
  spec: fetchUrlSpec,
  handler: fetchUrl,
};
