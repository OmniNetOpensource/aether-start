import { createFileRoute } from "@tanstack/react-router";
import { toolSpecs } from "@/src/shared/lib/tools";
import { isSupportedChatModel } from "@/src/shared/lib/openrouter/server";
import type { ChatRequest } from "@/src/features/chat/types/chat";
import {
  getDefaultRoleConfig,
  getRoleConfig,
} from "@/src/server/chat/role-config";
import {
  ConversationLogger,
  createConversationLogger,
} from "@/src/shared/lib/conversation-logger";
import {
  getProvider,
  createEventSender,
  ResearchTracker,
  executeTools,
} from "@/src/shared/lib/providers";
import type { StreamEvent } from "@/src/shared/lib/providers";

const generateConversationId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let logger: ConversationLogger | null = null;

        try {
          const {
            conversationHistory,
            conversationId,
            role,
          } = (await request.json()) as ChatRequest;

          logger = createConversationLogger();

          const messageCount = Array.isArray(conversationHistory)
            ? conversationHistory.length
            : 0;
          logger?.log("FRONTEND", "Received chat request", {
            conversationId,
            role,
            messageCount,
            conversationHistoryType: Array.isArray(conversationHistory)
              ? "array"
              : typeof conversationHistory,
          });

          if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
            const historyType = Array.isArray(conversationHistory)
              ? "array"
              : typeof conversationHistory;
            const historyLength = Array.isArray(conversationHistory)
              ? conversationHistory.length
              : "n/a";
            const reply = `Invalid conversation history: expected non-empty array, got ${historyType} (length: ${historyLength}).`;
            logger?.log("ERROR", "Invalid conversation history", {
              conversationId,
              role,
              historyType,
              historyLength,
            });
            return Response.json({ reply }, { status: 400 });
          }

          const latestUserMessage = [...conversationHistory]
            .reverse()
            .find((msg) => msg.role === "user");

          if (!latestUserMessage || !Array.isArray(latestUserMessage.blocks) || latestUserMessage.blocks.length === 0) {
            const reply = `Missing user message: latest user message missing or has empty blocks.`;
            logger?.log("ERROR", "Missing user message", {
              conversationId: conversationId ?? null,
              role,
              latestUserFound: Boolean(latestUserMessage),
              blocksType: latestUserMessage
                ? Array.isArray(latestUserMessage.blocks)
                  ? "array"
                  : typeof latestUserMessage.blocks
                : "n/a",
              blocksLength: Array.isArray(latestUserMessage?.blocks)
                ? latestUserMessage.blocks.length
                : "n/a",
            });
            return Response.json({ reply }, { status: 400 });
          }

          const roleConfig = role ? getRoleConfig(role) : getDefaultRoleConfig();

          if (!roleConfig) {
            const reply = `Invalid or missing role: "${String(role ?? "")}".`;
            logger?.log("ERROR", "Invalid or missing role", {
              conversationId,
              role,
            });
            return Response.json({ reply }, { status: 400 });
          }

          if (!isSupportedChatModel(roleConfig.model)) {
            const reply = `Invalid or missing model: "${String(roleConfig.model ?? "")}".`;
            logger?.log("ERROR", "Invalid or missing model", {
              conversationId,
              role,
              model: roleConfig.model,
            });
            return Response.json({ reply }, { status: 400 });
          }

          const requestedModel = roleConfig.model;
          const systemInstruction = roleConfig.systemPrompt;
          const backend = roleConfig.backend;

          const allowedToolNames = new Set<string>(["fetch_url", "serper_search"]);

          const tools = toolSpecs.filter(
            (tool) =>
              tool.type === "function" &&
              allowedToolNames.has(tool.function.name),
          );

          let activeConversationId = conversationId ?? null;
          let conversationCreatedEvent: {
            type: "conversation_created";
            conversationId: string;
            title: string;
            user_id: string;
            created_at: string;
            updated_at: string;
          } | null = null;

          if (!activeConversationId) {
            const newId = generateConversationId();
            activeConversationId = newId;
            const title = "New Chat";
            const now = new Date().toISOString();
            conversationCreatedEvent = {
              type: "conversation_created",
              conversationId: newId,
              title,
              user_id: "",
              created_at: now,
              updated_at: now,
            };
          }

          const provider = getProvider(backend);

          provider.initialize(
            {
              model: requestedModel,
              tools,
              systemInstruction,
            },
            {
              conversationHistory: conversationHistory.map((message) => ({
                ...message,
                blocks: Array.isArray(message.blocks) ? message.blocks : [],
              })),
              conversationId: activeConversationId,
              logger,
              onProgress: () => {},
            },
          );

          const stream = new ReadableStream({
            async start(controller) {
              const eventSender = createEventSender(controller, logger);
              const researchTracker = new ResearchTracker();
              const handleEvent = (event: StreamEvent) => {
                eventSender.send(event);
                researchTracker.handle(event);
              };

              if (conversationCreatedEvent) {
                eventSender.send(conversationCreatedEvent);
              }

              const maxIterations = 30;
              let iteration = 0;

              try {
                while (iteration < maxIterations) {
                  iteration++;

                  const generator = provider.runIteration();
                  let result: {
                    shouldContinue: boolean;
                    pendingToolCalls: Array<{
                      id: string;
                      name: string;
                      args: Record<string, unknown>;
                    }>;
                    assistantText: string;
                  };

                  while (true) {
                    const { done, value } = await generator.next();
                    if (done) {
                      result = value;
                      break;
                    }
                    handleEvent(value);
                  }

                  if (!result!.shouldContinue) {
                    break;
                  }

                  if (activeConversationId) {
                    eventSender.send({
                      type: "conversation_updated",
                      conversationId: activeConversationId,
                      updated_at: new Date().toISOString(),
                    });
                  }

                  const toolResults = await executeTools(result!.pendingToolCalls, {
                    logger,
                    onEvent: handleEvent,
                  });

                  provider.appendToolResults(toolResults);
                }

                if (iteration >= maxIterations && !eventSender.isClosed()) {
                  eventSender.send({
                    type: "error",
                    message: `[已达到最大工具调用次数限制] iteration=${iteration} maxIterations=${maxIterations} backend=${backend} model=${requestedModel}`,
                  });
                }

                if (activeConversationId && !eventSender.isClosed()) {
                  eventSender.send({
                    type: "conversation_updated",
                    conversationId: activeConversationId,
                    updated_at: new Date().toISOString(),
                  });
                }

                eventSender.close();
              } catch (error) {
                if (!eventSender.isClosed()) {
                  const errorName = error instanceof Error ? error.name : "UnknownError";
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  logger?.log("ERROR", "Chat stream error", {
                    conversationId: activeConversationId,
                    backend,
                    model: requestedModel,
                    errorName,
                    errorMessage,
                    stack: error instanceof Error ? error.stack : undefined,
                  });
                  try {
                    eventSender.send({
                      type: "error",
                      message: `错误：${errorName}: ${errorMessage} (backend=${backend}, model=${requestedModel})`,
                    });
                  } catch {
                  }
                  eventSender.close();
                }
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } catch (error) {
          const errorName = error instanceof Error ? error.name : "UnknownError";
          const errorMessage = error instanceof Error ? error.message : String(error);
          return Response.json(
            { reply: `Unable to process request: ${errorName}: ${errorMessage}` },
            { status: 500 },
          );
        }
      },
    },
  },
});
