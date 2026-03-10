import Anthropic from '@anthropic-ai/sdk'
import {
  getModelConfig,
  getBackendConfig,
  TITLE_GENERATION_MODEL_ID,
} from '@/server/agents/services/chat-config'
import { getOpenAIClient } from '@/server/agents/services/openai'
import { log } from '@/server/agents/services/logger'

const FALLBACK_TITLE = 'New Chat'

const sanitizeTitle = (value: string) => {
  return value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const CONVERSATION_TITLE_TIMEOUT_MS = 60_000

const TITLE_PROMPT =
  'Based on this conversation, generate a short title (max 10 chars, no quotes). Use the same language as the conversation.'

export const generateTitleFromConversation = async (
  conversationTranscript: string,
): Promise<string> => {
  if (!conversationTranscript.trim()) {
    return FALLBACK_TITLE
  }

  const modelConfig = getModelConfig(TITLE_GENERATION_MODEL_ID)
  if (!modelConfig) {
    return FALLBACK_TITLE
  }

  let backendConfig: ReturnType<typeof getBackendConfig>
  try {
    backendConfig = getBackendConfig(modelConfig.backend)
  } catch {
    return FALLBACK_TITLE
  }

  const prompt = [TITLE_PROMPT, conversationTranscript].join('\n')
  const signal = AbortSignal.timeout(CONVERSATION_TITLE_TIMEOUT_MS)

  try {
    if (modelConfig.format === 'anthropic') {
      const client = new Anthropic({
        apiKey: backendConfig.apiKey,
        baseURL: backendConfig.baseURL,
        defaultHeaders: backendConfig.defaultHeaders,
      })

      const message = await client.messages.create(
        {
          model: modelConfig.model,
          max_tokens: 64,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal },
      )

      const textBlock = message.content.find((block) => block.type === 'text')
      const rawTitle =
        textBlock && 'text' in textBlock
          ? String(textBlock.text).trim()
          : ''
      const title =
        typeof rawTitle === 'string' ? sanitizeTitle(rawTitle) : ''
      return title || FALLBACK_TITLE
    }

    const client = getOpenAIClient(backendConfig)
    const response = await client.chat.completions.create(
      {
        model: modelConfig.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 64,
        temperature: 0.2,
      },
      { signal },
    )

    const rawTitle = response.choices?.[0]?.message?.content?.trim() ?? ''
    const title =
      typeof rawTitle === 'string' ? sanitizeTitle(rawTitle) : ''
    return title || FALLBACK_TITLE
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    log('TITLE', 'Title generation from conversation failed', {
      error: message,
      fullError: error,
    })
    return FALLBACK_TITLE
  }
}
