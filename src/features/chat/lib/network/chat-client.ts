import { SerializedMessage } from '@/src/features/chat/types/chat'
import type { ChatStreamEvent } from '@/src/providers/types'
import { streamChatFn } from '@/src/server/functions/chat'

type ChatClientOptions = {
  onEvent: (event: ChatStreamEvent) => void
  onError: (error: Error) => void
  onFinish?: () => void
}

export class ChatClient {
  private abortController: AbortController | null = null

  constructor(private options: ChatClientOptions) {}

  public async sendMessage(
    messages: SerializedMessage[],
    role: string,
    conversationId: string | null
  ) {
    this.abortController = new AbortController()

    try {
      const result = await streamChatFn({
        data: {
          conversationHistory: messages,
          conversationId: conversationId ?? null,
          role,
        },
        signal: this.abortController.signal,
      })

      // @ts-expect-error streamChatFn returns async iterable at runtime
      for await (const event of result) {
        this.options.onEvent(event as ChatStreamEvent)
      }
    } catch (error) {
      const isAbortError =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError')

      if (!isAbortError) {
        const enhancedError = this.enhanceError(error)
        this.options.onError(enhancedError)
      }
    } finally {
      this.abortController = null
      this.options.onFinish?.()
    }
  }

  public abort() {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  private enhanceError(error: unknown): Error {
    if (!(error instanceof Error)) {
      return new Error(`未知错误: ${String(error)}`)
    }

    const errorName = error.name
    const errorMessage = error.message

    if (error instanceof TypeError && errorMessage.includes('fetch')) {
      return new Error(
        `网络连接失败: ${errorMessage}\n` +
        `可能原因: 网络断开、DNS 解析失败、服务器不可达\n` +
        `建议: 请检查网络连接后重试`
      )
    }

    if (errorName === 'TimeoutError' || errorMessage.includes('timeout')) {
      return new Error(
        `请求超时: ${errorMessage}\n` +
        `可能原因: 网络延迟过高、服务器响应缓慢\n` +
        `建议: 请稍后重试`
      )
    }

    if (
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('socket') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      return new Error(
        `网络中断: ${errorMessage}\n` +
        `可能原因: 网络不稳定、连接被重置\n` +
        `建议: 请检查网络连接后重试`
      )
    }

    return new Error(`${errorName}: ${errorMessage}`)
  }
}
