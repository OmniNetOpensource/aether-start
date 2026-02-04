import type {
  ChatRunOptions,
  ChatRunResult,
  ChatProviderState,
  ChatStreamEvent,
  ToolInvocationResult,
} from "./types";
import { runAnthropicChat, continueAnthropicChat } from "./anthropic";
import { runOpenAIChat, continueOpenAIChat } from "./openai";
import { runGeminiChat, continueGeminiChat } from "./gemini";
import { runOpenRouterChat, continueOpenRouterChat } from "./openrouter";

export async function* runChat(options: ChatRunOptions): AsyncGenerator<ChatStreamEvent, ChatRunResult> {
  switch (options.backend) {
    case "anthropic":
      return yield* runAnthropicChat(options);
    case "openai":
      return yield* runOpenAIChat(options);
    case "gemini":
      return yield* runGeminiChat(options);
    case "openrouter":
      return yield* runOpenRouterChat(options);
    default:
      throw new Error(`Unknown backend: ${String(options.backend)}`);
  }
}

export async function* continueChat(
  options: ChatRunOptions,
  state: ChatProviderState,
  toolResults: ToolInvocationResult[]
): AsyncGenerator<ChatStreamEvent, ChatRunResult> {
  if (state.backend !== options.backend) {
    throw new Error(`Backend mismatch: state=${state.backend} options=${options.backend}`);
  }

  switch (state.backend) {
    case "anthropic":
      return yield* continueAnthropicChat(options, state, toolResults);
    case "openai":
      return yield* continueOpenAIChat(options, state, toolResults);
    case "gemini":
      return yield* continueGeminiChat(options, state, toolResults);
    case "openrouter":
      return yield* continueOpenRouterChat(options, state, toolResults);
    default:
      throw new Error(`Unknown backend: ${String(state.backend)}`);
  }
}

export * from "./types";
export { createEventSender, ResearchTracker } from "./stream";
export { executeTools } from "./tools/execute";
