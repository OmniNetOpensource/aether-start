import {
  ChatTool,
  ToolDefinition,
  ToolHandler,
  ToolProgressCallback,
} from "./types";
import { getGeminiConfig } from "@/src/providers/config";

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
    throw new Error(
      "fetch_url requires response_type to be 'markdown' or 'image'",
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
      console.error(
        "[Tools:fetch_url] Throttling request, waiting",
        `${waitTime}ms`,
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

const MAJOR_EXTRACT_MODEL = "gemini-3-flash-preview-thinking";
const MAJOR_EXTRACT_TIMEOUT_MS = 30_000;
const MAJOR_EXTRACT_SYSTEM_PROMPT = `你是一个内容抽取器。请从输入的 Markdown 中提取“主要内容（major part）”，删除导航、目录、页脚、广告、推荐、版权声明、模板化说明、社交分享、脚注等非正文内容。

要求：
1) 只输出提取后的 Markdown 正文，不要添加任何解释、前后缀或额外标题。
2) 保留正文结构（标题、段落、列表、代码块、引用等），但不要保留与正文无关的模块。
3) 不要总结或改写，只做抽取。`;

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const emitProgress = async (
  onProgress: ToolProgressCallback | undefined,
  update: Parameters<ToolProgressCallback>[0],
) => {
  if (onProgress) {
    await onProgress(update);
  }
};

const generateGeminiText = async (
  model: string,
  markdown: string,
): Promise<string> => {
  const { apiKey, baseUrl } = getGeminiConfig();

  const response = await fetch(
    `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: markdown }],
          },
        ],
        system_instruction: {
          parts: [{ text: MAJOR_EXTRACT_SYSTEM_PROMPT }],
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as GeminiGenerateResponse;
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    return "";
  }

  return parts.map((part) => part.text || "").join("");
};

const extractMajorMarkdown = async (
  markdown: string,
): Promise<string | null> => {
  if (markdown.trim().length === 0) {
    return markdown;
  }

  try {
    const extracted = await Promise.race([
      generateGeminiText(MAJOR_EXTRACT_MODEL, markdown),
      new Promise<string>((_, reject) =>
        setTimeout(
          () => reject(new Error("Gemini extraction timed out")),
          MAJOR_EXTRACT_TIMEOUT_MS,
        ),
      ),
    ]);

    if (typeof extracted !== "string" || extracted.trim().length === 0) {
      return null;
    }

    return extracted;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error";
    console.error("[Tools:fetch_url] Gemini extract failed:", message);
    return null;
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

// Fetch direct image URL
const fetchDirectImage = async (
  url: string,
  onProgress?: ToolProgressCallback,
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

    console.error(
      "[Tools:fetch_url] Direct image success, size:",
      arrayBuffer.byteLength,
      "bytes",
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
  onProgress?: ToolProgressCallback,
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
      console.error(
        "[Tools:fetch_url] Screenshot HTTP error:",
        response.status,
        response.statusText,
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
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = contentType.split(";")[0].trim();
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
    await emitProgress(onProgress, {
      stage: "complete",
      message: `截图完成 (${sizeKB} KB)`,
      receivedBytes: arrayBuffer.byteLength,
    });

    console.error(
      "[Tools:fetch_url] Screenshot success, size:",
      arrayBuffer.byteLength,
      "bytes",
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
  onProgress?: ToolProgressCallback,
): Promise<string> => {
  const jinaUrl = `https://r.jina.ai/${url}`;
  console.error("[Tools:fetch_url] Fetching URL:", url, "via Jina:", jinaUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 80_000);

  try {
    const jinaResponse = await fetch(jinaUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Token-Budget": "200000",
      },
      signal: controller.signal,
    });

    if (!jinaResponse.ok) {
      console.error(
        "[Tools:fetch_url] Jina AI Reader HTTP error:",
        jinaResponse.status,
        jinaResponse.statusText,
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
    const receivedBytes = Buffer.byteLength(jinaText);
    await emitProgress(onProgress, {
      stage: "complete",
      message: `接收完成，总计 ${formatKilobytes(receivedBytes)} KB${
        totalBytes !== undefined ? ` / ${formatKilobytes(totalBytes)} KB` : ""
      }`,
      receivedBytes,
      totalBytes,
    });
    console.error(
      "[Tools:fetch_url] Jina AI Reader success, text length:",
      jinaText.length,
      "bytes",
    );

    const extracted = await extractMajorMarkdown(jinaText);
    if (extracted) {
      console.error(
        "[Tools:fetch_url] Gemini extract success, text length:",
        extracted.length,
        "bytes",
      );
      return extracted;
    }

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
      return enqueueFetchUrlCall(() =>
        fetchScreenshot(url, apiKey, onProgress),
      );
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
          description:
            "Response format: 'markdown' for text content (converts HTML to readable text), 'image' for visual content (fetches images directly or captures webpage screenshots)",
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
