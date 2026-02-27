import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationDetail, ConversationMeta } from '@/types/conversation'
import { createEmptyMessageState } from '@/lib/conversation/tree/message-tree'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'

const {
  listConversationsPageFnMock,
  clearConversationsFnMock,
  deleteConversationFnMock,
  setConversationPinnedFnMock,
  updateConversationTitleFnMock,
  chatRequestState,
} = vi.hoisted(() => ({
  listConversationsPageFnMock: vi.fn(),
  clearConversationsFnMock: vi.fn(),
  deleteConversationFnMock: vi.fn(),
  setConversationPinnedFnMock: vi.fn(),
  updateConversationTitleFnMock: vi.fn(),
  chatRequestState: {
    currentRole: 'aether',
  },
}))

vi.mock('@/server/functions/conversations', () => ({
  listConversationsPageFn: listConversationsPageFnMock,
  clearConversationsFn: clearConversationsFnMock,
  deleteConversationFn: deleteConversationFnMock,
  setConversationPinnedFn: setConversationPinnedFnMock,
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

const createMeta = (
  id: string,
  updatedAt: string,
  title = id,
  options?: { isPinned?: boolean; pinnedAt?: string | null },
): ConversationMeta => ({
  id,
  title,
  role: 'role-a',
  is_pinned: options?.isPinned ?? false,
  pinned_at: options?.pinnedAt ?? null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: updatedAt,
})

const createDetail = (
  id: string,
  updatedAt: string,
  role = 'role-a',
  options?: { isPinned?: boolean; pinnedAt?: string | null },
): ConversationDetail => ({
  id,
  title: id,
  role,
  is_pinned: options?.isPinned ?? false,
  pinned_at: options?.pinnedAt ?? null,
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
    setConversationPinnedFnMock.mockReset()
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

  it('addConversation and setConversations merge, dedupe and sort by pinned then updated_at', () => {
    const olderPinned = createMeta('c-1', '2024-01-01T00:00:00.000Z', 'older', {
      isPinned: true,
      pinnedAt: '2024-01-03T00:00:00.000Z',
    })
    const newerUnpinned = createMeta('c-2', '2024-01-02T00:00:00.000Z', 'newer')

    useConversationsStore.getState().addConversation(olderPinned)
    useConversationsStore.getState().addConversation(newerUnpinned)
    expect(useConversationsStore.getState().conversations.map((item) => item.id)).toEqual([
      'c-1',
      'c-2',
    ])

    useConversationsStore.getState().setConversations([
      createMeta('c-2', '2024-01-04T00:00:00.000Z', 'updated title', {
        isPinned: true,
        pinnedAt: '2024-01-05T00:00:00.000Z',
      }),
    ])

    expect(useConversationsStore.getState().conversations).toEqual([
      createMeta('c-2', '2024-01-04T00:00:00.000Z', 'updated title', {
        isPinned: true,
        pinnedAt: '2024-01-05T00:00:00.000Z',
      }),
      olderPinned,
    ])
  })

  it('loadInitialConversations loads page, sets flags and syncs latest role', async () => {
    listConversationsPageFnMock.mockResolvedValueOnce({
      items: [
        createDetail('c-2', '2024-01-03T00:00:00.000Z', 'role-latest'),
        createDetail('c-1', '2024-01-02T00:00:00.000Z', 'role-old'),
      ],
      nextCursor: {
        is_pinned: 0,
        sort_at: '2024-01-02T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        id: 'c-1',
      },
    })

    await useConversationsStore.getState().loadInitialConversations()

    expect(listConversationsPageFnMock).toHaveBeenCalledWith({
      data: { limit: 10, cursor: null },
    })
    expect(useConversationsStore.getState()).toMatchObject({
      hasLoaded: true,
      conversationsLoading: false,
      hasMore: true,
      conversationsCursor: {
        is_pinned: 0,
        sort_at: '2024-01-02T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        id: 'c-1',
      },
    })
    expect(useConversationsStore.getState().conversations.map((item) => item.id)).toEqual([
      'c-2',
      'c-1',
    ])
  })

  it('loadMoreConversations merges next page and updates cursor', async () => {
    useConversationsStore.setState({
      conversations: [createMeta('c-1', '2024-01-02T00:00:00.000Z')],
      hasLoaded: true,
      hasMore: true,
      conversationsCursor: {
        is_pinned: 0,
        sort_at: '2024-01-02T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        id: 'c-1',
      },
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
        cursor: {
          is_pinned: 0,
          sort_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          id: 'c-1',
        },
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

  it('setConversationPinned applies optimistic update and keeps server pinned_at', async () => {
    useConversationsStore.setState({
      conversations: [createMeta('c-1', '2024-01-02T00:00:00.000Z')],
      hasLoaded: true,
    })

    setConversationPinnedFnMock.mockResolvedValueOnce({
      ok: true,
      pinned_at: '2024-01-10T00:00:00.000Z',
    })

    await useConversationsStore.getState().setConversationPinned('c-1', true)

    expect(setConversationPinnedFnMock).toHaveBeenCalledWith({
      data: { id: 'c-1', pinned: true },
    })
    expect(useConversationsStore.getState().conversations[0]).toMatchObject({
      id: 'c-1',
      is_pinned: true,
      pinned_at: '2024-01-10T00:00:00.000Z',
    })
  })

  it('setConversationPinned rolls back on request failure', async () => {
    const original = createMeta('c-1', '2024-01-02T00:00:00.000Z')
    useConversationsStore.setState({
      conversations: [original],
      hasLoaded: true,
    })

    setConversationPinnedFnMock.mockRejectedValueOnce(new Error('network error'))

    await useConversationsStore.getState().setConversationPinned('c-1', true)

    expect(useConversationsStore.getState().conversations[0]).toEqual(original)
  })
})
