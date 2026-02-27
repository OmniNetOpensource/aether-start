import type { ChatServerToClientEvent } from '@/types/chat-event-types'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { useConversationsStore } from '@/stores/useConversationsStore'

export const enhanceServerErrorMessage = (safeMessage: string) => {
  const lowerMessage = safeMessage.toLowerCase()

  if (lowerMessage.includes('load error') || lowerMessage.includes('load_error')) {
    return (
      `模型加载失败: ${safeMessage}\n` +
      `可能原因: 网络不稳定、模型服务暂时不可用\n` +
      `建议: 请稍后重试或切换其他模型\n` +
      `提示: 若持续出现，可尝试刷新页面`
    )
  }

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return (
      `请求超时: ${safeMessage}\n` +
      `可能原因: 网络延迟过高、服务器响应缓慢\n` +
      `建议: 请稍后重试\n` +
      `提示: 可尝试切换网络或降低请求频率`
    )
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return (
      `请求频率限制: ${safeMessage}\n` +
      `可能原因: 短时间内请求过多\n` +
      `建议: 请稍等片刻后重试`
    )
  }

  if (lowerMessage.includes('unavailable') || lowerMessage.includes('503')) {
    return (
      `服务暂时不可用: ${safeMessage}\n` +
      `可能原因: 服务器维护或过载\n` +
      `建议: 请稍后重试`
    )
  }

  if (lowerMessage.includes('connection') || lowerMessage.includes('network')) {
    return (
      `网络连接问题: ${safeMessage}\n` +
      `可能原因: 网络不稳定、连接被中断\n` +
      `建议: 请检查网络连接后重试`
    )
  }

  return (
    `请求失败: ${safeMessage}\n` +
    `可能原因: 服务异常或网络问题\n` +
    `建议: 请稍后重试或刷新页面`
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
    const tool = typeof event.tool === 'string' ? event.tool : '未知工具'
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
        progress: [],
      },
    })
    return
  }

  if (event.type === 'tool_progress') {
    useMessageTreeStore.getState().appendToAssistant({
      kind: 'tool_progress',
      tool: typeof event.tool === 'string' ? event.tool : '未知工具',
      stage: typeof event.stage === 'string' ? event.stage : 'progress',
      message:
        typeof event.message === 'string'
          ? event.message
          : String(event.message ?? ''),
      receivedBytes:
        typeof event.receivedBytes === 'number'
          ? event.receivedBytes
          : undefined,
      totalBytes:
        typeof event.totalBytes === 'number'
          ? event.totalBytes
          : undefined,
    })
    return
  }

  if (event.type === 'tool_result') {
    let resultText = ''
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
      tool: typeof event.tool === 'string' ? event.tool : '未知工具',
      result: resultText,
    })
    return
  }

  if (event.type === 'error') {
    const rawMessage =
      typeof event.message === 'string'
        ? event.message
        : String(event.message ?? '')
    const safeMessage = rawMessage || '未知错误'
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
