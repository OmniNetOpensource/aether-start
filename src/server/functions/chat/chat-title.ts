import Anthropic from '@anthropic-ai/sdk'
import { getBackendConfig } from '@/server/agents/services/chat-config'

const FALLBACK_TITLE = 'New Chat'

const sanitizeTitle = (value: string) => {
  return value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const CONVERSATION_TITLE_TIMEOUT_MS = 30_000
const TITLE_MODEL = 'claude-haiku-4-5'

export const generateTitleFromConversation = async (
  userText: string,
  assistantText: string,
): Promise<string> => {
  if (!userText.trim() && !assistantText.trim()) {
    return FALLBACK_TITLE
  }

  let anthropicConfig: ReturnType<typeof getBackendConfig>
  try {
    anthropicConfig = getBackendConfig('rightcode')
  } catch {
    return FALLBACK_TITLE
  }

  const promptLines = [
    'Based on this conversation, generate a short title (max 10 chars, no quotes). Use the same language as the conversation.',
    userText ? `User: ${userText}` : '',
    assistantText ? `Assistant: ${assistantText}` : '',
  ].filter((line) => line.length > 0)

  const prompt = promptLines.join('\n')

  const client = new Anthropic({
    apiKey: anthropicConfig.apiKey,
    baseURL: anthropicConfig.baseURL,
    defaultHeaders: anthropicConfig.defaultHeaders,
  })

  try {
    const response = await client.messages.create(
      {
        model: TITLE_MODEL,
        max_tokens: 64,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: AbortSignal.timeout(CONVERSATION_TITLE_TIMEOUT_MS) },
    )

    const rawTitle = Array.isArray(response.content)
      ? response.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join('')
      : ''

    const title =
      typeof rawTitle === 'string' ? sanitizeTitle(rawTitle) : ''

    return title || FALLBACK_TITLE
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    console.error('Title generation from conversation failed:', message)
    return FALLBACK_TITLE
  }
}
