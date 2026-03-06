import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  addConversationMock,
  appNavigateMock,
  applyChatEventToTreeMock,
  chatStoreState,
  checkAgentStatusMock,
  messageTreeState,
  MockChatClient,
  resetLastEventIdMock,
} = vi.hoisted(() => {
  class MockChatClient {
    static instances: MockChatClient[] = []

    public sendMessage = vi.fn().mockResolvedValue(undefined)
    public sync = vi.fn().mockResolvedValue(undefined)
    public disconnect = vi.fn()
    public abort = vi.fn()

    constructor(public options: unknown) {
      MockChatClient.instances.push(this)
    }
  }

  const chatStoreState = {
    pending: false,
    chatClient: null as MockChatClient | null,
    chatClientConversationId: null as string | null,
    activeRequestId: null as string | null,
    connectionState: 'idle' as
      | 'idle'
      | 'connecting'
      | 'connected'
      | 'reconnecting'
      | 'disconnected',
    connectionStateUpdatedAt: 0,
    currentRole: 'aether',
    availableRoles: [{ id: 'aether', name: 'Aether' }],
    rolesLoading: false,
    _setPending: (pending: boolean) => {
      chatStoreState.pending = pending
    },
    _setChatClient: (
      client: MockChatClient | null,
      conversationId: string | null = null,
    ) => {
      chatStoreState.chatClient = client
      chatStoreState.chatClientConversationId = client ? conversationId : null
    },
    _setActiveRequestId: (id: string | null) => {
      chatStoreState.activeRequestId = id
    },
    _setConnectionState: (state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => {
      chatStoreState.connectionState = state
      chatStoreState.connectionStateUpdatedAt = Date.now()
    },
  }

  const messageTreeState = {
    conversationId: 'conv-1' as string | null,
    setConversationId: vi.fn((conversationId: string) => {
      messageTreeState.conversationId = conversationId
    }),
    _getTreeState: vi.fn(() => ({
      messages: [],
      currentPath: [],
      latestRootId: null,
      nextId: 1,
    })),
  }

  return {
    addConversationMock: vi.fn(),
    appNavigateMock: vi.fn(),
    applyChatEventToTreeMock: vi.fn(),
    chatStoreState,
    checkAgentStatusMock: vi.fn(),
    messageTreeState,
    MockChatClient,
    resetLastEventIdMock: vi.fn(),
  }
})

vi.mock('@/hooks/useToast', () => ({
  toast: {
    warning: vi.fn(),
  },
}))

vi.mock('@/stores/useConversationsStore', () => ({
  useConversationsStore: {
    getState: () => ({
      addConversation: addConversationMock,
    }),
  },
}))

vi.mock('@/lib/chat/api/event-handlers', () => ({
  applyChatEventToTree: applyChatEventToTreeMock,
}))

vi.mock('@/lib/chat/api/websocket-client', () => ({
  ChatClient: MockChatClient,
  checkAgentStatus: checkAgentStatusMock,
  resetLastEventId: resetLastEventIdMock,
}))

vi.mock('@/lib/navigation', () => ({
  appNavigate: appNavigateMock,
}))

vi.mock('@/stores/useMessageTreeStore', () => ({
  useMessageTreeStore: {
    getState: () => messageTreeState,
  },
}))

vi.mock('@/stores/useChatRequestStore', () => ({
  useChatRequestStore: {
    getState: () => chatStoreState,
    setState: (
      partial:
        | Partial<typeof chatStoreState>
        | ((state: typeof chatStoreState) => Partial<typeof chatStoreState>),
    ) => {
      const nextState =
        typeof partial === 'function' ? partial(chatStoreState) : partial
      Object.assign(chatStoreState, nextState)
    },
  },
}))

import {
  resumeRunningConversation,
  startChatRequest,
} from './chat-orchestrator'

describe('chat-orchestrator single connection model', () => {
  beforeEach(() => {
    addConversationMock.mockReset()
    appNavigateMock.mockReset()
    applyChatEventToTreeMock.mockReset()
    checkAgentStatusMock.mockReset()
    resetLastEventIdMock.mockReset()
    MockChatClient.instances.length = 0

    chatStoreState.pending = false
    chatStoreState.chatClient = null
    chatStoreState.chatClientConversationId = null
    chatStoreState.activeRequestId = null
    chatStoreState.connectionState = 'idle'
    chatStoreState.connectionStateUpdatedAt = 0
    chatStoreState.currentRole = 'aether'

    messageTreeState.conversationId = 'conv-1'
    messageTreeState.setConversationId.mockClear()
    messageTreeState._getTreeState.mockClear()
  })

  it('reuses the current conversation client across sends', async () => {
    await startChatRequest({
      messages: [{ role: 'user', blocks: [] } as never],
    })

    const firstClient = MockChatClient.instances[0]
    expect(MockChatClient.instances).toHaveLength(1)
    expect(resetLastEventIdMock).toHaveBeenCalledTimes(1)
    expect(chatStoreState.chatClientConversationId).toBe('conv-1')

    chatStoreState.pending = false
    chatStoreState.activeRequestId = null

    await startChatRequest({
      messages: [{ role: 'user', blocks: [] } as never],
    })

    expect(MockChatClient.instances).toHaveLength(1)
    expect(firstClient.sendMessage).toHaveBeenCalledTimes(2)
    expect(resetLastEventIdMock).toHaveBeenCalledTimes(1)
  })

  it('replaces the client when switching conversations', async () => {
    await startChatRequest({
      messages: [{ role: 'user', blocks: [] } as never],
    })

    const firstClient = MockChatClient.instances[0]
    chatStoreState.pending = false
    chatStoreState.activeRequestId = null
    messageTreeState.conversationId = 'conv-2'

    await startChatRequest({
      messages: [{ role: 'user', blocks: [] } as never],
    })

    expect(firstClient.disconnect).toHaveBeenCalledTimes(1)
    expect(MockChatClient.instances).toHaveLength(2)
    expect(chatStoreState.chatClientConversationId).toBe('conv-2')
    expect(resetLastEventIdMock).toHaveBeenCalledTimes(2)
  })

  it('reuses the current conversation client when resuming a running conversation', async () => {
    const existingClient = {
      sync: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      abort: vi.fn(),
    }

    chatStoreState._setChatClient(existingClient as never, 'conv-1')
    checkAgentStatusMock.mockResolvedValueOnce({
      status: 'running',
      requestId: 'req-remote',
    })

    await resumeRunningConversation('conv-1')

    expect(existingClient.sync).toHaveBeenCalledWith('conv-1')
    expect(resetLastEventIdMock).not.toHaveBeenCalled()
    expect(chatStoreState.activeRequestId).toBe('req-remote')
  })

  it('drops the previous client before resuming another conversation', async () => {
    const existingClient = {
      sync: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      abort: vi.fn(),
    }

    chatStoreState._setChatClient(existingClient as never, 'conv-a')
    checkAgentStatusMock.mockResolvedValueOnce({
      status: 'running',
      requestId: 'req-remote',
    })

    await resumeRunningConversation('conv-b')

    expect(existingClient.disconnect).toHaveBeenCalledTimes(1)
    expect(MockChatClient.instances).toHaveLength(1)
    expect(chatStoreState.chatClientConversationId).toBe('conv-b')
    expect(resetLastEventIdMock).toHaveBeenCalledTimes(1)
  })
})
