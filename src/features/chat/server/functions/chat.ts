import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchUrlTool } from "@/features/chat/server/tools/fetch";
import { searchTool } from "@/features/chat/server/tools/search";
import {
  getDefaultRoleConfig,
  getRoleConfig,
} from "@/features/chat/server/services/chat-config";
import {
  createConversationLogger,
  enterLoggerContext,
  getLogger,
} from "@/features/chat/server/services/logger";
import { runChat } from "@/features/chat/server/services/anthropic";
import { executeToolsGen } from "@/features/chat/server/tools/execute";
import type {
  ChatServerToClientEvent,
  ChatRequestConfig,
  ChatRunResult,
  ChatProviderState,
  ToolInvocationResult,
} from "@/features/chat/server/schemas/types";
import type { ChatTool } from "@/features/chat/server/tools/types";

const generateConversationId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  blocks: z.array(z.any()),
});

const chatInputSchema = z.object({
  conversationHistory: z.array(messageSchema),
  conversationId: z.string().nullable().optional(),
  role: z.string().optional(),
});

export const streamChatFn = createServerFn({ method: "POST" })
  .inputValidator(chatInputSchema)
  .handler(async function* ({ data }) {
    try {
      const { conversationHistory, conversationId, role } = data;

      const logger = createConversationLogger();
      enterLoggerContext(logger);

      const messageCount = Array.isArray(conversationHistory)
        ? conversationHistory.length
        : 0;
      getLogger().log("FRONTEND", "Received chat request", {
        conversationId,
        role,
        messageCount,
        conversationHistoryType: Array.isArray(conversationHistory)
          ? "array"
          : typeof conversationHistory,
      });

      if (
        !Array.isArray(conversationHistory) ||
        conversationHistory.length === 0
      ) {
        yield {
          type: "error",
          message: "Invalid conversation history: expected non-empty array.",
        } satisfies ChatServerToClientEvent;
        return;
      }

      const latestUserMessage = [...conversationHistory]
        .reverse()
        .find((msg) => msg.role === "user");

      if (
        !latestUserMessage ||
        !Array.isArray(latestUserMessage.blocks) ||
        latestUserMessage.blocks.length === 0
      ) {
        yield {
          type: "error",
          message:
            "Missing user message: latest user message missing or has empty blocks.",
        } satisfies ChatServerToClientEvent;
        return;
      }

      const roleConfig = role ? getRoleConfig(role) : getDefaultRoleConfig();

      if (!roleConfig) {
        yield {
          type: "error",
          message: `Invalid or missing role: "${String(role ?? "")}".`,
        } satisfies ChatServerToClientEvent;
        return;
      }

      const requestedModel = roleConfig.model;
      const systemInstruction = roleConfig.systemPrompt;

      const tools: ChatTool[] = []
      if (process.env.JINA_API_KEY) {
        tools.push(fetchUrlTool.spec)
      }
      if (process.env.SERP_API_KEY) {
        tools.push(searchTool.spec)
      }

      let activeConversationId = conversationId ?? null;

      if (!activeConversationId) {
        const newId = generateConversationId();
        activeConversationId = newId;
        const title = "New Chat";
        const now = new Date().toISOString();
        yield {
          type: "conversation_created",
          conversationId: newId,
          title,
          user_id: "",
          created_at: now,
          updated_at: now,
        } satisfies ChatServerToClientEvent;
      }

      const chatRequestConfig: ChatRequestConfig = {
        model: requestedModel,
        tools,
        systemPrompt: systemInstruction,
        messages: conversationHistory.map((message) => ({
          ...message,
          blocks: Array.isArray(message.blocks) ? message.blocks : [],
        })),
      };

      const maxIterations = 200;
      let iteration = 0;
      let state: ChatProviderState | undefined;
      let pendingToolResults: ToolInvocationResult[] | null = null;

      while (iteration < maxIterations) {
        iteration++;

        const generator = runChat({
          options: chatRequestConfig,
          continuation:
            pendingToolResults && state
              ? { state, toolResults: pendingToolResults }
              : undefined,
        });
        let result: ChatRunResult | undefined;

        while (true) {
          const { done, value } = await generator.next();
          if (done) {
            result = value;
            break;
          }
          yield value;
        }

        if (!result) {
          break;
        }

        state = result.state ?? state;

        if (!result.shouldContinue) {
          break;
        }

        if (!state) {
          yield {
            type: "error",
            message: `错误：缺少继续对话所需的状态 (model=${requestedModel})`,
          } satisfies ChatServerToClientEvent;
          break;
        }

        if (activeConversationId) {
          yield {
            type: "conversation_updated",
            conversationId: activeConversationId,
            updated_at: new Date().toISOString(),
          } satisfies ChatServerToClientEvent;
        }

        const toolGen = executeToolsGen(result.pendingToolCalls);
        let toolGenResult: IteratorResult<
          ChatServerToClientEvent,
          ToolInvocationResult[]
        >;
        while (true) {
          toolGenResult = await toolGen.next();
          if (toolGenResult.done) {
            break;
          }
          yield toolGenResult.value;
        }

        pendingToolResults = toolGenResult!.value;
      }

      if (iteration >= maxIterations) {
        yield {
          type: "error",
          message: `[已达到最大工具调用次数限制] iteration=${iteration} maxIterations=${maxIterations} model=${requestedModel}`,
        } satisfies ChatServerToClientEvent;
      }

      if (activeConversationId) {
        yield {
          type: "conversation_updated",
          conversationId: activeConversationId,
          updated_at: new Date().toISOString(),
        } satisfies ChatServerToClientEvent;
      }
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      getLogger().log("ERROR", "Chat stream error", {
        errorName,
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      yield {
        type: "error",
        message: `错误：${errorName}: ${errorMessage}`,
      } satisfies ChatServerToClientEvent;
    }
  });
