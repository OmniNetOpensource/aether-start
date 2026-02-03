import {
  ChatTool,
  ToolDefinition,
  ToolHandler,
  ToolProgressCallback,
  cleanHtmlToText,
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

const PROGRESS_CHUNK_BYTES = 50 * 1024;
const PROGRESS_INTERVAL_MS = 500;
// 添加最大内容长度限制 (约 70k 字符)
const MAX_CONTENT_LENGTH = 70000;

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

const fetchUrl: ToolHandler = async (args, onProgress) => {
  const { url } = parseFetchUrlArgs(args);
  console.error("[Tools:fetch_url] Fetching URL:", url);

  // Try Jina AI Reader first
  const jinaUrl = `https://r.jina.ai/${url}`;
  console.error("[Tools:fetch_url] Trying Jina AI Reader:", jinaUrl);

  try {
    await emitProgress(onProgress, {
      stage: "start",
      message: "开始连接 Jina AI Reader...",
    });

    const jinaResponse = await fetch(jinaUrl);

    if (jinaResponse.ok) {
      const jinaText = await readStreamWithProgress(jinaResponse, onProgress);
      console.error(
        "[Tools:fetch_url] Jina AI Reader success, text length:",
        jinaText.length,
        "bytes"
      );

      // 检查 Jina 返回的内容长度
      if (jinaText.length > MAX_CONTENT_LENGTH) {
        return `[系统提示: 抓取的内容过长 (长度: ${jinaText.length} 字符)，已省略不返回。请尝试查阅摘要或使用更具体的搜索词。]`;
      }

      return jinaText;
    } else {
      console.error(
        "[Tools:fetch_url] Jina AI Reader HTTP error:",
        jinaResponse.status,
        jinaResponse.statusText,
        "- falling back to original URL"
      );
      await emitProgress(onProgress, {
        stage: "error",
        message: `Jina AI Reader 返回 HTTP ${jinaResponse.status}`,
      });
    }
  } catch (jinaError) {
    console.error(
      "[Tools:fetch_url] Jina AI Reader error:",
      typeof jinaError === "object" && jinaError !== null
        ? (jinaError as Error).message
        : String(jinaError),
      "- falling back to original URL"
    );
    await emitProgress(onProgress, {
      stage: "start",
      message: "Jina AI Reader 不可用，切换为直接抓取...",
    });
  }

  // Fallback to original URL
  console.error("[Tools:fetch_url] Fetching original URL:", url);
  await emitProgress(onProgress, {
    stage: "start",
    message: `开始连接 ${url}...`,
  });

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        "[Tools:fetch_url] HTTP error:",
        response.status,
        response.statusText
      );
      await emitProgress(onProgress, {
        stage: "error",
        message: `HTTP 错误：${response.status} ${response.statusText}`,
      });
      return `Error: HTTP ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get("content-type") || "";
    console.error("[Tools:fetch_url] Content-Type:", contentType);

    const rawText = await readStreamWithProgress(response, onProgress);

    if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(rawText);
        const jsonText = JSON.stringify(parsed, null, 2);
        console.error(
          "[Tools:fetch_url] JSON response length:",
          jsonText.length
        );

        // 检查 JSON 内容长度
        if (jsonText.length > MAX_CONTENT_LENGTH) {
          return `[系统提示: JSON 内容过长 (长度: ${jsonText.length} 字符)，已省略不返回。]`;
        }

        return jsonText;
      } catch (error) {
        console.error("[Tools:fetch_url] JSON parse error:", error);
        return rawText;
      }
    }

    console.error(
      "[Tools:fetch_url] Fetched text/HTML length:",
      rawText.length,
      "bytes"
    );

    const cleaned = cleanHtmlToText(rawText);
    console.error(
      "[Tools:fetch_url] Cleaned text length:",
      cleaned.length,
      "bytes"
    );

    // 检查清理后的文本长度
    if (cleaned.length > MAX_CONTENT_LENGTH) {
      return `[系统提示: 网页内容过长 (长度: ${cleaned.length} 字符)，已省略不返回。请尝试查阅摘要或使用更具体的搜索词。]`;
    }

    return cleaned;
  } catch (error) {
    console.error(
      "[Tools:fetch_url] Error:",
      typeof error === "object" && error !== null
        ? (error as Error).message
        : String(error)
    );
    await emitProgress(onProgress, {
      stage: "error",
      message: `请求失败：${
        typeof error === "object" && error !== null
          ? (error as Error).message
          : String(error)
      }`,
    });
    return `Error fetching URL: ${
      typeof error === "object" && error !== null
        ? (error as Error).message
        : String(error)
    }`;
  }
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
