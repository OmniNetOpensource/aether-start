import {
  ChatTool,
  ToolDefinition,
  ToolHandler,
  ToolProgressCallback,
} from "./types";
import { getLogger } from "@/features/chat/api/server/services/logger";
import { Supadata } from "@supadata/js";
import { getServerEnv } from '@/server/env'
import { arrayBufferToBase64 } from '@/server/base64'

type FetchUrlArgs = {
  url: string;
  response_type: "markdown" | "image" | "youtube";
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
  if (
    response_type !== "markdown" &&
    response_type !== "image" &&
    response_type !== "youtube"
  ) {
    throw new Error(
      "fetch_url requires response_type to be 'markdown', 'image', or 'youtube'",
    );
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
      getLogger().log(
        "FETCH",
        `Throttling request, waiting ${waitTime}ms`,
      );
      await sleep(waitTime);
    }

    lastFetchUrlAt = Date.now();
    return task();
  };

  const queuedTask = fetchUrlQueue.catch(() => {}).then(runTask);

  fetchUrlQueue = queuedTask.then(() => {}).catch(() => {});
  return queuedTask;
};

const formatKilobytes = (bytes: number) => (bytes / 1024).toFixed(1);

const emitProgress = async (
  onProgress: ToolProgressCallback | undefined,
  update: Parameters<ToolProgressCallback>[0],
) => {
  if (onProgress) {
    await onProgress(update);
  }
};

// Image URL detection
const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".ico",
];

const isDirectImageUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();

    // Check file extension
    if (IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
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

    return imageHostPatterns.some((pattern) => pattern.test(fullPath));
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
const JINA_ENGINE_HEADER = {
  "X-Engine": "browser",
};

// Fetch direct image URL
const fetchDirectImage = async (
  url: string,
  onProgress?: ToolProgressCallback,
  signal?: AbortSignal,
): Promise<string> => {
  getLogger().log("FETCH", `Fetching direct image: ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const linkedAbort = () => controller.abort()
  signal?.addEventListener('abort', linkedAbort)

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

    const base64 = arrayBufferToBase64(arrayBuffer)
    const mimeType = contentType.split(";")[0].trim();
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
    await emitProgress(onProgress, {
      stage: "complete",
      message: `图片获取完成 (${sizeKB} KB)`,
      receivedBytes: arrayBuffer.byteLength,
    });

    getLogger().log(
      "FETCH",
      `Direct image success, size: ${arrayBuffer.byteLength} bytes`,
    );

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
    getLogger().log("FETCH", `Direct image error: ${message}`);
    await emitProgress(onProgress, {
      stage: "error",
      message: `获取图片失败：${message}`,
    });
    return `Error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort)
    clearTimeout(timeoutId);
  }
};

// Fetch webpage screenshot via Jina
const fetchScreenshot = async (
  url: string,
  apiKey: string,
  onProgress?: ToolProgressCallback,
  signal?: AbortSignal,
): Promise<string> => {
  getLogger().log("FETCH", `Fetching screenshot for: ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000); // Longer timeout for screenshots
  const linkedAbort = () => controller.abort()
  signal?.addEventListener('abort', linkedAbort)

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
        ...JINA_ENGINE_HEADER,
        "X-Timeout": "20",
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (!response.ok) {
      getLogger().log(
        "FETCH",
        `Screenshot HTTP error: ${response.status} ${response.statusText}`,
      );
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
    const base64 = arrayBufferToBase64(arrayBuffer)
    const mimeType = contentType.split(";")[0].trim();
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
    await emitProgress(onProgress, {
      stage: "complete",
      message: `截图完成 (${sizeKB} KB)`,
      receivedBytes: arrayBuffer.byteLength,
    });

    getLogger().log(
      "FETCH",
      `Screenshot success, size: ${arrayBuffer.byteLength} bytes`,
    );

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
    getLogger().log("FETCH", `Screenshot error: ${message}`);
    await emitProgress(onProgress, {
      stage: "error",
      message: `截图失败：${message}`,
    });
    return `Error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort)
    clearTimeout(timeoutId);
  }
};

const performFetchUrl = async (
  url: string,
  apiKey: string,
  onProgress?: ToolProgressCallback,
  signal?: AbortSignal,
): Promise<string> => {
  const jinaUrl = `https://r.jina.ai/${url}`;
  getLogger().log("FETCH", `Fetching URL: ${url} via Jina: ${jinaUrl}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 80_000);
  const linkedAbort = () => controller.abort()
  signal?.addEventListener('abort', linkedAbort)

  try {
    const jinaResponse = await fetch(jinaUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Token-Budget": "200000",
        ...JINA_ENGINE_HEADER,
        "X-Timeout": "20",
      },
      signal: controller.signal,
    });

    if (!jinaResponse.ok) {
      getLogger().log(
        "FETCH",
        `Jina AI Reader HTTP error: ${jinaResponse.status} ${jinaResponse.statusText}`,
      );
      await emitProgress(onProgress, {
        stage: "error",
        message: `Jina AI Reader 返回 HTTP ${jinaResponse.status}`,
      });
      return `Error: HTTP ${jinaResponse.status} ${jinaResponse.statusText}`;
    }

    const totalBytesHeader = jinaResponse.headers.get("content-length");
    const totalBytes =
      totalBytesHeader && !Number.isNaN(Number(totalBytesHeader))
        ? Number(totalBytesHeader)
        : undefined;
    const jinaText = await jinaResponse.text();
    const receivedBytes = new TextEncoder().encode(jinaText).byteLength
    await emitProgress(onProgress, {
      stage: "complete",
      message: `接收完成，总计 ${formatKilobytes(receivedBytes)} KB${
        totalBytes !== undefined ? ` / ${formatKilobytes(totalBytes)} KB` : ""
      }`,
      receivedBytes,
      totalBytes,
    });
    getLogger().log(
      "FETCH",
      `Jina AI Reader success, text length: ${jinaText.length} bytes`,
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
    getLogger().log("FETCH", `Error: ${message}`);
    await emitProgress(onProgress, {
      stage: "error",
      message: `请求失败：${message}`,
    });
    return `Error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort)
    clearTimeout(timeoutId);
  }
};

const YOUTUBE_POLL_INTERVAL_MS = 3_000;
const YOUTUBE_MAX_POLLS = 60;

const fetchYoutubeTranscript = async (
  url: string,
  onProgress?: ToolProgressCallback,
  signal?: AbortSignal,
): Promise<string> => {
  const { SUPADATA_API_KEY: apiKey } = getServerEnv()
  if (!apiKey) {
    getLogger().log("FETCH", "Missing SUPADATA_API_KEY");
    return "Error: SUPADATA_API_KEY is not set";
  }

  getLogger().log("FETCH", `Fetching YouTube transcript: ${url}`);
  const supadata = new Supadata({ apiKey });

  try {
    await emitProgress(onProgress, {
      stage: "start",
      message: "正在获取 YouTube 字幕...",
    });

    const result = await supadata.transcript({
      url,
      text: true,
      mode: "auto",
    });

    // If we get a jobId, poll for completion
    if ("jobId" in result && result.jobId) {
      const jobId = result.jobId;
      getLogger().log("FETCH", `Transcript job created: ${jobId}`);

      for (let i = 1; i <= YOUTUBE_MAX_POLLS; i++) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        await emitProgress(onProgress, {
          stage: "polling",
          message: `等待字幕处理完成... (${i}/${YOUTUBE_MAX_POLLS})`,
        });

        await sleep(YOUTUBE_POLL_INTERVAL_MS);

        const job = await supadata.transcript.getJobStatus(jobId);

        if (job.status === "completed" && job.result) {
          const transcript = job.result;
          const text =
            typeof transcript.content === "string"
              ? transcript.content
              : JSON.stringify(transcript.content);
          const sizeKB = (new TextEncoder().encode(text).byteLength / 1024).toFixed(1)
          getLogger().log(
            "FETCH",
            `Transcript job completed, size: ${sizeKB} KB`,
          );
          await emitProgress(onProgress, {
            stage: "complete",
            message: `字幕获取完成 (${sizeKB} KB)`,
          });
          return text;
        }

        if (job.status === "failed") {
          const errMsg = job.error?.message || "Job failed";
          getLogger().log("FETCH", `Transcript job failed: ${errMsg}`);
          await emitProgress(onProgress, {
            stage: "error",
            message: `字幕处理失败：${errMsg}`,
          });
          return `Error: ${errMsg}`;
        }
      }

      getLogger().log("FETCH", "Transcript job timed out");
      await emitProgress(onProgress, {
        stage: "error",
        message: "字幕处理超时",
      });
      return "Error: Transcript job timed out after polling";
    }

    // Direct result — narrow to Transcript
    const transcript = result as { content: unknown };
    const text =
      typeof transcript.content === "string"
        ? transcript.content
        : JSON.stringify(transcript.content);
    const sizeKB = (new TextEncoder().encode(text).byteLength / 1024).toFixed(1)
    getLogger().log("FETCH", `Transcript success, size: ${sizeKB} KB`);
    await emitProgress(onProgress, {
      stage: "complete",
      message: `字幕获取完成 (${sizeKB} KB)`,
    });
    return text;
  } catch (error) {
    const message =
      typeof error === "object" && error !== null
        ? (error as Error).message
        : String(error);
    getLogger().log("FETCH", `Transcript error: ${message}`);
    await emitProgress(onProgress, {
      stage: "error",
      message: `字幕获取失败：${message}`,
    });
    return `Error: ${message}`;
  }
};

const fetchUrl: ToolHandler = async (args, onProgress, signal) => {
  const { url, response_type } = parseFetchUrlArgs(args);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  if (response_type === "youtube") {
    return fetchYoutubeTranscript(url, onProgress, signal);
  }

  const { JINA_API_KEY: apiKey } = getServerEnv()

  if (!apiKey) {
    getLogger().log("FETCH", "Missing JINA_API_KEY");
    return "Error: JINA_API_KEY is not set";
  }

  if (response_type === "image") {
    if (isDirectImageUrl(url)) {
      return enqueueFetchUrlCall(() => fetchDirectImage(url, onProgress, signal));
    } else {
      return enqueueFetchUrlCall(() =>
        fetchScreenshot(url, apiKey, onProgress, signal),
      );
    }
  }

  // markdown mode (existing behavior)
  return enqueueFetchUrlCall(() => performFetchUrl(url, apiKey, onProgress, signal));
};

const fetchUrlSpec: ChatTool = {
  type: "function",
  function: {
    name: "fetch_url",
    description:
      "Fetch content from a URL with three response modes: 'markdown' converts webpage content to readable text (useful for reading articles, documentation, or API responses); 'image' returns visual content as base64 - either fetches direct image URLs (jpg, png, gif, etc.) or captures a full-page screenshot of webpages; 'youtube' extracts transcript/subtitles from a YouTube video URL.",
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
          enum: ["markdown", "image", "youtube"],
          description:
            "Response format: 'markdown' for text content (converts HTML to readable text), 'image' for visual content (fetches images directly or captures webpage screenshots), 'youtube' for extracting transcript/subtitles from YouTube videos",
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
