import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationDetail, ConversationMeta } from '@/types/conversation'
import { createEmptyMessageState } from '@/lib/conversation/tree/message-tree'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'

const {
  listConversationsPageFnMock,
  clearConversationsFnMock,
  deleteConversationFnMock,
  updateConversationTitleFnMock,
  chatRequestState,
} = vi.hoisted(() => ({
  listConversationsPageFnMock: vi.fn(),
  clearConversationsFnMock: vi.fn(),
  deleteConversationFnMock: vi.fn(),
  updateConversationTitleFnMock: vi.fn(),
  chatRequestState: {
    currentRole: 'aether',
  },
}))

vi.mock('@/server/functions/conversations', () => ({
  listConversationsPageFn: listConversationsPageFnMock,
  clearConversationsFn: clearConversationsFnMock,
  deleteConversationFn: deleteConversationFnMock,
  updateConversationTitleFn: updateConversationTitleFnMock,
}))

vi.mock('@/stores/useChatRequestStore', () => ({
  useChatRequestStore: {
    getState: () => ({
      currentRole: chatRequestState.currentRole,
      setCurrentRole: (role: string) => {
        chatRequestState.currentRole = role
      },
    }),
    setState: (partial: Partial<{ currentRole: string }>) => {
      if (typeof partial.currentRole === 'string') {
        chatRequestState.currentRole = partial.currentRole
      }
    },
  },
}))

import { useChatRequestStore } from '@/stores/useChatRequestStore'
import { useConversationsStore } from './useConversationsStore'

const createMeta = (id: string, updatedAt: string, title = id): ConversationMeta => ({
  id,
  title,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: updatedAt,
})

const createDetail = (id: string, updatedAt: string, role = 'role-a'): ConversationDetail => ({
  id,
  title: id,
  role,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: updatedAt,
  currentPath: [],
  messages: [],
})

describe('useConversationsStore', () => {
  beforeEach(() => {
    listConversationsPageFnMock.mockReset()
    clearConversationsFnMock.mockReset()
    deleteConversationFnMock.mockReset()
    updateConversationTitleFnMock.mockReset()
    chatRequestState.currentRole = 'aether'

    useConversationsStore.setState({
      conversations: [],
      conversationsLoading: false,
      hasLoaded: false,
      loadingMore: false,
      hasMore: false,
      conversationsCursor: null,
    })
    useChatRequestStore.setState({ currentRole: 'aether' })
    useMessageTreeStore.setState({
      ...createEmptyMessageState(),
      conversationId: null,
    })
  })

  it('addConversation and setConversations merge, dedupe and sort by updated_at', () => {
    const older = createMeta('c-1', '2024-01-01T00:00:00.000Z', 'older')
    const newer = createMeta('c-2', '2024-01-02T00:00:00.000Z', 'newer')

    useConversationsStore.getState().addConversation(older)
    useConversationsStore.getState().addConversation(newer)
    expect(useConversationsStore.getState().conversations.map((item) => item.id)).toEqual([
      'c-2',
      'c-1',
    ])

    useConversationsStore.getState().setConversations([
      createMeta('c-1', '2024-01-03T00:00:00.000Z', 'updated title'),
    ])

    expect(useConversationsStore.getState().conversations).toEqual([
      createMeta('c-1', '2024-01-03T00:00:00.000Z', 'updated title'),
      newer,
    ])
  })

  it('loadInitialConversations loads page, sets flags and syncs latest role', async () => {
    listConversationsPageFnMock.mockResolvedValueOnce({
      items: [
        createDetail('c-2', '2024-01-03T00:00:00.000Z', 'role-latest'),
        createDetail('c-1', '2024-01-02T00:00:00.000Z', 'role-old'),
      ],
      nextCursor: { updated_at: '2024-01-02T00:00:00.000Z', id: 'c-1' },
    })

    await useConversationsStore.getState().loadInitialConversations()

    expect(listConversationsPageFnMock).toHaveBeenCalledWith({
      data: { limit: 10, cursor: null },
    })
    expect(useConversationsStore.getState()).toMatchObject({
      hasLoaded: true,
      conversationsLoading: false,
      hasMore: true,
      conversationsCursor: { updated_at: '2024-01-02T00:00:00.000Z', id: 'c-1' },
    })
    expect(useConversationsStore.getState().conversations.map((item) => item.id)).toEqual([
      'c-2',
      'c-1',
    ])
    expect(useChatRequestStore.getState().currentRole).toBe('role-latest')
  })

  it('loadMoreConversations merges next page and updates cursor', async () => {
    useConversationsStore.setState({
      conversations: [createMeta('c-1', '2024-01-02T00:00:00.000Z')],
      hasLoaded: true,
      hasMore: true,
      conversationsCursor: { updated_at: '2024-01-02T00:00:00.000Z', id: 'c-1' },
      conversationsLoading: false,
      loadingMore: false,
    })

    listConversationsPageFnMock.mockResolvedValueOnce({
      items: [createDetail('c-3', '2024-01-04T00:00:00.000Z', 'role-new')],
      nextCursor: null,
    })

    await useConversationsStore.getState().loadMoreConversations()

    expect(listConversationsPageFnMock).toHaveBeenCalledWith({
      data: {
        limit: 10,
        cursor: { updated_at: '2024-01-02T00:00:00.000Z', id: 'c-1' },
      },
    })
    expect(useConversationsStore.getState()).toMatchObject({
      loadingMore: false,
      hasMore: false,
      conversationsCursor: null,
    })
    expect(useConversationsStore.getState().conversations.map((item) => item.id)).toEqual([
      'c-3',
      'c-1',
    ])
  })
})
