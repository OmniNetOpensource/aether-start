import { applyAssistantAddition } from '@/lib/conversation/tree/block-operations'
import { createChatProvider } from '@/server/agents/services/provider-factory'
import type { ProviderRunResult } from '@/server/agents/services/provider-types'
import {
  getBackendConfig,
  getRoleConfig,
} from '@/server/agents/services/chat-config'
import { getAvailableTools, executeToolsGen } from '@/server/agents/tools/executor'
import type {
  ChatServerToClientEvent,
  PendingToolInvocation,
  ToolInvocationResult,
} from '@/types/chat-api'
import type { AssistantContentBlock, SerializedMessage } from '@/types/message'

const MAX_ITERATIONS = 200

const toToolResultText = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value ?? '')
  }
}

const applyArenaEvent = (
  blocks: AssistantContentBlock[],
  event: ChatServerToClientEvent,
): AssistantContentBlock[] => {
  if (event.type === 'content') {
    return applyAssistantAddition(blocks, {
      type: 'content',
      content: typeof event.content === 'string' ? event.content : String(event.content ?? ''),
    })
  }

  if (event.type === 'thinking') {
    return applyAssistantAddition(blocks, {
      kind: 'thinking',
      text: typeof event.content === 'string' ? event.content : String(event.content ?? ''),
    })
  }

  if (event.type === 'tool_call') {
    return applyAssistantAddition(blocks, {
      kind: 'tool',
      data: {
        call: {
          tool: typeof event.tool === 'string' ? event.tool : 'unknown_tool',
          args: event.args && typeof event.args === 'object'
            ? (event.args as Record<string, unknown>)
            : {},
        },
        progress: [],
      },
    })
  }

  if (event.type === 'tool_progress') {
    return applyAssistantAddition(blocks, {
      kind: 'tool_progress',
      tool: typeof event.tool === 'string' ? event.tool : 'unknown_tool',
      stage: typeof event.stage === 'string' ? event.stage : 'progress',
      message: typeof event.message === 'string' ? event.message : String(event.message ?? ''),
      receivedBytes: typeof event.receivedBytes === 'number' ? event.receivedBytes : undefined,
      totalBytes: typeof event.totalBytes === 'number' ? event.totalBytes : undefined,
    })
  }

  if (event.type === 'tool_result') {
    return applyAssistantAddition(blocks, {
      kind: 'tool_result',
      tool: typeof event.tool === 'string' ? event.tool : 'unknown_tool',
      result: toToolResultText(event.result),
    })
  }

  if (event.type === 'error') {
    return applyAssistantAddition(blocks, {
      type: 'error',
      message: typeof event.message === 'string' ? event.message : String(event.message ?? ''),
    })
  }

  return blocks
}

const executeToolsAndCollect = async (
  pendingToolCalls: PendingToolInvocation[],
  signal: AbortSignal | undefined,
  onEvent: (event: ChatServerToClientEvent) => void,
): Promise<ToolInvocationResult[]> => {
  const toolGen = executeToolsGen(pendingToolCalls, signal)
  let toolResults: ToolInvocationResult[] = []

  while (true) {
    const toolGenResult = await toolGen.next()
    if (toolGenResult.done) {
      toolResults = toolGenResult.value
      break
    }

    onEvent(toolGenResult.value)

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
  }

  return toolResults
}

export const runArenaRoundForRole = async (input: {
  roleId: string
  conversationHistory: SerializedMessage[]
  signal?: AbortSignal
}): Promise<AssistantContentBlock[]> => {
  const roleConfig = getRoleConfig(input.roleId)
  if (!roleConfig) {
    return [{ type: 'error', message: `Invalid role: ${input.roleId}` }]
  }

  const normalizedHistory = input.conversationHistory.map((message) => ({
    ...message,
    blocks: Array.isArray(message.blocks) ? message.blocks : [],
  } as SerializedMessage))

  if (normalizedHistory.length === 0) {
    return [{ type: 'error', message: 'Missing user prompt' }]
  }

  const backendConfig = getBackendConfig(roleConfig.backend, roleConfig.format)
  const tools = getAvailableTools()

  let blocks: AssistantContentBlock[] = []
  let iteration = 0

  const onEvent = (event: ChatServerToClientEvent) => {
    blocks = applyArenaEvent(blocks, event)
  }

  try {
    const provider = createChatProvider(roleConfig.format, {
      model: roleConfig.model,
      backendConfig,
      tools,
      systemPrompt: roleConfig.systemPrompt,
    })

    let workingMessages = await provider.convertMessages(normalizedHistory)

    while (iteration < MAX_ITERATIONS) {
      if (input.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      iteration += 1
      const generator = provider.run(workingMessages, input.signal)

      let pendingToolCalls: PendingToolInvocation[] = []
      let assistantText = ''
      let runResult: ProviderRunResult = { pendingToolCalls, thinkingBlocks: [] }

      while (true) {
        const { done, value } = await generator.next()
        if (done) {
          runResult = value
          pendingToolCalls = value.pendingToolCalls
          break
        }

        if (value.type === 'content') {
          assistantText += value.content
        }

        onEvent(value)

        if (input.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
      }

      if (pendingToolCalls.length === 0) {
        break
      }

      const toolResults = await executeToolsAndCollect(pendingToolCalls, input.signal, onEvent)
      const continuationMessages = provider.formatToolContinuation(
        assistantText,
        runResult,
        pendingToolCalls,
        toolResults,
      )
      workingMessages = [...workingMessages, ...continuationMessages]
    }

    if (iteration >= MAX_ITERATIONS) {
      onEvent({
        type: 'error',
        message: `[已达到最大工具调用次数限制] iteration=${iteration} maxIterations=${MAX_ITERATIONS} model=${roleConfig.model}`,
      })
    }
  } catch (error) {
    const isAbortError =
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError') ||
      input.signal?.aborted

    if (isAbortError) {
      onEvent({ type: 'error', message: '请求已取消' })
    } else {
      onEvent({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (blocks.length === 0) {
    return [{ type: 'error', message: '模型未返回有效内容' }]
  }

  return blocks
}
