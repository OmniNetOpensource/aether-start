import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatClient } from '@/lib/chat/api/websocket-client'

const {
  startChatRequestMock,
  resumeRunningConversationMock,
  getAvailableRolesFnMock,
  composerState,
  composerClearMock,
} =
  vi.hoisted(() => ({
    startChatRequestMock: vi.fn(),
    resumeRunningConversationMock: vi.fn(),
    getAvailableRolesFnMock: vi.fn(),
    composerClearMock: vi.fn(),
    composerState: {
      input: '',
      pendingAttachments: [] as Array<{ id: string }>,
    },
  }))

vi.mock('@/lib/chat/api/chat-orchestrator', () => ({
  startChatRequest: startChatRequestMock,
  resumeRunningConversation: resumeRunningConversationMock,
}))

vi.mock('@/server/functions/chat/roles', () => ({
  getAvailableRolesFn: getAvailableRolesFnMock,
}))

vi.mock('@/stores/useComposerStore', () => ({
  useComposerStore: {
    getState: () => ({
      input: composerState.input,
      pendingAttachments: composerState.pendingAttachments,
      clear: composerClearMock,
    }),
    setState: (
      partial: Partial<{
        input: string
        pendingAttachments: Array<{ id: string }>
      }>,
    ) => {
      if (typeof partial.input === 'string') {
        composerState.input = partial.input
      }
      if (Array.isArray(partial.pendingAttachments)) {
        composerState.pendingAttachments = partial.pendingAttachments
      }
    },
  },
}))

import { useChatRequestStore } from './useChatRequestStore'

describe('useChatRequestStore', () => {
  beforeEach(() => {
    startChatRequestMock.mockReset()
    resumeRunningConversationMock.mockReset()
    getAvailableRolesFnMock.mockReset()
    composerClearMock.mockReset()
    composerState.input = ''
    composerState.pendingAttachments = []

    useChatRequestStore.setState({
      pending: false,
      chatClient: null,
      chatClientConversationId: null,
      activeRequestId: null,
      connectionState: 'idle',
      connectionStateUpdatedAt: 0,
      currentRole: 'aether',
      availableRoles: [],
      rolesLoading: false,
    })
  })

  it('starts with idle connection state', () => {
    expect(useChatRequestStore.getState()).toMatchObject({
      connectionState: 'idle',
      connectionStateUpdatedAt: 0,
      chatClientConversationId: null,
    })
  })

  it('updates role and internal pending/request state', () => {
    useChatRequestStore.getState().setCurrentRole('role-custom')
    useChatRequestStore.getState()._setPending(true)
    useChatRequestStore.getState()._setActiveRequestId('req-1')

    expect(useChatRequestStore.getState()).toMatchObject({
      currentRole: 'role-custom',
      pending: true,
      activeRequestId: 'req-1',
    })
  })

  it('updates connection state and timestamp', () => {
    const before = useChatRequestStore.getState().connectionStateUpdatedAt

    useChatRequestStore.getState()._setConnectionState('connecting')

    const afterState = useChatRequestStore.getState()
    expect(afterState.connectionState).toBe('connecting')
    expect(afterState.connectionStateUpdatedAt).toBeGreaterThanOrEqual(before)
  })

  it('tracks the chat client together with its conversation id', () => {
    const client = {} as ChatClient

    useChatRequestStore.getState()._setChatClient(client, 'conv-7')

    expect(useChatRequestStore.getState()).toMatchObject({
      chatClient: client,
      chatClientConversationId: 'conv-7',
    })
  })

  it('stop aborts active chat client and keeps the connection object', () => {
    const abort = vi.fn()
    const disconnect = vi.fn()
    const client = { abort, disconnect } as unknown as ChatClient

    useChatRequestStore.getState()._setChatClient(client, 'conv-9')
    useChatRequestStore.getState()._setActiveRequestId('req-9')
    useChatRequestStore.getState()._setPending(true)
    useChatRequestStore.getState()._setConnectionState('disconnected')

    useChatRequestStore.getState().stop()

    expect(abort).toHaveBeenCalledWith('req-9')
    expect(disconnect).not.toHaveBeenCalled()
    expect(useChatRequestStore.getState()).toMatchObject({
      pending: false,
      chatClient: client,
      chatClientConversationId: 'conv-9',
      activeRequestId: null,
      connectionState: 'disconnected',
    })
    expect(useChatRequestStore.getState().connectionStateUpdatedAt).toBeGreaterThan(0)
  })

  it('clear resets request state and keeps the connection alive', () => {
    const disconnect = vi.fn()
    const client = { disconnect } as unknown as ChatClient

    useChatRequestStore.getState()._setChatClient(client, 'conv-2')
    useChatRequestStore.getState()._setPending(true)
    useChatRequestStore.getState()._setActiveRequestId('req-2')
    useChatRequestStore.getState()._setConnectionState('reconnecting')

    useChatRequestStore.getState().clear()

    expect(disconnect).not.toHaveBeenCalled()
    expect(useChatRequestStore.getState()).toMatchObject({
      pending: false,
      chatClient: client,
      chatClientConversationId: 'conv-2',
      activeRequestId: null,
      connectionState: 'reconnecting',
    })
    expect(useChatRequestStore.getState().connectionStateUpdatedAt).toBeGreaterThan(0)
  })

  it('disposeConnection disconnects client and resets runtime state', () => {
    const disconnect = vi.fn()
    const client = { disconnect } as unknown as ChatClient

    useChatRequestStore.getState()._setChatClient(client, 'conv-3')
    useChatRequestStore.getState()._setPending(true)
    useChatRequestStore.getState()._setActiveRequestId('req-3')
    useChatRequestStore.getState()._setConnectionState('connected')

    useChatRequestStore.getState().disposeConnection()

    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(useChatRequestStore.getState()).toMatchObject({
      pending: false,
      chatClient: null,
      chatClientConversationId: null,
      activeRequestId: null,
      connectionState: 'idle',
    })
    expect(useChatRequestStore.getState().connectionStateUpdatedAt).toBeGreaterThan(0)
  })

  it('loads roles once and skips repeated requests', async () => {
    getAvailableRolesFnMock.mockResolvedValueOnce([
      { id: 'aether', name: 'Aether' },
      { id: 'coder', name: 'Coder' },
    ])

    await useChatRequestStore.getState().loadRoles()
    await useChatRequestStore.getState().loadRoles()

    expect(getAvailableRolesFnMock).toHaveBeenCalledTimes(1)
    expect(useChatRequestStore.getState()).toMatchObject({
      rolesLoading: false,
      availableRoles: [
        { id: 'aether', name: 'Aether' },
        { id: 'coder', name: 'Coder' },
      ],
    })
  })

  it('delegates resumeIfRunning to orchestrator', async () => {
    resumeRunningConversationMock.mockResolvedValueOnce(undefined)

    await useChatRequestStore.getState().resumeIfRunning('conv-1')

    expect(resumeRunningConversationMock).toHaveBeenCalledWith('conv-1')
  })
})
