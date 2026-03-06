import { getBackendConfig } from '@/server/agents/services/chat-config'
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
const TITLE_MODEL = 'gpt-5.4'

export const generateTitleFromConversation = async (
  userText: string,
  assistantText: string,
): Promise<string> => {
  if (!userText.trim() && !assistantText.trim()) {
    return FALLBACK_TITLE
  }

  let backendConfig: ReturnType<typeof getBackendConfig>
  try {
    backendConfig = getBackendConfig('rightcode-openai')
  } catch {
    return FALLBACK_TITLE
  }

  const promptLines = [
    'Based on this conversation, generate a short title (max 10 chars, no quotes). Use the same language as the conversation.',
    userText ? `User: ${userText}` : '',
    assistantText ? `Assistant: ${assistantText}` : '',
  ].filter((line) => line.length > 0)

  const prompt = promptLines.join('\n')
  const client = getOpenAIClient(backendConfig)

  try {
    const response = await client.chat.completions.create(
      {
        model: TITLE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 64,
        temperature: 0.2,
      },
      { signal: AbortSignal.timeout(CONVERSATION_TITLE_TIMEOUT_MS) },
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
