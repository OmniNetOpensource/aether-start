import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import type {
  ContentBlock,
  Message,
  ResearchItem,
  Tool,
} from "@/src/features/chat/types/chat";

type CloudToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

type CloudToolProgress = {
  stage: string;
  message: string;
  receivedBytes?: number;
  totalBytes?: number;
};

type CloudToolResult = {
  result: string;
};

type CloudTool = {
  call: CloudToolCall;
  progress?: CloudToolProgress[];
  result?: CloudToolResult;
};

type CloudResearchItem =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; data: CloudTool };

type CloudBlock =
  | { type: "content"; content: string }
  | { type: "research"; items: CloudResearchItem[] };

type CloudMessage = {
  role: "user" | "assistant";
  createdAt: string;
  blocks: CloudBlock[];
};

type CloudConversationPayload = {
  conversationId: string;
  created_at: string;
  updated_at: string;
  messages: CloudMessage[];
};

let cachedClient: ConvexClient | null = null;
let hasWarnedMissingUrl = false;

const getConvexClient = (): ConvexClient | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const url = import.meta.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    if (!hasWarnedMissingUrl) {
      console.warn(
        "NEXT_PUBLIC_CONVEX_URL is not set; skipping cloud conversation backup."
      );
      hasWarnedMissingUrl = true;
    }
    return null;
  }

  if (!cachedClient) {
    cachedClient = new ConvexClient(url);
  }

  return cachedClient;
};

const sanitizeTool = (tool: Tool): CloudTool => {
  const callTool = typeof tool.call?.tool === "string" ? tool.call.tool : "";
  const args =
    tool.call && typeof tool.call.args === "object" && tool.call.args !== null
      ? (tool.call.args as Record<string, unknown>)
      : {};

  const progress = Array.isArray(tool.progress)
    ? tool.progress.map((item) => ({
        stage: item.stage,
        message: item.message,
        receivedBytes:
          typeof item.receivedBytes === "number" ? item.receivedBytes : undefined,
        totalBytes:
          typeof item.totalBytes === "number" ? item.totalBytes : undefined,
      }))
    : undefined;

  const result =
    tool.result && typeof tool.result.result === "string"
      ? { result: tool.result.result }
      : undefined;

  return {
    call: {
      tool: callTool,
      args,
    },
    ...(progress ? { progress } : {}),
    ...(result ? { result } : {}),
  };
};

const sanitizeResearchItems = (items: ResearchItem[]): CloudResearchItem[] => {
  const sanitized: CloudResearchItem[] = [];

  for (const item of items) {
    if (item.kind === "thinking") {
      sanitized.push({ kind: "thinking", text: item.text });
    } else if (item.kind === "tool") {
      sanitized.push({ kind: "tool", data: sanitizeTool(item.data) });
    }
  }

  return sanitized;
};

const sanitizeBlocks = (blocks: ContentBlock[]): CloudBlock[] => {
  const sanitized: CloudBlock[] = [];

  for (const block of blocks) {
    if (block.type === "content") {
      sanitized.push({ type: "content", content: block.content });
    } else if (block.type === "research") {
      sanitized.push({
        type: "research",
        items: sanitizeResearchItems(block.items),
      });
    }
  }

  return sanitized;
};

const buildCloudPayload = (payload: {
  conversationId: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
}): CloudConversationPayload => ({
  conversationId: payload.conversationId,
  created_at: payload.created_at,
  updated_at: payload.updated_at,
  messages: payload.messages.map((message) => ({
    role: message.role,
    createdAt: message.createdAt,
    blocks: sanitizeBlocks(message.blocks),
  })),
});

export const saveConversationToCloud = async (payload: {
  conversationId: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
}): Promise<void> => {
  const client = getConvexClient();
  if (!client) {
    return;
  }

  try {
    await client.mutation(
      anyApi.conversations.upsertConversation,
      buildCloudPayload(payload)
    );
  } catch (error) {
    console.error("Failed to save conversation to Convex:", error);
  }
};
