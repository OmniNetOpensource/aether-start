import { toast } from '@/hooks/useToast'
import { useConversationsStore } from '@/stores/useConversationsStore'
import { applyChatEventToTree } from '@/features/chat/api/client/event-handlers'
import { ChatClient, checkAgentStatus, resetConversationEventCursor } from '@/features/chat/api/client/websocket-client'
import type { Message, MessageLike, SerializedMessage } from '@/features/chat/types/chat'
import type { MessageTreeSnapshot } from '@/features/chat/api/shared/types'
import { appNavigate } from '@/lib/navigation'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { useChatRequestStore } from '@/stores/useChatRequestStore'

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

export const startChatRequest = async (
  options: StartRequestOptions,
) => {
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
      created_at: now,
      updated_at: now,
    })

    appNavigate(`/app/c/${currentConversationId}`)
  }

  const serializedMessages: SerializedMessage[] = messages.map((msg) => ({
    role: msg.role,
    blocks: msg.blocks,
  } as SerializedMessage))

  const treeSnapshot = useMessageTreeStore.getState()._getTreeState() as MessageTreeSnapshot

  resetConversationEventCursor(currentConversationId)

  let disconnectedHandled = false
  const chatClient = new ChatClient({
    onEvent: (event, meta) => {
      const activeRequestId = useChatRequestStore.getState().activeRequestId
      if (
        event.type !== 'conversation_updated' &&
        activeRequestId &&
        activeRequestId !== meta.requestId
      ) {
        return
      }

      applyChatEventToTree(event)
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
      }
    },
    onError: () => {
      if (disconnectedHandled) {
        return
      }

      disconnectedHandled = true
      toast.info('连接已断开，请刷新页面查看最新内容', 10000)
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
      if (disconnectedHandled) {
        return
      }

      disconnectedHandled = true
      toast.info('连接已断开，请刷新页面查看最新内容', 10000)
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

  // Step 1: Check DO status via HTTP — no WebSocket needed
  let agentStatus: Awaited<ReturnType<typeof checkAgentStatus>> | null = null
  let probeFailed = false
  try {
    agentStatus = await checkAgentStatus(conversationId)
  } catch {
    probeFailed = true
  }

  // Step 2: If not running, nothing to do — D1 data is already loaded
  if (!probeFailed && agentStatus && agentStatus.status !== 'running') {
    return
  }

  // Step 3: Establish WebSocket to receive live events (probe failure falls back to sync)
  let disconnectedHandled = false

  const chatClient = new ChatClient({
    onEvent: (event, meta) => {
      const activeRequestId = useChatRequestStore.getState().activeRequestId
      if (
        event.type !== 'conversation_updated' &&
        activeRequestId &&
        activeRequestId !== meta.requestId
      ) {
        return
      }

      applyChatEventToTree(event)
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
      }
    },
    onError: () => {
      if (disconnectedHandled) {
        return
      }

      disconnectedHandled = true
      toast.info('连接已断开，请刷新页面查看最新内容', 10000)
      chatClient.disconnect()
      useChatRequestStore.setState({
        pending: false,
        chatClient: null,
        activeRequestId: null,
      })
    },
  })

  // If the HTTP probe confirmed running, show pending immediately.
  if (!probeFailed && agentStatus?.status === 'running') {
    useChatRequestStore.setState({
      pending: true,
      chatClient,
      activeRequestId: agentStatus.requestId ?? null,
    })
  }

  // Step 4: Connect and sync — get missed events from eventCache, deduplicated
  try {
    await chatClient.sync(conversationId)
  } catch (error) {
    console.error('Failed to resume conversation', error)
    if (disconnectedHandled) {
      return
    }

    disconnectedHandled = true
    toast.info('连接已断开，请刷新页面查看最新内容', 10000)
    chatClient.disconnect()
    useChatRequestStore.setState({
      pending: false,
      chatClient: null,
      activeRequestId: null,
    })
  }
}
