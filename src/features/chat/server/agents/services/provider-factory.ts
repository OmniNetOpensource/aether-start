import type { ChatFormat } from '@/server/agents/services/chat-config'
import type { ChatProvider, ChatProviderConfig } from './provider-types'
import { createAnthropicAdapter } from './anthropic'
import { createOpenAIAdapter } from './openai'
import { createOpenAIResponsesAdapter } from './openai-responses'
import { createGeminiAdapter } from './gemini'

export function createChatProvider(format: ChatFormat, config: ChatProviderConfig): ChatProvider {
  switch (format) {
    case 'anthropic':
      return createAnthropicAdapter(config) as ChatProvider
    case 'openai':
      return createOpenAIAdapter(config) as ChatProvider
    case 'openai-responses':
      return createOpenAIResponsesAdapter(config) as ChatProvider
    case 'gemini':
      return createGeminiAdapter(config) as ChatProvider
  }
}
