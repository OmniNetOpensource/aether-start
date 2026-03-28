import type { ChatFormat } from '@/features/chat/model-catalog';
import type { ChatProvider, ChatProviderConfig } from './provider-types';

export async function createChatProvider(
  format: ChatFormat,
  config: ChatProviderConfig,
): Promise<ChatProvider> {
  switch (format) {
    case 'anthropic': {
      const { createAnthropicAdapter } = await import('./backends/anthropic');
      return createAnthropicAdapter(config);
    }
    case 'openai': {
      const { createOpenAIAdapter } = await import('./backends/openai');
      return createOpenAIAdapter(config);
    }
    case 'openai-responses': {
      const { createOpenAIResponsesAdapter } = await import('./backends/openai-responses');
      return createOpenAIResponsesAdapter(config);
    }
    case 'gemini': {
      const { createGeminiAdapter } = await import('./backends/gemini');
      return createGeminiAdapter(config);
    }
  }
}
