import { SerializedMessage } from "@/src/features/chat/types/chat";
import { StreamParser, StreamEvent } from "./stream-parser";

type ChatClientOptions = {
  onEvent: (event: StreamEvent) => void;
  onError: (error: Error) => void;
  onFinish?: () => void;
};

export class ChatClient {
  private abortController: AbortController | null = null;

  constructor(private options: ChatClientOptions) {}

  public async sendMessage(
    messages: SerializedMessage[],
    role: string,
    conversationId: string | null
  ) {
    this.abortController = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: this.abortController.signal,
        body: JSON.stringify({
          conversationHistory: messages,
          conversationId: conversationId ?? null,
          role,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        const statusText = response.statusText || "Unknown Status";
        let detail = "";

        try {
          const rawBody = await response.text();
          if (rawBody) {
            const clippedBody =
              rawBody.length > 500 ? `${rawBody.slice(0, 500)}…` : rawBody;
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              try {
                const data = JSON.parse(rawBody) as
                  | { reply?: unknown; error?: unknown }
                  | undefined;
                const reply =
                  typeof data?.reply === "string"
                    ? data.reply
                    : typeof data?.error === "string"
                      ? data.error
                      : "";
                detail = reply || clippedBody;
              } catch {
                detail = clippedBody;
              }
            } else {
              detail = clippedBody;
            }
          }
        } catch {
          // Ignore body parsing failures; fall back to status message.
        }

        const detailSuffix = detail ? ` - ${detail}` : "";
        throw new Error(
          `Chat API request failed: ${status} ${statusText}${detailSuffix}`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error(
          "Chat stream unavailable: response body is empty or locked"
        );
      }

      const parser = new StreamParser({
        onEvent: this.options.onEvent,
        onError: this.options.onError,
      });

      while (true) {
        const { value, done } = await reader.read();

        if (value) {
          parser.parseChunk(value);
        }

        if (done) break;
      }

      reader.releaseLock();
    } catch (error) {
      const isAbortError =
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");

      if (!isAbortError) {
        const enhancedError = this.enhanceError(error);
        this.options.onError(enhancedError);
      }
    } finally {
      this.abortController = null;
      this.options.onFinish?.();
    }
  }

  public abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private enhanceError(error: unknown): Error {
    if (!(error instanceof Error)) {
      return new Error(`未知错误: ${String(error)}`);
    }

    const errorName = error.name;
    const errorMessage = error.message;

    // 网络连接失败 (通常是 TypeError: Failed to fetch)
    if (error instanceof TypeError && errorMessage.includes("fetch")) {
      return new Error(
        `网络连接失败: ${errorMessage}\n` +
        `可能原因: 网络断开、DNS 解析失败、服务器不可达\n` +
        `建议: 请检查网络连接后重试`
      );
    }

    // 网络超时
    if (errorName === "TimeoutError" || errorMessage.includes("timeout")) {
      return new Error(
        `请求超时: ${errorMessage}\n` +
        `可能原因: 网络延迟过高、服务器响应缓慢\n` +
        `建议: 请稍后重试`
      );
    }

    // 流读取中断 (网络不稳定导致)
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("socket") ||
      errorMessage.includes("ECONNRESET") ||
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("ETIMEDOUT")
    ) {
      return new Error(
        `网络中断: ${errorMessage}\n` +
        `可能原因: 网络不稳定、连接被重置\n` +
        `建议: 请检查网络连接后重试`
      );
    }

    // SSE 流解析错误
    if (errorMessage.includes("SSE") || errorMessage.includes("parse")) {
      return new Error(
        `数据解析错误: ${errorMessage}\n` +
        `可能原因: 服务器返回了异常数据、网络传输中数据损坏`
      );
    }

    // 其他错误，保留原始信息并添加错误类型
    return new Error(`${errorName}: ${errorMessage}`);
  }
}
