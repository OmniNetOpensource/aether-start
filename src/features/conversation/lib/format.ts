// 对话标题生成逻辑，供本地/云端统一使用
import type { MessageLike } from "@/features/conversation/types/message";

export const buildConversationTitle = (message: MessageLike) => {
  const text = message.blocks
    .filter((b) => b.type === "content")
    .map((b) => b.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "新会话";
  }

  const normalized = text.replace(/\r?\n/g, " ").trim();
  return normalized;
};
