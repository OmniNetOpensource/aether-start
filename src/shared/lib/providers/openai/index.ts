import type {
  IProvider,
  ProviderConfig,
  ProviderContext,
  StreamEvent,
  IterationResult,
  ToolCallResult,
  PendingToolCall,
} from "../types";
import { streamOpenAIResponse } from "@/src/shared/lib/openai/server";
import {
  convertToOpenAIInput,
  convertToolsToOpenAI,
  type OpenAIInputItem,
  type OpenAIFunctionCallOutput,
} from "@/src/shared/lib/openai/converter";
import { buildSystemPrompt } from "@/src/server/chat/utils";

export class OpenAIProvider implements IProvider {
  readonly name = "openai" as const;

  private config!: ProviderConfig;
  private context!: ProviderContext;
  private initialized = false;
  private openaiInput: OpenAIInputItem[] = [];
  private manualInput: OpenAIInputItem[] = [];
  private previousResponseId: string | null = null;
  private usePreviousResponseId = true;
  private systemPrompt = "";

  // Store for appendToolResults
  private lastAssistantText = "";
  private lastPendingFunctionCalls: Array<{
    id: string;
    call_id: string;
    name: string;
    args: Record<string, unknown>;
    arguments: string;
  }> = [];

  initialize(config: ProviderConfig, context: ProviderContext): void {
    this.config = config;
    this.context = context;
    this.initialized = true;

    const rolePrompt = this.config.systemInstruction?.trim();
    const rolePromptInput: OpenAIInputItem[] = rolePrompt
      ? [{ type: "message", role: "system", content: rolePrompt }]
      : [];
    this.openaiInput = [
      ...rolePromptInput,
      ...convertToOpenAIInput(this.context.conversationHistory),
    ];
    this.manualInput = this.openaiInput;
    this.systemPrompt = buildSystemPrompt();
  }

  async *runIteration(): AsyncGenerator<StreamEvent, IterationResult, undefined> {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }

    const openaiTools = this.config.tools.length > 0 ? convertToolsToOpenAI(this.config.tools) : undefined;

    const pendingFunctionCalls: Array<{
      id: string;
      call_id: string;
      name: string;
      args: Record<string, unknown>;
      arguments: string;
    }> = [];
    let stopped = false;
    let responseId: string | null = null;
    let assistantText = "";
    let retriedWithoutPrevious = false;

    while (true) {
      try {
        for await (const chunk of streamOpenAIResponse({
          model: this.config.model,
          input: this.openaiInput,
          tools: openaiTools,
          systemPrompt: this.systemPrompt,
          previousResponseId: this.usePreviousResponseId ? this.previousResponseId : null,
        })) {
          if (chunk.type === "text") {
            assistantText += chunk.text;
            yield { type: "content", content: chunk.text };
          } else if (chunk.type === "thinking") {
            yield { type: "thinking", content: chunk.text };
          } else if (chunk.type === "response_id") {
            responseId = chunk.id;
          } else if (chunk.type === "function_call_done") {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(chunk.arguments || "{}");
            } catch {}
            pendingFunctionCalls.push({
              id: chunk.id,
              call_id: chunk.call_id,
              name: chunk.name,
              args,
              arguments: chunk.arguments || "",
            });
          } else if (chunk.type === "stop") {
            stopped = true;
          }
        }
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start OpenAI completion";
        const model = this.config?.model ?? "unknown";
        if (
          !retriedWithoutPrevious &&
          this.usePreviousResponseId &&
          message.includes("Unsupported parameter: previous_response_id")
        ) {
          this.usePreviousResponseId = false;
          this.previousResponseId = null;
          this.openaiInput = this.manualInput;
          retriedWithoutPrevious = true;
          pendingFunctionCalls.length = 0;
          stopped = false;
          responseId = null;
          assistantText = "";
          continue;
        }
        yield { type: "error", message: `Error: OpenAI 请求失败 (model=${model}): ${message}` };
        return { shouldContinue: false, pendingToolCalls: [], assistantText: "" };
      }
    }

    if (stopped && pendingFunctionCalls.length === 0) {
      return { shouldContinue: false, pendingToolCalls: [], assistantText };
    }

    if (pendingFunctionCalls.length === 0) {
      return { shouldContinue: false, pendingToolCalls: [], assistantText };
    }

    if (this.usePreviousResponseId && !responseId) {
      const model = this.config?.model ?? "unknown";
      yield {
        type: "error",
        message: `OpenAI response id missing for tool follow-up (model=${model})`,
      };
      return { shouldContinue: false, pendingToolCalls: [], assistantText };
    }

    // Store for appendToolResults
    this.lastAssistantText = assistantText;
    this.lastPendingFunctionCalls = pendingFunctionCalls;
    this.lastResponseId = responseId;

    // Convert to pending tool calls
    const pendingToolCalls: PendingToolCall[] = pendingFunctionCalls.map((fc) => ({
      id: fc.call_id,
      name: fc.name,
      args: fc.args,
    }));

    return { shouldContinue: true, pendingToolCalls, assistantText };
  }

  private lastResponseId: string | null = null;

  appendToolResults(results: ToolCallResult[]): void {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }

    // Build function call outputs
    const functionCallOutputs: OpenAIFunctionCallOutput[] = results.map((tr) => ({
      type: "function_call_output" as const,
      call_id: tr.id,
      output: tr.result,
    }));

    const functionCallItems: OpenAIInputItem[] = this.lastPendingFunctionCalls.map((fc) => ({
      type: "function_call" as const,
      id: fc.id,
      call_id: fc.call_id,
      name: fc.name,
      arguments: fc.arguments,
    }));

    if (this.lastAssistantText.trim().length > 0) {
      this.manualInput = [
        ...this.manualInput,
        { type: "message", role: "assistant", content: this.lastAssistantText },
      ];
    }
    this.manualInput = [...this.manualInput, ...functionCallItems, ...functionCallOutputs];

    if (this.usePreviousResponseId) {
      this.previousResponseId = this.lastResponseId;
      this.openaiInput = functionCallOutputs;
    } else {
      this.openaiInput = this.manualInput;
    }

    // Clear stored state
    this.lastAssistantText = "";
    this.lastPendingFunctionCalls = [];
    this.lastResponseId = null;
  }
}
