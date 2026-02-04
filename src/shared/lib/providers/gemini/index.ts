import type {
  IProvider,
  ProviderConfig,
  ProviderContext,
  StreamEvent,
  IterationResult,
  ToolCallResult,
} from "../types";
import { buildSystemPrompt } from "@/src/server/chat/utils";
import { convertToGeminiContents } from "@/src/shared/lib/gemini/converter";
import { streamGeminiContent } from "@/src/shared/lib/gemini/server";

export class GeminiProvider implements IProvider {
  readonly name = "gemini" as const;

  private config!: ProviderConfig;
  private context!: ProviderContext;
  private initialized = false;
  private contents: ReturnType<typeof convertToGeminiContents> = [];
  private systemInstruction = "";

  initialize(config: ProviderConfig, context: ProviderContext): void {
    this.config = config;
    this.context = context;
    this.initialized = true;

    const basePrompt = buildSystemPrompt();
    const rolePrompt = this.config.systemInstruction?.trim();
    this.systemInstruction = rolePrompt ? `${basePrompt}\n\n${rolePrompt}` : basePrompt;
    this.contents = convertToGeminiContents(this.context.conversationHistory);
  }

  async *runIteration(): AsyncGenerator<StreamEvent, IterationResult, undefined> {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }

    let assistantText = "";

    try {
      for await (const chunk of streamGeminiContent({
        model: this.config.model,
        contents: this.contents,
        systemInstruction: this.systemInstruction,
      })) {
        assistantText += chunk.text;
        yield { type: "content", content: chunk.text };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start Gemini completion";
      const model = this.config?.model ?? "unknown";
      yield { type: "error", message: `错误：Gemini 请求失败 (model=${model}): ${message}` };
      return { shouldContinue: false, pendingToolCalls: [], assistantText: "" };
    }

    return { shouldContinue: false, pendingToolCalls: [], assistantText };
  }

  appendToolResults(_results: ToolCallResult[]): void {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized. Call initialize() first.`);
    }
    // Gemini tool calls are disabled for this backend.
  }
}
