import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { toolSpecs } from '@/src/providers/tools/registry'
import { isSupportedChatModel } from '@/src/providers/config'
import {
  getDefaultRoleConfig,
  getRoleConfig,
} from '@/src/providers/config'
import {
  type ConversationLogger,
  createConversationLogger,
} from '@/src/providers/logger'
import {
  runAnthropicChat,
  continueAnthropicChat,
} from '@/src/providers/anthropic'
import { executeToolsGen } from '@/src/providers/tools/execute'
import type {
  ChatStreamEvent,
  ChatRunOptions,
  ChatRunResult,
  ChatProviderState,
  ToolInvocationResult,
} from '@/src/providers/types'

const generateConversationId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  blocks: z.array(z.any()),
})

const chatInputSchema = z.object({
  conversationHistory: z.array(messageSchema),
  conversationId: z.string().nullable().optional(),
  role: z.string().optional(),
})

export const streamChatFn = createServerFn({ method: 'POST' })
  .inputValidator(chatInputSchema)
  // @ts-expect-error TanStack Start supports async generators at runtime via seroval
  .handler(async function* ({ data }) {
    let logger: ConversationLogger | null = null

    try {
      const { conversationHistory, conversationId, role } = data

      logger = createConversationLogger()

      const messageCount = Array.isArray(conversationHistory)
        ? conversationHistory.length
        : 0
      logger?.log('FRONTEND', 'Received chat request', {
        conversationId,
        role,
        messageCount,
        conversationHistoryType: Array.isArray(conversationHistory)
          ? 'array'
          : typeof conversationHistory,
      })

      if (
        !Array.isArray(conversationHistory) ||
        conversationHistory.length === 0
      ) {
        yield {
          type: 'error',
          message: 'Invalid conversation history: expected non-empty array.',
        } satisfies ChatStreamEvent
        return
      }

      const latestUserMessage = [...conversationHistory]
        .reverse()
        .find((msg) => msg.role === 'user')

      if (
        !latestUserMessage ||
        !Array.isArray(latestUserMessage.blocks) ||
        latestUserMessage.blocks.length === 0
      ) {
        yield {
          type: 'error',
          message: 'Missing user message: latest user message missing or has empty blocks.',
        } satisfies ChatStreamEvent
        return
      }

      const roleConfig = role ? getRoleConfig(role) : getDefaultRoleConfig()

      if (!roleConfig) {
        yield {
          type: 'error',
          message: `Invalid or missing role: "${String(role ?? "")}".`,
        } satisfies ChatStreamEvent
        return
      }

      if (!isSupportedChatModel(roleConfig.model)) {
        yield {
          type: 'error',
          message: `Invalid or missing model: "${String(roleConfig.model ?? "")}".`,
        } satisfies ChatStreamEvent
        return
      }

      const requestedModel = roleConfig.model
      const systemInstruction = roleConfig.systemPrompt

      const allowedToolNames = new Set<string>(['fetch_url', 'search'])

      const tools = toolSpecs.filter(
        (tool) =>
          tool.type === 'function' &&
          allowedToolNames.has(tool.function.name),
      )

      let activeConversationId = conversationId ?? null

      if (!activeConversationId) {
        const newId = generateConversationId()
        activeConversationId = newId
        const title = 'New Chat'
        const now = new Date().toISOString()
        yield {
          type: 'conversation_created',
          conversationId: newId,
          title,
          user_id: '',
          created_at: now,
          updated_at: now,
        } satisfies ChatStreamEvent
      }

      const chatOptions: ChatRunOptions = {
        model: requestedModel,
        tools,
        systemPrompt: systemInstruction,
        messages: conversationHistory.map((message) => ({
          ...message,
          blocks: Array.isArray(message.blocks) ? message.blocks : [],
        })),
      }

      const maxIterations = 200
      let iteration = 0
      let state: ChatProviderState | undefined
      let pendingToolResults: ToolInvocationResult[] | null = null

      while (iteration < maxIterations) {
        iteration++

        const generator =
          pendingToolResults && state
            ? continueAnthropicChat(chatOptions, state, pendingToolResults)
            : runAnthropicChat(chatOptions)
        let result: ChatRunResult | undefined

        while (true) {
          const { done, value } = await generator.next()
          if (done) {
            result = value
            break
          }
          yield value
        }

        if (!result) {
          break
        }

        state = result.state ?? state

        if (!result.shouldContinue) {
          break
        }

        if (!state) {
          yield {
            type: 'error',
            message: `错误：缺少继续对话所需的状态 (model=${requestedModel})`,
          } satisfies ChatStreamEvent
          break
        }

        if (activeConversationId) {
          yield {
            type: 'conversation_updated',
            conversationId: activeConversationId,
            updated_at: new Date().toISOString(),
          } satisfies ChatStreamEvent
        }

        const toolGen = executeToolsGen(
          result.pendingToolCalls,
          logger,
        )
        let toolGenResult: IteratorResult<ChatStreamEvent, ToolInvocationResult[]>
        while (true) {
          toolGenResult = await toolGen.next()
          if (toolGenResult.done) {
            break
          }
          yield toolGenResult.value
        }

        pendingToolResults = toolGenResult!.value
      }

      if (iteration >= maxIterations) {
        yield {
          type: 'error',
          message: `[已达到最大工具调用次数限制] iteration=${iteration} maxIterations=${maxIterations} model=${requestedModel}`,
        } satisfies ChatStreamEvent
      }

      if (activeConversationId) {
        yield {
          type: 'conversation_updated',
          conversationId: activeConversationId,
          updated_at: new Date().toISOString(),
        } satisfies ChatStreamEvent
      }
    } catch (error) {
      const errorName =
        error instanceof Error ? error.name : 'UnknownError'
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger?.log('ERROR', 'Chat stream error', {
        errorName,
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      yield {
        type: 'error',
        message: `错误：${errorName}: ${errorMessage}`,
      } satisfies ChatStreamEvent
    }
  })
