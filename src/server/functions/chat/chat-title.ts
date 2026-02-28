import { getBackendConfig } from '@/server/agents/services/chat-config'
import { getGeminiClient } from '@/server/agents/services/gemini'
import { log } from '@/server/agents/services/logger'

const FALLBACK_TITLE = 'New Chat'

const sanitizeTitle = (value: string) => {
  return value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const CONVERSATION_TITLE_TIMEOUT_MS = 60_000
const TITLE_MODEL = 'gemini-3-flash-preview'

export const generateTitleFromConversation = async (
  userText: string,
  assistantText: string,
): Promise<string> => {
  if (!userText.trim() && !assistantText.trim()) {
    return FALLBACK_TITLE
  }

  let backendConfig: ReturnType<typeof getBackendConfig>
  try {
    backendConfig = getBackendConfig('rightcode-gemini')
  } catch {
    return FALLBACK_TITLE
  }

  const promptLines = [
    'Based on this conversation, generate a short title (max 10 chars, no quotes). Use the same language as the conversation.',
    userText ? `User: ${userText}` : '',
    assistantText ? `Assistant: ${assistantText}` : '',
  ].filter((line) => line.length > 0)

  const prompt = promptLines.join('\n')
  const client = getGeminiClient(backendConfig)

  try {
    const response = await client.models.generateContent({
      model: TITLE_MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: 64,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(CONVERSATION_TITLE_TIMEOUT_MS),
      },
    })

    const rawTitle = response.text?.trim() ?? ''

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
