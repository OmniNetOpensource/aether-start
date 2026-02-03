import type {
  IProvider,
  ProviderConfig,
  ProviderContext,
  StreamEvent,
  IterationResult,
  ToolCallResult,
  PendingToolCall,
} from "../types";
import {
  streamChatCompletion,
  parseSSEStream,
} from "@/src/shared/lib/openrouter/server";
import { buildSystemPrompt, toChatMessages, type ChatMessage, type ReasoningDetail, type StreamToolCall } from "@/src/server/chat/utils";

export class OpenRouterProvider implements IProvider {
  readonly name = "openrouter" as const;

  private config!: ProviderConfig;
  private context!: ProviderContext;
  private initialized = false;
  private currentMessages: ChatMessage[] = [];

  initialize(config: ProviderConfig, context: ProviderContext): void {
    this.config = config;
    this.context = context;
    this.initialized = true;

    const systemPrompt = buildSystemPrompt();
    const rolePrompt = this.config.systemInstruction?.trim();
    const rolePromptMessages: ChatMessage[] = rolePrompt
      ? [{ role: "system", content: rolePrompt }]
      : [];
    this.currentMessages = [
      { role: "system", content: systemPrompt },
      ...rolePromptMessages,
      ...toChatMessages(this.context.conversationHistory),
    ];
  }

  async *runIteration(): AsyncGenerator<StreamEvent, IterationResult, undefined> {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }

    let stream: ReadableStream<Uint8Array>;
    try {
      const requestPayload = {
        model: this.config.model,
        messages: this.currentMessages,
        tools: this.config.tools.length > 0 ? this.config.tools : undefined,
        provider: this.config.provider,
      };
      stream = await streamChatCompletion(requestPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start chat completion";
      const model = this.config?.model ?? "unknown";
      yield {
        type: "error",
        message: `错误：OpenRouter 请求失败 (model=${model}): ${message}`,
      };
      return { shouldContinue: false, pendingToolCalls: [], assistantText: "" };
    }

    let assistantMessage = "";
    let currentReasoning = "";
    let currentReasoningDetails: ReasoningDetail[] = [];
    const toolCalls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }> = [];
    let currentToolCallIndex = -1;
    let finishedWithStop = false;

    const mergeReasoningDetail = (detail: ReasoningDetail) => {
      const detailIndex = typeof detail.index === "number" ? detail.index : null;

      if (detailIndex === null) {
        currentReasoningDetails = [...currentReasoningDetails, detail];
        return;
      }

      const existingIndex = currentReasoningDetails.findIndex((item) => item.index === detailIndex);
      if (existingIndex === -1) {
        currentReasoningDetails = [...currentReasoningDetails, detail];
        return;
      }

      const existing = currentReasoningDetails[existingIndex];
      const mergedText =
        typeof existing.text === "string" || typeof detail.text === "string"
          ? `${existing.text ?? ""}${detail.text ?? ""}`
          : existing.text;
      const merged = { ...existing, ...detail, text: mergedText };
      currentReasoningDetails = [
        ...currentReasoningDetails.slice(0, existingIndex),
        merged,
        ...currentReasoningDetails.slice(existingIndex + 1),
      ];
    };

    for await (const chunk of parseSSEStream(stream)) {
      const delta = chunk?.choices?.[0]?.delta;
      const finishReason = chunk?.choices?.[0]?.finishReason as string | undefined;

      if (delta?.reasoning) {
        currentReasoning += delta.reasoning;
        yield { type: "thinking", content: delta.reasoning };
      }

      if (delta?.reasoning_details) {
        for (const detail of delta.reasoning_details) {
          if (detail && typeof detail === "object") {
            mergeReasoningDetail(detail);
          }
        }
      }

      if (delta?.content) {
        assistantMessage += delta.content;
        yield { type: "content", content: delta.content };
      }

      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls as StreamToolCall[]) {
          if (toolCall.index !== undefined && toolCall.index !== currentToolCallIndex) {
            currentToolCallIndex = toolCall.index;
            toolCalls[currentToolCallIndex] = {
              id: toolCall.id || "",
              type: "function",
              function: {
                name: toolCall.function?.name || "",
                arguments: toolCall.function?.arguments || "",
              },
            };
          } else if (currentToolCallIndex >= 0 && toolCall.function?.arguments) {
            const currentToolCall = toolCalls[currentToolCallIndex];
            if (currentToolCall && currentToolCall.type === "function") {
              currentToolCall.function.arguments += toolCall.function.arguments;
            }
          }
        }
      }

      if (finishReason === "stop") {
        finishedWithStop = true;
        break;
      }

      if (finishReason === "tool_calls" && toolCalls.length > 0) {
        break;
      }
    }

    if (finishedWithStop) {
      return { shouldContinue: false, pendingToolCalls: [], assistantText: assistantMessage };
    }

    if (toolCalls.length === 0) {
      return { shouldContinue: false, pendingToolCalls: [], assistantText: assistantMessage };
    }

    // Store assistant message with tool calls for next iteration
    this.currentMessages.push({
      role: "assistant",
      content: assistantMessage || null,
      toolCalls,
      reasoning: currentReasoning || undefined,
      reasoningDetails: currentReasoningDetails.length > 0 ? currentReasoningDetails : undefined,
    });

    // Convert tool calls to pending format
    const pendingToolCalls: PendingToolCall[] = toolCalls.map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function.arguments || "{}");
        if (parsed && typeof parsed === "object") {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        // Use empty args on parse failure
      }
      return { id: tc.id, name: tc.function.name, args };
    });

    return { shouldContinue: true, pendingToolCalls, assistantText: assistantMessage };
  }

  appendToolResults(results: ToolCallResult[]): void {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }
    for (const result of results) {
      this.currentMessages.push({
        role: "tool",
        toolCallId: result.id,
        content: result.result,
      });
    }
  }
}
