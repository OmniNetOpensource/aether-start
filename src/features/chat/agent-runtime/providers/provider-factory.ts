import type { ChatFormat } from '@/features/chat/model-catalog';
import type { ChatProvider, ChatProviderConfig } from './provider-types';

export async function createChatProvider(
  format: ChatFormat,
  config: ChatProviderConfig,
): Promise<ChatProvider> {
  switch (format) {
    case 'anthropic': {
      const { createAnthropicAdapter } = await import('./anthropic');
      return createAnthropicAdapter(config);
    }
    case 'openai': {
      const { createOpenAIAdapter } = await import('./openai');
      return createOpenAIAdapter(config);
    }
    case 'openai-responses': {
      const { createOpenAIResponsesAdapter } = await import('./openai-responses');
      return createOpenAIResponsesAdapter(config);
    }
    case 'gemini': {
      const { createGeminiAdapter } = await import('./gemini');
      return createGeminiAdapter(config);
    }
  }
}
