import { AgentClient } from 'agents/client'
import { toast } from '@/shared/hooks/useToast'
import { useConversationsStore } from '@/features/conversation/persistence/store/useConversationsStore'
import { buildConversationTitle } from '@/features/conversation/formatting/format'
import type {
  Attachment,
  ContentBlock,
  Message,
  MessageLike,
  SerializedAttachment,
  SerializedContentBlock,
  SerializedMessage,
} from '@/features/chat/types/chat'
import type { ChatServerToClientEvent } from '@/features/chat/api/types/server-events'
import type {
  ChatAgentClientMessage,
  ChatAgentServerMessage,
  ChatAgentStatus,
  MessageTreeSnapshot,
} from '@/features/chat/api/types/schemas/types'
import { appNavigate } from '@/shared/lib/navigation'
import { useMessageTreeStore } from '@/features/chat/messages/store/useMessageTreeStore'
import { useChatRequestStore } from '@/features/chat/api/store/useChatRequestStore'
import {
  buildConversationPayload,
  persistConversation as persistConversationService,
  resolveExistingConversation,
  cacheExistingConversation,
} from '@/features/conversation/persistence/persist-service'

const AGENT_NAME = 'chat-agent'

const resolveAgentHost = () => {
  if (typeof window === 'undefined') {
    return 'localhost:3000'
  }

  return window.location.host
}

const resolveAgentSecure = () => {
  if (typeof window === 'undefined') {
    return false
  }

  return window.location.protocol === 'https:'
}

const resolveAgentProtocol = () => (resolveAgentSecure() ? 'wss' : 'ws')

const eventCursorByConversation = new Map<string, number>()

const getLastEventId = (conversationId: string) =>
  eventCursorByConversation.get(conversationId) ?? 0

const markEventId = (conversationId: string, eventId: number) => {
  const current = getLastEventId(conversationId)
  if (eventId > current) {
    eventCursorByConversation.set(conversationId, eventId)
  }
}

const shouldConsumeEvent = (conversationId: string, eventId: number) =>
  eventId > getLastEventId(conversationId)

export const resetConversationEventCursor = (conversationId: string) => {
  if (!conversationId) {
    return
  }

  eventCursorByConversation.delete(conversationId)
}

const isChatAgentStatus = (value: unknown): value is ChatAgentStatus =>
  value === 'idle' ||
  value === 'running' ||
  value === 'completed' ||
  value === 'aborted' ||
  value === 'error'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// --- Serialization ---

const serializeAttachments = async (
  attachments: Attachment[]
): Promise<SerializedAttachment[]> => {
  const serialized: SerializedAttachment[] = []

  for (const attachment of attachments) {
    const serializedAttachment = {
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      size: attachment.size,
      mimeType: attachment.mimeType,
      url: attachment.displayUrl,
      storageKey: attachment.storageKey,
    }

    serialized.push(serializedAttachment)
  }

  return serialized
}

const serializeBlocks = async (
  blocks: ContentBlock[]
): Promise<SerializedContentBlock[]> =>
  Promise.all(
    blocks.map(async (block) => {
      if (block.type === 'attachments') {
        return {
          ...block,
          attachments: await serializeAttachments(block.attachments),
        }
      }
      return { ...block }
    })
  )

const serializeMessagesForRequest = async (
  messages: Message[]
): Promise<SerializedMessage[]> =>
  Promise.all(
    messages.map(async (message) =>
      ({
        role: message.role,
        blocks: await serializeBlocks(message.blocks),
      } as SerializedMessage)
    )
  )

type ChatStatusEvent =
  | {
      type: 'sync'
      status: ChatAgentStatus
      requestId?: string
    }
  | {
      type: 'started'
      requestId: string
    }
  | {
      type: 'finished'
      requestId: string
      status: 'completed' | 'aborted' | 'error'
    }
  | {
      type: 'busy'
      currentRequestId: string
    }

type ChatEventMeta = {
  requestId: string
  eventId: number
  source: 'sync' | 'live'
}

type ChatClientOptions = {
  onEvent: (event: ChatServerToClientEvent, meta: ChatEventMeta) => void
  onError: (error: Error) => void
  onStatus?: (event: ChatStatusEvent) => void
}

// --- ChatClient ---

export class ChatClient {
  private client: AgentClient | null = null
  private conversationId: string | null = null
  private suppressCloseError = false

  constructor(private options: ChatClientOptions) {}

  public async connect(conversationId: string) {
    if (this.client && this.conversationId === conversationId) {
      return
    }

    this.disconnect()

    this.suppressCloseError = false
    this.conversationId = conversationId

    const client = new AgentClient({
      agent: AGENT_NAME,
      name: conversationId,
      host: resolveAgentHost(),
      protocol: resolveAgentProtocol(),
    })

    client.addEventListener('message', this.handleMessage)
    client.addEventListener('error', this.handleSocketError)
    client.addEventListener('close', this.handleSocketClose)

    this.client = client

    await client.ready
  }

  public async sync(conversationId: string) {
    await this.connect(conversationId)

    this.send({
      type: 'sync',
      conversationId,
      lastEventId: getLastEventId(conversationId),
    })
  }

  public async sendMessage(params: {
    requestId: string
    role: string
    conversationId: string
    conversationHistory: SerializedMessage[]
    treeSnapshot: MessageTreeSnapshot
  }) {
    await this.sync(params.conversationId)

    this.send({
      type: 'chat_request',
      requestId: params.requestId,
      conversationId: params.conversationId,
      role: params.role,
      conversationHistory: params.conversationHistory,
      treeSnapshot: params.treeSnapshot,
    })
  }

  public abort(requestId?: string) {
    if (!this.client) {
      return
    }

    this.send({
      type: 'abort',
      requestId,
    })
  }

  public disconnect() {
    if (!this.client) {
      return
    }

    this.suppressCloseError = true

    this.client.removeEventListener('message', this.handleMessage)
    this.client.removeEventListener('error', this.handleSocketError)
    this.client.removeEventListener('close', this.handleSocketClose)

    this.client.close()
    this.client = null
    this.conversationId = null
  }

  private send(message: ChatAgentClientMessage) {
    if (!this.client) {
      throw new Error('WebSocket 尚未连接')
    }

    this.client.send(JSON.stringify(message))
  }

  private handleSocketError = () => {
    this.options.onError(new Error('连接到聊天服务失败'))
  }

  private handleSocketClose = () => {
    if (this.suppressCloseError) {
      return
    }

    this.options.onError(new Error('聊天连接已断开'))
  }

  private handleMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string') {
      return
    }

    const parsed = safeJsonParse(event.data)
    if (!isRecord(parsed) || typeof parsed.type !== 'string') {
      return
    }

    const payload = parsed as ChatAgentServerMessage & Record<string, unknown>

    if (payload.type === 'sync_response') {
      const status = isChatAgentStatus(payload.status) ? payload.status : 'idle'
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : undefined
      const events = Array.isArray(payload.events) ? payload.events : []

      for (const item of events) {
        if (!isRecord(item)) {
          continue
        }

        const eventId = typeof item.eventId === 'number' ? item.eventId : null
        const eventRequestId = typeof item.requestId === 'string' ? item.requestId : null
        const serverEvent = isRecord(item.event)
          ? (item.event as ChatServerToClientEvent)
          : null

        if (!this.conversationId || !eventId || !eventRequestId || !serverEvent) {
          continue
        }

        if (!shouldConsumeEvent(this.conversationId, eventId)) {
          continue
        }

        markEventId(this.conversationId, eventId)

        this.options.onEvent(serverEvent, {
          requestId: eventRequestId,
          eventId,
          source: 'sync',
        })
      }

      this.options.onStatus?.({
        type: 'sync',
        status,
        requestId,
      })
      return
    }

    if (payload.type === 'chat_event') {
      const eventId = typeof payload.eventId === 'number' ? payload.eventId : null
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : null
      const serverEvent = isRecord(payload.event)
        ? (payload.event as ChatServerToClientEvent)
        : null

      if (!this.conversationId || !eventId || !requestId || !serverEvent) {
        return
      }

      if (!shouldConsumeEvent(this.conversationId, eventId)) {
        return
      }

      markEventId(this.conversationId, eventId)

      this.options.onEvent(serverEvent, {
        requestId,
        eventId,
        source: 'live',
      })
      return
    }

    if (payload.type === 'chat_started') {
      if (typeof payload.requestId !== 'string') {
        return
      }

      this.options.onStatus?.({
        type: 'started',
        requestId: payload.requestId,
      })
      return
    }

    if (payload.type === 'chat_finished') {
      if (typeof payload.requestId !== 'string') {
        return
      }

      const status =
        payload.status === 'completed' ||
        payload.status === 'aborted' ||
        payload.status === 'error'
          ? payload.status
          : 'error'

      this.options.onStatus?.({
        type: 'finished',
        requestId: payload.requestId,
        status,
      })
      return
    }

    if (payload.type === 'busy') {
      if (typeof payload.currentRequestId !== 'string') {
        return
      }

      this.options.onStatus?.({
        type: 'busy',
        currentRequestId: payload.currentRequestId,
      })
    }
  }
}

// --- Chat Request ---

const generateLocalMessageId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`

const generateConversationId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`

type PersistConversationOptions = {
  title?: string
  created_at?: string
  updated_at?: string
  titleSource?: MessageLike
  force?: boolean
}

const createPersistConversation = (defaultTitleSource?: MessageLike) =>
  async (id: string, options?: PersistConversationOptions) => {
    const existing = await resolveExistingConversation(id)
    const treeState = useMessageTreeStore.getState()
    const payload = buildConversationPayload({
      id,
      messages: treeState.messages,
      currentPath: treeState.currentPath,
      title: options?.title,
      titleSource: options?.titleSource ?? defaultTitleSource,
      created_at: options?.created_at,
      updated_at: options?.updated_at,
      existingConversation: existing,
    })
    cacheExistingConversation(id, payload)
    persistConversationService(payload, { force: options?.force === true })
  }

const enhanceServerErrorMessage = (safeMessage: string) => {
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

const applyChatEventToTree = async (
  event: ChatServerToClientEvent,
  conversationId: string,
  persistConversation: (id: string, options?: PersistConversationOptions) => Promise<void>,
  titleSource?: MessageLike,
) => {
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

    await persistConversation(conversationId, {
      updated_at: new Date().toISOString(),
      titleSource,
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

type StartRequestOptions = {
  messages: Message[]
  titleSource?: MessageLike
  preferLocalTitle?: boolean
}

export const startChatRequest = async (
  options: StartRequestOptions,
) => {
  const { messages, titleSource, preferLocalTitle } = options
  const selectedRole = useChatRequestStore.getState().currentRole

  if (useChatRequestStore.getState().pending) {
    return
  }
  if (!selectedRole) {
    toast.warning('请先选择角色')
    return
  }

  let currentConversationId = useMessageTreeStore.getState().conversationId
  const requestId = generateLocalMessageId()
  const persistConversation = createPersistConversation(titleSource)

  if (!currentConversationId) {
    currentConversationId = generateConversationId()
    const now = new Date().toISOString()

    useMessageTreeStore.getState().setConversationId(currentConversationId)

    const fallbackTitle = titleSource ? buildConversationTitle(titleSource) : 'New Chat'
    const resolvedTitle = preferLocalTitle ? fallbackTitle : fallbackTitle

    useConversationsStore.getState().addConversation({
      id: currentConversationId,
      title: resolvedTitle,
      user_id: '',
      created_at: now,
      updated_at: now,
    })

    appNavigate(`/app/c/${currentConversationId}`)

    await persistConversation(currentConversationId, {
      title: resolvedTitle,
      created_at: now,
      updated_at: now,
      titleSource,
      force: true,
    })
  }

  let serializedMessages: SerializedMessage[]
  try {
    serializedMessages = await serializeMessagesForRequest(messages)
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error || '未知原因')
    console.error('Failed to serialize attachments', error)
    toast.error(`附件处理失败：${detail}。建议: 重新选择附件或减少数量后重试。`)
    return
  }

  const treeSnapshot = useMessageTreeStore.getState()._getTreeState() as MessageTreeSnapshot

  const chatClient = new ChatClient({
    onEvent: (event, meta) => {
      const activeRequestId = useChatRequestStore.getState().activeRequestId
      if (activeRequestId && activeRequestId !== meta.requestId) {
        return
      }

      void applyChatEventToTree(
        event,
        currentConversationId,
        persistConversation,
        titleSource,
      )
    },
    onStatus: (statusEvent) => {
      if (statusEvent.type === 'busy') {
        toast.warning('当前会话正在生成中')
        useChatRequestStore.setState({
          pending: true,
          chatClient,
          activeRequestId: statusEvent.currentRequestId,
        })
        return
      }

      if (statusEvent.type === 'started') {
        useChatRequestStore.setState({
          pending: true,
          chatClient,
          activeRequestId: statusEvent.requestId,
        })
        return
      }

      if (statusEvent.type === 'sync') {
        if (statusEvent.status === 'running') {
          useChatRequestStore.setState({
            pending: true,
            chatClient,
            activeRequestId: statusEvent.requestId ?? requestId,
          })
        }
        return
      }

      if (statusEvent.type === 'finished') {
        const activeRequestId = useChatRequestStore.getState().activeRequestId
        if (activeRequestId && activeRequestId !== statusEvent.requestId) {
          return
        }

        chatClient.disconnect()
        useChatRequestStore.setState({
          pending: false,
          chatClient: null,
          activeRequestId: null,
        })

        void persistConversation(currentConversationId, {
          updated_at: new Date().toISOString(),
          titleSource,
          force: true,
        })
      }
    },
    onError: (error) => {
      const activeRequestId = useChatRequestStore.getState().activeRequestId
      if (activeRequestId && activeRequestId !== requestId) {
        return
      }

      const message =
        error instanceof Error ? error.message : '无法连接到聊天服务'
      const detailedMessage =
        message.includes('可能原因:') || message.includes('建议:')
          ? message
          : `网络或服务异常: ${message}\n可能原因: 网络不稳定、服务不可用或浏览器阻止请求\n建议: 检查网络并稍后重试`

      useMessageTreeStore.getState().appendToAssistant({
        type: 'error',
        message: detailedMessage,
      })

      chatClient.disconnect()
      useChatRequestStore.setState({
        pending: false,
        chatClient: null,
        activeRequestId: null,
      })
    },
  })

  useChatRequestStore.setState({
    pending: true,
    chatClient,
    activeRequestId: requestId,
  })

  void persistConversation(currentConversationId, {
    updated_at: new Date().toISOString(),
    titleSource,
  })

  void chatClient
    .sendMessage({
      requestId,
      role: selectedRole,
      conversationId: currentConversationId,
      conversationHistory: serializedMessages,
      treeSnapshot,
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? '未知错误')
      useMessageTreeStore.getState().appendToAssistant({
        type: 'error',
        message: `网络或服务异常: ${message}\n可能原因: 网络不稳定、服务不可用或浏览器阻止请求\n建议: 检查网络并稍后重试`,
      })
      chatClient.disconnect()
      useChatRequestStore.setState({
        pending: false,
        chatClient: null,
        activeRequestId: null,
      })
    })
}

export const resumeRunningConversation = async (conversationId: string) => {
  if (!conversationId) {
    return
  }

  const store = useChatRequestStore.getState()
  if (store.pending && store.chatClient) {
    return
  }

  if (store.chatClient) {
    store.chatClient.disconnect()
  }

  const persistConversation = createPersistConversation()

  const chatClient = new ChatClient({
    onEvent: (event) => {
      void applyChatEventToTree(event, conversationId, persistConversation)
    },
    onStatus: (statusEvent) => {
      if (statusEvent.type === 'sync') {
        if (statusEvent.status === 'running') {
          useChatRequestStore.setState({
            pending: true,
            chatClient,
            activeRequestId: statusEvent.requestId ?? null,
          })
          return
        }

        chatClient.disconnect()
        useChatRequestStore.setState({
          pending: false,
          chatClient: null,
          activeRequestId: null,
        })
        return
      }

      if (statusEvent.type === 'started') {
        useChatRequestStore.setState({
          pending: true,
          chatClient,
          activeRequestId: statusEvent.requestId,
        })
        return
      }

      if (statusEvent.type === 'busy') {
        useChatRequestStore.setState({
          pending: true,
          chatClient,
          activeRequestId: statusEvent.currentRequestId,
        })
        return
      }

      if (statusEvent.type === 'finished') {
        chatClient.disconnect()
        useChatRequestStore.setState({
          pending: false,
          chatClient: null,
          activeRequestId: null,
        })

        void persistConversation(conversationId, {
          updated_at: new Date().toISOString(),
          force: true,
        })
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '连接聊天服务失败'
      useMessageTreeStore.getState().appendToAssistant({
        type: 'error',
        message: `恢复连接失败: ${message}`,
      })

      chatClient.disconnect()
      useChatRequestStore.setState({
        pending: false,
        chatClient: null,
        activeRequestId: null,
      })
    },
  })

  try {
    await chatClient.sync(conversationId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    useMessageTreeStore.getState().appendToAssistant({
      type: 'error',
      message: `恢复连接失败: ${message}`,
    })
    chatClient.disconnect()
    useChatRequestStore.setState({
      pending: false,
      chatClient: null,
      activeRequestId: null,
    })
  }
}
