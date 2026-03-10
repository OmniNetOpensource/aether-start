import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const {
  resetLastEventIdMock,
  resumeRunningConversationMock,
  useConversationLoaderMock,
  clearRequestStateMock,
  setConnectionStateMock,
} = vi.hoisted(() => ({
  resetLastEventIdMock: vi.fn(),
  resumeRunningConversationMock: vi.fn().mockResolvedValue(undefined),
  useConversationLoaderMock: vi.fn(),
  clearRequestStateMock: vi.fn(),
  setConnectionStateMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({
    useParams: () => ({ conversationId: 'conv-1' }),
  }),
}))

vi.mock('@/features/conversations/hooks/useConversationLoader', () => ({
  useConversationLoader: useConversationLoaderMock,
}))

vi.mock('@/features/chat/lib/api/chat-orchestrator', () => ({
  resetLastEventId: resetLastEventIdMock,
  resumeRunningConversation: resumeRunningConversationMock,
}))

vi.mock('@/features/chat/store/useChatRequestStore', () => ({
  useChatRequestStore: {
    getState: () => ({
      clearRequestState: clearRequestStateMock,
      setConnectionState: setConnectionStateMock,
    }),
  },
}))

vi.mock('@/features/conversations/store/useConversationsStore', () => ({
  useConversationsStore: (selector: (state: { conversations: Array<{ id: string; title: string }> }) => unknown) =>
    selector({
      conversations: [{ id: 'conv-1', title: 'Conversation' }],
    }),
}))

vi.mock('@/features/chat/components/composer/Composer', () => ({
  Composer: () => <div>Composer</div>,
}))

vi.mock('@/features/chat/components/message/MessageList', () => ({
  MessageList: () => <div>MessageList</div>,
}))

import { ConversationPage } from './$conversationId'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('ConversationPage SSE lifecycle', () => {
  beforeEach(() => {
    resetLastEventIdMock.mockReset()
    resumeRunningConversationMock.mockReset()
    resumeRunningConversationMock.mockResolvedValue(undefined)
    clearRequestStateMock.mockReset()
    setConnectionStateMock.mockReset()
    useConversationLoaderMock.mockReturnValue({ isLoading: false })
  })

  it('calls resumeRunningConversation on mount with an AbortSignal', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
      await flush()
    })

    expect(resetLastEventIdMock).toHaveBeenCalled()
    expect(resumeRunningConversationMock).toHaveBeenCalledTimes(1)
    expect(resumeRunningConversationMock).toHaveBeenCalledWith(
      'conv-1',
      expect.any(AbortSignal),
    )

    await act(async () => {
      root.unmount()
      await flush()
    })
  })

  it('clears request state on unmount', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
      await flush()
    })

    await act(async () => {
      root.unmount()
      await flush()
    })

    expect(clearRequestStateMock).toHaveBeenCalled()
    expect(setConnectionStateMock).toHaveBeenCalledWith('idle')
  })

  it('resets event cursor on both mount and unmount', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
      await flush()
    })

    const mountResetCount = resetLastEventIdMock.mock.calls.length

    await act(async () => {
      root.unmount()
      await flush()
    })

    // Reset called at least on mount, and again on unmount cleanup
    expect(resetLastEventIdMock.mock.calls.length).toBeGreaterThan(mountResetCount)
  })
})
