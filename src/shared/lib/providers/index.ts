import type { Backend } from "@/src/features/chat/types/chat";
import type { IProvider } from "./types";
import { OpenRouterProvider } from "./openrouter";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";

/**
 * Get a provider instance by backend name
 */
export function getProvider(backend: Backend): IProvider {
  switch (backend) {
    case "openrouter":
      return new OpenRouterProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    default:
      throw new Error(`Unknown backend: ${backend}`);
  }
}

// Re-export types and utilities
export * from "./types";
export { createEventSender } from "./stream-controller";
export { ResearchTracker } from "./research-tracker";
export { executeTools } from "./tool-executor";
export { OpenRouterProvider } from "./openrouter";
export { AnthropicProvider } from "./anthropic";
export { OpenAIProvider } from "./openai";
