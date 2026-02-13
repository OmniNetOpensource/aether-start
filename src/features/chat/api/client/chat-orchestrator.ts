import { toast } from '@/shared/hooks/useToast'
import { useConversationsStore } from '@/features/conversation/persistence/store/useConversationsStore'
import { buildConversationTitle } from '@/features/conversation/formatting/format'
import { applyChatEventToTree } from '@/features/chat/api/client/event-handlers'
import { ChatClient } from '@/features/chat/api/client/websocket-client'
import { serializeMessagesForRequest } from '@/features/chat/api/client/serialization'
import type { Message, MessageLike, SerializedMessage } from '@/features/chat/types/chat'
import type { MessageTreeSnapshot } from '@/features/chat/api/shared/types'
import { appNavigate } from '@/shared/lib/navigation'
import { useMessageTreeStore } from '@/features/chat/messages/store/useMessageTreeStore'
import { useChatRequestStore } from '@/features/chat/api/store/useChatRequestStore'
import {
  buildConversationPayload,
  persistConversation as persistConversationService,
  resolveExistingConversation,
  cacheExistingConversation,
} from '@/features/conversation/persistence/persist-service'

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
