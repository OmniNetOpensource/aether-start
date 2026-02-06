import { SerializedMessage } from "@/src/features/chat/types/chat";

export type StreamToolCall = {
  index?: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
};

export type ReasoningDetail = {
  type?: string;
  text?: string;
  format?: string;
  index?: number;
  [key: string]: unknown;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: unknown;
  toolCalls?: StreamToolCall[];
  toolCallId?: string;
  name?: string;
  // Optional reasoning / thinking content for models like Gemini
  reasoning?: string;
  // OpenRouter reasoning_details (Gemini thought signatures) must be preserved
  reasoningDetails?: ReasoningDetail[];
};

export const buildSystemPrompt = () => {
  const now = new Date();
  const localDate = now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const prompt = `
今天的日期和时间是：${localDate} (时区: ${timezone})
不需要在回答时引用出处。
`;

  return `${prompt}
# 需要搜索的时候：非必要情况下不要用中文搜索；在没有足够上下文之前不要回答；如果没有搞清楚，就不断调研直到搞清楚，不要只是了解皮毛，要深入搜索资料去了解，要了解全方位的资料搜寻才能开始回答。

# 什么时候不需要搜索：已知的知识

- 学会利用google search高级技巧
`;
};

export const toChatMessages = (history: SerializedMessage[]): ChatMessage[] =>
  history
    .map((msg) => {
      const relevantBlocks = msg.blocks.filter(
        (block) => block.type === "content" || block.type === "attachments",
      );

      const contentParts: unknown[] = [];

      for (const block of relevantBlocks) {
        if (block.type === "content") {
          contentParts.push({
            type: "text",
            text: block.content,
          });
        } else if (block.type === "attachments") {
          for (const att of block.attachments) {
            const source = att.url;

            if (!source) {
              continue;
            }

            contentParts.push({
              type: "image_url",
              image_url: { url: source },
            });
          }
        }
      }

      return {
        role: msg.role,
        content: contentParts,
      };
    })
    .filter((msg) => {
      if (msg.role !== "assistant") {
        return true;
      }
      return Array.isArray(msg.content) && msg.content.length > 0;
    });
