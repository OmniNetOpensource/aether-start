import { applyAssistantAddition, cloneMessages } from '@/features/conversation/model/tree/block-operations'
import { addMessage, buildCurrentPath } from '@/features/conversation/model/tree/message-tree'
import type { MessageTreeSnapshot, ChatServerToClientEvent } from '@/features/chat/api/types/schemas/types'
import type { AssistantMessage, Message } from '@/features/conversation/model/types/message'

type TreeAccumulatorState = MessageTreeSnapshot

const ensureAssistantTarget = (state: TreeAccumulatorState) => {
  const lastId = state.currentPath[state.currentPath.length - 1] ?? null
  const lastMessage = lastId ? state.messages[lastId - 1] : null

  if (lastMessage && lastMessage.role === 'assistant') {
    return {
      state,
      assistantId: lastId,
    }
  }

  const result = addMessage(
    {
      messages: state.messages,
      currentPath: state.currentPath,
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    },
    'assistant',
    [],
  )

  return {
    state: {
      messages: result.messages,
      currentPath: result.currentPath,
      latestRootId: result.latestRootId,
      nextId: result.nextId,
    },
    assistantId: result.addedMessage.id,
  }
}

const appendToAssistant = (
  state: TreeAccumulatorState,
  addition:
    | { type: 'content'; content: string }
    | { type: 'error'; message: string }
    | { kind: 'thinking'; text: string }
    | { kind: 'tool'; data: { call: { tool: string; args: Record<string, unknown> }; progress: [] } }
    | {
        kind: 'tool_progress'
        tool: string
        stage: string
        message: string
        receivedBytes?: number
        totalBytes?: number
      }
    | { kind: 'tool_result'; tool: string; result: string },
): TreeAccumulatorState => {
  const target = ensureAssistantTarget(state)
  const nextMessages = [...target.state.messages]
  const assistant = nextMessages[target.assistantId - 1]

  if (!assistant || assistant.role !== 'assistant') {
    return target.state
  }

  const updatedAssistant: AssistantMessage = {
    ...(assistant as AssistantMessage),
    blocks: applyAssistantAddition((assistant as AssistantMessage).blocks ?? [], addition),
  }

  nextMessages[target.assistantId - 1] = updatedAssistant

  return {
    ...target.state,
    messages: nextMessages,
  }
}

const normalizeToolArgs = (args: unknown) =>
  (args && typeof args === 'object' ? args : {}) as Record<string, unknown>

export const applyServerEventToTree = (
  state: TreeAccumulatorState,
  event: ChatServerToClientEvent,
): TreeAccumulatorState => {
  if (event.type === 'content') {
    return appendToAssistant(state, {
      type: 'content',
      content: typeof event.content === 'string' ? event.content : String(event.content ?? ''),
    })
  }

  if (event.type === 'thinking') {
    return appendToAssistant(state, {
      kind: 'thinking',
      text: typeof event.content === 'string' ? event.content : String(event.content ?? ''),
    })
  }

  if (event.type === 'tool_call') {
    return appendToAssistant(state, {
      kind: 'tool',
      data: {
        call: {
          tool: typeof event.tool === 'string' ? event.tool : 'unknown_tool',
          args: normalizeToolArgs(event.args),
        },
        progress: [],
      },
    })
  }

  if (event.type === 'tool_progress') {
    return appendToAssistant(state, {
      kind: 'tool_progress',
      tool: typeof event.tool === 'string' ? event.tool : 'unknown_tool',
      stage: typeof event.stage === 'string' ? event.stage : 'progress',
      message: typeof event.message === 'string' ? event.message : String(event.message ?? ''),
      receivedBytes: typeof event.receivedBytes === 'number' ? event.receivedBytes : undefined,
      totalBytes: typeof event.totalBytes === 'number' ? event.totalBytes : undefined,
    })
  }

  if (event.type === 'tool_result') {
    const resultText =
      typeof event.result === 'string'
        ? event.result
        : (() => {
            try {
              return JSON.stringify(event.result, null, 2)
            } catch {
              return String(event.result ?? '')
            }
          })()

    return appendToAssistant(state, {
      kind: 'tool_result',
      tool: typeof event.tool === 'string' ? event.tool : 'unknown_tool',
      result: resultText,
    })
  }

  if (event.type === 'error') {
    return appendToAssistant(state, {
      type: 'error',
      message: typeof event.message === 'string' ? event.message : String(event.message ?? ''),
    })
  }

  return state
}

export const cloneTreeSnapshot = (snapshot: MessageTreeSnapshot): MessageTreeSnapshot => {
  const clonedMessages = cloneMessages(snapshot.messages as Message[])
  const latestRootId =
    typeof snapshot.latestRootId === 'number' ? snapshot.latestRootId : clonedMessages[0]?.id ?? null
  const currentPath =
    Array.isArray(snapshot.currentPath) && snapshot.currentPath.every((id) => typeof id === 'number')
      ? [...snapshot.currentPath]
      : buildCurrentPath(clonedMessages, latestRootId)
  const nextId =
    typeof snapshot.nextId === 'number'
      ? snapshot.nextId
      : clonedMessages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1

  return {
    messages: clonedMessages,
    currentPath,
    latestRootId,
    nextId,
  }
}
