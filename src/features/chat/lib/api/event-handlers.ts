import type { ChatServerToClientEvent } from '@/types/chat-event-types'
import { useConversationsStore } from '@/stores/zustand/useConversationsStore'
import { useMessageTreeStore } from '@/stores/zustand/useMessageTreeStore'

export const enhanceServerErrorMessage = (safeMessage: string) => {
  const lowerMessage = safeMessage.toLowerCase()

  if (lowerMessage.includes('load error') || lowerMessage.includes('load_error')) {
    return (
      `Model load failed: ${safeMessage}\n` +
      'Possible cause: network instability or model service unavailable.\n' +
      'Suggestion: retry later or switch to another model.'
    )
  }

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return (
      `Request timed out: ${safeMessage}\n` +
      'Possible cause: network latency is too high or the server responded too slowly.\n' +
      'Suggestion: retry later.'
    )
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return (
      `Rate limit reached: ${safeMessage}\n` +
      'Possible cause: too many requests in a short time.\n' +
      'Suggestion: wait a moment and try again.'
    )
  }

  if (lowerMessage.includes('unavailable') || lowerMessage.includes('503')) {
    return (
      `Service unavailable: ${safeMessage}\n` +
      'Possible cause: maintenance or temporary overload.\n' +
      'Suggestion: retry later.'
    )
  }

  if (lowerMessage.includes('connection') || lowerMessage.includes('network')) {
    return (
      `Network connection issue: ${safeMessage}\n` +
      'Possible cause: unstable connection or interrupted request.\n' +
      'Suggestion: check your network and try again.'
    )
  }

  return (
    `Request failed: ${safeMessage}\n` +
    'Possible cause: service or network issue.\n' +
    'Suggestion: retry later or refresh the page.'
  )
}

export const applyChatEventToTree = (
  event: ChatServerToClientEvent,
) => {
  if (event.type === 'conversation_updated') {
    if (event.title) {
      const now = event.updated_at ?? new Date().toISOString()
      useConversationsStore.getState().addConversation({
        id: event.conversationId,
        title: event.title,
        is_pinned: false,
        pinned_at: null,
        created_at: now,
        updated_at: now,
      })
    }
    return
  }

  if (event.type === 'thinking') {
    useMessageTreeStore.getState().appendToAssistant({
      kind: 'thinking',
      text:
        typeof event.content === 'string'
          ? event.content
          : String(event.content ?? ''),
    })
    return
  }

  if (event.type === 'tool_call') {
    const tool = typeof event.tool === 'string' ? event.tool : 'unknown_tool'
    const args =
      event.args && typeof event.args === 'object'
        ? (event.args as Record<string, unknown>)
        : {}

    useMessageTreeStore.getState().appendToAssistant({
      kind: 'tool',
      data: {
        call: {
          tool,
          args,
        },
      },
    })
    return
  }

  if (event.type === 'tool_result') {
    let resultText: string
    if (typeof event.result === 'string') {
      resultText = event.result
    } else {
      try {
        resultText = JSON.stringify(event.result, null, 2)
      } catch {
        resultText = String(event.result ?? '')
      }
    }

    useMessageTreeStore.getState().appendToAssistant({
      kind: 'tool_result',
      tool: typeof event.tool === 'string' ? event.tool : 'unknown_tool',
      result: resultText,
    })
    return
  }

  if (event.type === 'error') {
    const rawMessage =
      typeof event.message === 'string'
        ? event.message
        : String(event.message ?? '')
    const safeMessage = rawMessage || 'unknown error'
    const enhancedMessage = enhanceServerErrorMessage(safeMessage)

    useMessageTreeStore.getState().appendToAssistant({
      type: 'error',
      message: enhancedMessage,
    })
    return
  }

  if (event.type === 'content') {
    const addition =
      typeof event.content === 'string'
        ? event.content
        : String(event.content ?? '')
    useMessageTreeStore.getState().appendToAssistant({
      type: 'content',
      content: addition,
    })
  }
}
