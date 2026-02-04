import {
  ChatTool,
  ToolDefinition,
  ToolHandler,
  ToolProgressCallback,
} from "./types";

type FetchUrlArgs = {
  url: string;
  response_type: "markdown" | "image";
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

  const response_type = (args as { response_type?: unknown }).response_type;
  if (response_type !== "markdown" && response_type !== "image") {
    throw new Error("fetch_url requires response_type to be 'markdown' or 'image'");
  }

  return { url, response_type };
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

// Image URL detection
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico"];

const isDirectImageUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();

    // Check file extension
    if (IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
      return true;
    }

    // Check common image hosting patterns
    const imageHostPatterns = [
      /^i\.imgur\.com/,
      /^images\.unsplash\.com/,
      /^pbs\.twimg\.com/,
      /\.cloudinary\.com.*\/image\//,
      /\.githubusercontent\.com.*\.(png|jpg|jpeg|gif|webp)$/i,
    ];

    const host = parsedUrl.host.toLowerCase();
    const fullPath = host + pathname;

    return imageHostPatterns.some(pattern => pattern.test(fullPath));
  } catch {
    return false;
  }
};

// Image result type
type ImageResult = {
  type: "image";
  data_url: string;
  mime_type: string;
  size_bytes: number;
  source: "direct" | "screenshot";
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit

// Fetch direct image URL
const fetchDirectImage = async (
  url: string,
  onProgress?: ToolProgressCallback
): Promise<string> => {
  console.error("[Tools:fetch_url] Fetching direct image:", url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    await emitProgress(onProgress, {
      stage: "start",
      message: "开始获取图片...",
    });

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AetherBot/1.0)",
      },
    });

    if (!response.ok) {
      await emitProgress(onProgress, {
        stage: "error",
        message: `HTTP ${response.status} ${response.statusText}`,
      });
      return `Error: HTTP ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const contentLength = response.headers.get("content-length");

    if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE_BYTES) {
      const sizeMB = (parseInt(contentLength) / 1024 / 1024).toFixed(1);
      await emitProgress(onProgress, {
        stage: "error",
        message: `图片过大 (${sizeMB}MB 超过 5MB 限制)`,
      });
      return `Error: Image too large (${sizeMB}MB exceeds 5MB limit)`;
    }

    await emitProgress(onProgress, {
      stage: "receiving",
      message: "正在下载图片...",
    });

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
      await emitProgress(onProgress, {
        stage: "error",
        message: `图片过大 (${sizeMB}MB 超过 5MB 限制)`,
      });
      return `Error: Image too large (${sizeMB}MB exceeds 5MB limit)`;
    }

    await emitProgress(onProgress, {
      stage: "processing",
      message: "正在转换为 base64...",
      receivedBytes: arrayBuffer.byteLength,
    });

    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = contentType.split(";")[0].trim();
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
    await emitProgress(onProgress, {
      stage: "complete",
      message: `图片获取完成 (${sizeKB} KB)`,
      receivedBytes: arrayBuffer.byteLength,
    });

    console.error("[Tools:fetch_url] Direct image success, size:", arrayBuffer.byteLength, "bytes");

    const result: ImageResult = {
      type: "image",
      data_url: dataUrl,
      mime_type: mimeType,
      size_bytes: arrayBuffer.byteLength,
      source: "direct",
    };

    return JSON.stringify(result);
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
    console.error("[Tools:fetch_url] Direct image error:", message);
    await emitProgress(onProgress, {
      stage: "error",
      message: `获取图片失败：${message}`,
    });
    return `Error: ${message}`;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Fetch webpage screenshot via Jina
const fetchScreenshot = async (
  url: string,
  apiKey: string,
  onProgress?: ToolProgressCallback
): Promise<string> => {
  console.error("[Tools:fetch_url] Fetching screenshot for:", url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000); // Longer timeout for screenshots

  try {
    await emitProgress(onProgress, {
      stage: "start",
      message: "开始截取网页截图...",
    });

    const response = await fetch("https://r.jina.ai/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Return-Format": "pageshot",
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("[Tools:fetch_url] Screenshot HTTP error:", response.status, response.statusText);
      await emitProgress(onProgress, {
        stage: "error",
        message: `截图服务返回 HTTP ${response.status}`,
      });
      return `Error: Screenshot service returned HTTP ${response.status} ${response.statusText}`;
    }

    await emitProgress(onProgress, {
      stage: "receiving",
      message: "正在接收截图数据...",
    });

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
      await emitProgress(onProgress, {
        stage: "error",
        message: `截图过大 (${sizeMB}MB 超过 5MB 限制)`,
      });
      return `Error: Screenshot too large (${sizeMB}MB exceeds 5MB limit)`;
    }

    await emitProgress(onProgress, {
      stage: "processing",
      message: "正在转换为 base64...",
      receivedBytes: arrayBuffer.byteLength,
    });

    const contentType = response.headers.get("content-type") || "image/png";
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = contentType.split(";")[0].trim();
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
    await emitProgress(onProgress, {
      stage: "complete",
      message: `截图完成 (${sizeKB} KB)`,
      receivedBytes: arrayBuffer.byteLength,
    });

    console.error("[Tools:fetch_url] Screenshot success, size:", arrayBuffer.byteLength, "bytes");

    const result: ImageResult = {
      type: "image",
      data_url: dataUrl,
      mime_type: mimeType,
      size_bytes: arrayBuffer.byteLength,
      source: "screenshot",
    };

    return JSON.stringify(result);
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
    console.error("[Tools:fetch_url] Screenshot error:", message);
    await emitProgress(onProgress, {
      stage: "error",
      message: `截图失败：${message}`,
    });
    return `Error: ${message}`;
  } finally {
    clearTimeout(timeoutId);
  }
};

const performFetchUrl = async (
  url: string,
  apiKey: string,
  onProgress?: ToolProgressCallback
): Promise<string> => {
  const jinaUrl = `https://r.jina.ai/${url}`;
  console.error("[Tools:fetch_url] Fetching URL:", url, "via Jina:", jinaUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 80_000);

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
  const { url, response_type } = parseFetchUrlArgs(args);
  const apiKey = process.env.JINA_API_KEY;

  if (!apiKey) {
    console.error("[Tools:fetch_url] Missing JINA_API_KEY");
    return "Error: JINA_API_KEY is not set";
  }

  if (response_type === "image") {
    if (isDirectImageUrl(url)) {
      return enqueueFetchUrlCall(() => fetchDirectImage(url, onProgress));
    } else {
      return enqueueFetchUrlCall(() => fetchScreenshot(url, apiKey, onProgress));
    }
  }

  // markdown mode (existing behavior)
  return enqueueFetchUrlCall(() => performFetchUrl(url, apiKey, onProgress));
};

const fetchUrlSpec: ChatTool = {
  type: "function",
  function: {
    name: "fetch_url",
    description:
      "Fetch content from a URL with two response modes: 'markdown' converts webpage content to readable text (useful for reading articles, documentation, or API responses); 'image' returns visual content as base64 - either fetches direct image URLs (jpg, png, gif, etc.) or captures a full-page screenshot of webpages.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch",
          format: "uri",
        },
        response_type: {
          type: "string",
          enum: ["markdown", "image"],
          description: "Response format: 'markdown' for text content (converts HTML to readable text), 'image' for visual content (fetches images directly or captures webpage screenshots)",
        },
      },
      required: ["url", "response_type"],
    },
  },
};

export const fetchUrlTool: ToolDefinition = {
  spec: fetchUrlSpec,
  handler: fetchUrl,
};
