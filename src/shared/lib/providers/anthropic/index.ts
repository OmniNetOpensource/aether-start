import type {
  IProvider,
  ProviderConfig,
  ProviderContext,
  StreamEvent,
  IterationResult,
  ToolCallResult,
  PendingToolCall,
} from "../types";
import { streamAnthropicCompletion } from "@/src/shared/lib/anthropic/server";
import {
  convertToAnthropicMessages,
  convertToolsToAnthropic,
  type AnthropicMessage,
} from "@/src/shared/lib/anthropic/converter";
import { buildSystemPrompt } from "@/src/server/chat/utils";

export class AnthropicProvider implements IProvider {
  readonly name = "anthropic" as const;

  private config!: ProviderConfig;
  private context!: ProviderContext;
  private initialized = false;
  private anthropicMessages: AnthropicMessage[] = [];

  initialize(config: ProviderConfig, context: ProviderContext): void {
    this.config = config;
    this.context = context;
    this.initialized = true;

    const systemPrompt = buildSystemPrompt();
    const rolePrompt = this.config.systemInstruction?.trim();
    const rolePromptMessages: AnthropicMessage[] = rolePrompt
      ? [{ role: "user", content: rolePrompt }]
      : [];
    this.anthropicMessages = [
      { role: "user", content: systemPrompt },
      ...rolePromptMessages,
      ...convertToAnthropicMessages(this.context.conversationHistory),
    ];
  }

  async *runIteration(): AsyncGenerator<StreamEvent, IterationResult, undefined> {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }

    const anthropicTools = this.config.tools.length > 0 ? convertToolsToAnthropic(this.config.tools) : undefined;

    let assistantText = "";
    const pendingToolCalls: PendingToolCall[] = [];
    let currentToolId = "";
    let currentToolName = "";
    let currentToolJson = "";
    let stopReason = "";

    try {
      for await (const chunk of streamAnthropicCompletion({
        model: this.config.model,
        messages: this.anthropicMessages,
        tools: anthropicTools,
      })) {
        if (chunk.type === "text") {
          assistantText += chunk.text;
          yield { type: "content", content: chunk.text };
        } else if (chunk.type === "thinking") {
          yield { type: "thinking", content: chunk.thinking };
        } else if (chunk.type === "tool_use_start") {
          currentToolId = chunk.id;
          currentToolName = chunk.name;
          currentToolJson = "";
        } else if (chunk.type === "tool_use_delta") {
          currentToolJson += chunk.partial_json;
        } else if (chunk.type === "stop") {
          stopReason = chunk.stop_reason;
          if (currentToolId && currentToolName) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(currentToolJson || "{}");
            } catch {}
            pendingToolCalls.push({ id: currentToolId, name: currentToolName, args });
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start Anthropic completion";
      const model = this.config?.model ?? "unknown";
      yield {
        type: "error",
        message: `错误：Anthropic 请求失败 (model=${model}): ${message}`,
      };
      return { shouldContinue: false, pendingToolCalls: [], assistantText: "" };
    }

    if (stopReason === "end_turn" || pendingToolCalls.length === 0) {
      return { shouldContinue: false, pendingToolCalls: [], assistantText };
    }

    // Store for appendToolResults
    this.lastAssistantText = assistantText;
    this.lastPendingToolCalls = pendingToolCalls;

    return { shouldContinue: true, pendingToolCalls, assistantText };
  }

  private lastAssistantText = "";
  private lastPendingToolCalls: PendingToolCall[] = [];

  appendToolResults(results: ToolCallResult[]): void {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }

    // Build assistant content
    const assistantContent: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    > = [];

    if (this.lastAssistantText) {
      assistantContent.push({ type: "text", text: this.lastAssistantText });
    }

    for (const tc of this.lastPendingToolCalls) {
      assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
    }

    // Build tool result content
    const toolResultContent: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = results.map(
      (tr) => ({
        type: "tool_result",
        tool_use_id: tr.id,
        content: tr.result,
      })
    );

    this.anthropicMessages = [
      ...this.anthropicMessages,
      { role: "assistant", content: assistantContent },
      { role: "user", content: toolResultContent as AnthropicMessage["content"] },
    ];

    // Clear stored state
    this.lastAssistantText = "";
    this.lastPendingToolCalls = [];
  }
}
