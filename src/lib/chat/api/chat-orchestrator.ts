import { toast } from '@/hooks/useToast'
import { useConversationsStore } from '@/stores/useConversationsStore'
import { applyChatEventToTree } from '@/lib/chat/api/event-handlers'
import {
  ChatClient,
  checkAgentStatus,
  resetLastEventId,
} from '@/lib/chat/api/websocket-client'
import type { Message, MessageLike, SerializedMessage } from '@/types/message'
import type {
  ChatEventMeta,
  ChatStatusEvent,
} from '@/lib/chat/api/websocket-client'
import type { MessageTreeSnapshot } from '@/types/chat-api'
import { appNavigate } from '@/lib/navigation'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { useChatRequestStore } from '@/stores/useChatRequestStore'
import type { ChatServerToClientEvent } from '@/types/chat-event-types'

const generateLocalMessageId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`

const generateConversationId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`

type StartRequestOptions = {
  messages: Message[]
  titleSource?: MessageLike
  preferLocalTitle?: boolean
}

const setConnectionState = (
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected',
) => {
  useChatRequestStore.getState()._setConnectionState(state)
}

const isCurrentClient = (chatClient: ChatClient) =>
  useChatRequestStore.getState().chatClient === chatClient

const clearCurrentClient = () => {
  useChatRequestStore.getState()._setChatClient(null, null)
}

const handleChatEvent = (
  event: ChatServerToClientEvent,
  meta: ChatEventMeta,
) => {
  const activeRequestId = useChatRequestStore.getState().activeRequestId
  if (
    event.type !== 'conversation_updated' &&
    activeRequestId &&
    activeRequestId !== meta.requestId
  ) {
    return
  }

  applyChatEventToTree(event)
}

const handleChatStatus = (chatClient: ChatClient, statusEvent: ChatStatusEvent) => {
  if (!isCurrentClient(chatClient)) {
    return
  }

  if (statusEvent.type === 'connection') {
    setConnectionState(statusEvent.state)
    return
  }

  if (statusEvent.type === 'busy') {
    toast.warning('当前会话正在生成中')
    useChatRequestStore.setState({
      pending: true,
      activeRequestId: statusEvent.currentRequestId,
    })
    return
  }

  if (statusEvent.type === 'started') {
    useChatRequestStore.setState({
      pending: true,
      activeRequestId: statusEvent.requestId,
    })
    return
  }

  if (statusEvent.type === 'sync') {
    if (statusEvent.status === 'running') {
      useChatRequestStore.setState({
        pending: true,
        activeRequestId:
          statusEvent.requestId ?? useChatRequestStore.getState().activeRequestId,
      })
      return
    }

    useChatRequestStore.setState({
      pending: false,
      activeRequestId: null,
    })
    return
  }

  if (statusEvent.type === 'finished') {
    const activeRequestId = useChatRequestStore.getState().activeRequestId
    if (activeRequestId && activeRequestId !== statusEvent.requestId) {
      return
    }

    useChatRequestStore.setState({
      pending: false,
      activeRequestId: null,
    })
  }
}

const handleChatError = (chatClient: ChatClient) => {
  if (!isCurrentClient(chatClient)) {
    return
  }

  chatClient.disconnect()
  clearCurrentClient()
  useChatRequestStore.setState({
    pending: false,
    activeRequestId: null,
  })
  setConnectionState('disconnected')
}

const createChatClient = (conversationId: string) => {
  const chatClient = new ChatClient({
    onEvent: (event, meta) => {
      if (!isCurrentClient(chatClient)) {
        return
      }

      handleChatEvent(event, meta)
    },
    onStatus: (statusEvent) => {
      handleChatStatus(chatClient, statusEvent)
    },
    onError: () => {
      handleChatError(chatClient)
    },
  })

  useChatRequestStore.getState()._setChatClient(chatClient, conversationId)

  return chatClient
}

const ensureCurrentConversationClient = (conversationId: string) => {
  const store = useChatRequestStore.getState()
  if (
    store.chatClient &&
    store.chatClientConversationId === conversationId
  ) {
    return { chatClient: store.chatClient, reused: true }
  }

  if (store.chatClient) {
    store.chatClient.disconnect()
    clearCurrentClient()
  }

  resetLastEventId()

  return {
    chatClient: createChatClient(conversationId),
    reused: false,
  }
}

export const startChatRequest = async (options: StartRequestOptions) => {
  const { messages } = options
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

  if (!currentConversationId) {
    currentConversationId = generateConversationId()
    const now = new Date().toISOString()

    useMessageTreeStore.getState().setConversationId(currentConversationId)

    const fallbackTitle = 'New Chat'

    useConversationsStore.getState().addConversation({
      id: currentConversationId,
      title: fallbackTitle,
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    })

    appNavigate(`/app/c/${currentConversationId}`)
  }

  const serializedMessages: SerializedMessage[] = messages.map(
    (msg) =>
      ({
        role: msg.role,
        blocks: msg.blocks,
      }) as SerializedMessage,
  )

  const treeSnapshot = useMessageTreeStore
    .getState()
    ._getTreeState() as MessageTreeSnapshot

  const { chatClient } = ensureCurrentConversationClient(currentConversationId)

  useChatRequestStore.setState({
    pending: true,
    activeRequestId: requestId,
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
      console.error('Failed to send chat message', error)
      handleChatError(chatClient)
    })
}

export const resumeRunningConversation = async (conversationId: string) => {
  if (!conversationId) {
    return
  }

  const store = useChatRequestStore.getState()
  if (
    store.pending &&
    store.chatClient &&
    store.chatClientConversationId === conversationId
  ) {
    return
  }

  let agentStatus: Awaited<ReturnType<typeof checkAgentStatus>> | null = null
  let probeFailed = false
  try {
    agentStatus = await checkAgentStatus(conversationId)
  } catch {
    probeFailed = true
  }

  if (!probeFailed && agentStatus && agentStatus.status !== 'running') {
    setConnectionState('idle')
    return
  }

  const { chatClient } = ensureCurrentConversationClient(conversationId)

  if (!probeFailed && agentStatus?.status === 'running') {
    useChatRequestStore.setState({
      pending: true,
      activeRequestId: agentStatus.requestId ?? null,
    })
  }

  try {
    await chatClient.sync(conversationId)
  } catch (error) {
    console.error('Failed to resume conversation', error)
    handleChatError(chatClient)
  }
}
