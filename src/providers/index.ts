import type {
  ChatRunOptions,
  ChatRunResult,
  ChatProviderState,
  ChatStreamEvent,
  ToolInvocationResult,
} from "./types";
import { runAnthropicChat, continueAnthropicChat } from "./anthropic";

export async function* runChat(options: ChatRunOptions): AsyncGenerator<ChatStreamEvent, ChatRunResult> {
  return yield* runAnthropicChat(options);
}

export async function* continueChat(
  options: ChatRunOptions,
  state: ChatProviderState,
  toolResults: ToolInvocationResult[]
): AsyncGenerator<ChatStreamEvent, ChatRunResult> {
  if (state.backend !== options.backend) {
    throw new Error(`Backend mismatch: state=${state.backend} options=${options.backend}`);
  }

  return yield* continueAnthropicChat(options, state, toolResults);
}

export * from "./types";
export { createEventSender, ResearchTracker } from "./stream";
export { executeTools } from "./tools/execute";
