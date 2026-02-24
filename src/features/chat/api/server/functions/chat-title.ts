import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import type { SerializedMessage } from '@/features/chat/types/chat'
import { getAnthropicConfig } from '@/features/chat/api/server/services/chat-config'

const FALLBACK_TITLE = 'New Chat'

const extractContent = (message?: SerializedMessage) => {
  if (!message?.blocks) {
    return ''
  }

  return message.blocks
    .filter((block) => block.type === 'content')
    .map((block) => block.content)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const sanitizeTitle = (value: string) => {
  return value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  blocks: z.array(z.any()),
})

const TITLE_GENERATION_TIMEOUT_MS = 10000
const CONVERSATION_TITLE_TIMEOUT_MS = 30_000
const TITLE_MODEL = 'claude-haiku-4-5'

export const generateTitleFromUserMessage = async (
  userText: string,
): Promise<string> => {
  if (!userText.trim()) {
    return FALLBACK_TITLE
  }

  let anthropicConfig: ReturnType<typeof getAnthropicConfig>
  try {
    anthropicConfig = getAnthropicConfig()
  } catch {
    return FALLBACK_TITLE
  }

  const prompt =
    'Based on this user message, generate a short title (max 10 chars, no quotes). Use the same language as the message.\n' +
    `User: ${userText}`

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
      { signal: AbortSignal.timeout(TITLE_GENERATION_TIMEOUT_MS) },
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
    console.error('Title generation failed:', message)
    return FALLBACK_TITLE
  }
}

export const generateTitleFromConversation = async (
  userText: string,
  assistantText: string,
): Promise<string> => {
  if (!userText.trim() && !assistantText.trim()) {
    return FALLBACK_TITLE
  }

  let anthropicConfig: ReturnType<typeof getAnthropicConfig>
  try {
    anthropicConfig = getAnthropicConfig()
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

export const generateTitleFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      messages: z.array(messageSchema),
    }),
  )
  .handler(async ({ data }) => {
    const { messages } = data

    const userMessage = messages.find(
      (message) => message.role === 'user',
    ) as SerializedMessage | undefined
    const assistantMessage = messages.find(
      (message) => message.role === 'assistant',
    ) as SerializedMessage | undefined
    const userText = extractContent(userMessage)
    const assistantText = extractContent(assistantMessage)

    if (!assistantText) {
      return { title: FALLBACK_TITLE }
    }

    let anthropicConfig: ReturnType<typeof getAnthropicConfig>
    try {
      anthropicConfig = getAnthropicConfig()
    } catch {
      return { title: FALLBACK_TITLE }
    }
    const titleModel = 'claude-haiku-4-5'

    const promptLines = [
      'Based on this conversation, generate a short title (max 10 chars, no quotes). Use the same language as the conversation.',
      userText ? `User: ${userText}` : '',
      `Assistant: ${assistantText}`,
    ].filter((line) => line.length > 0)

    const prompt = promptLines.join('\n')

    const client = new Anthropic({
      apiKey: anthropicConfig.apiKey,
      baseURL: anthropicConfig.baseURL,
      defaultHeaders: anthropicConfig.defaultHeaders,
    })

    let rawTitle = ''
    try {
      const response = await client.messages.create({
        model: titleModel,
        max_tokens: 64,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      })
      rawTitle = Array.isArray(response.content)
        ? response.content
            .map((block) => (block.type === 'text' ? block.text : ''))
            .join('')
        : ''
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      console.error('Title generation failed:', message)
      return { title: FALLBACK_TITLE }
    }

    const title =
      typeof rawTitle === 'string' ? sanitizeTitle(rawTitle) : ''

    if (!title) {
      return { title: FALLBACK_TITLE }
    }

    return { title }
  })
