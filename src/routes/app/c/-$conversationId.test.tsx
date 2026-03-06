import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const {
  disposeConnectionMock,
  resetLastEventIdMock,
  resumeIfRunningMock,
  useConversationLoaderMock,
} = vi.hoisted(() => ({
  disposeConnectionMock: vi.fn(),
  resetLastEventIdMock: vi.fn(),
  resumeIfRunningMock: vi.fn(),
  useConversationLoaderMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({
    useParams: () => ({ conversationId: 'conv-1' }),
  }),
}))

vi.mock('@/hooks/useConversationLoader', () => ({
  useConversationLoader: useConversationLoaderMock,
}))

vi.mock('@/lib/chat/api/websocket-client', () => ({
  resetLastEventId: resetLastEventIdMock,
}))

vi.mock('@/stores/useConversationsStore', () => ({
  useConversationsStore: (selector: (state: { conversations: Array<{ id: string; title: string }> }) => unknown) =>
    selector({
      conversations: [{ id: 'conv-1', title: 'Conversation' }],
    }),
}))

vi.mock('@/stores/useChatRequestStore', () => ({
  useChatRequestStore: {
    getState: () => ({
      disposeConnection: disposeConnectionMock,
      resumeIfRunning: resumeIfRunningMock,
    }),
  },
}))

vi.mock('@/components/chat/composer/Composer', () => ({
  Composer: () => <div>Composer</div>,
}))

vi.mock('@/components/chat/message/MessageList', () => ({
  MessageList: () => <div>MessageList</div>,
}))

import { ConversationPage } from './$conversationId'

const dispatchPageTransitionEvent = (type: 'pagehide' | 'pageshow', persisted: boolean) => {
  const event = new Event(type)
  Object.defineProperty(event, 'persisted', {
    configurable: true,
    value: persisted,
  })
  window.dispatchEvent(event)
}

describe('ConversationPage cleanup', () => {
  beforeEach(() => {
    disposeConnectionMock.mockReset()
    resetLastEventIdMock.mockReset()
    resumeIfRunningMock.mockReset()
    useConversationLoaderMock.mockReturnValue({ isLoading: false })
  })

  it('ignores pagehide when the page is entering the bfcache', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
    })

    dispatchPageTransitionEvent('pagehide', true)

    expect(resetLastEventIdMock).not.toHaveBeenCalled()
    expect(disposeConnectionMock).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('resets global lastEventId and disposes the connection on real pagehide', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
    })

    dispatchPageTransitionEvent('pagehide', false)

    expect(resetLastEventIdMock).toHaveBeenCalledTimes(1)
    expect(disposeConnectionMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('resumes the conversation when restoring from the bfcache', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
    })

    dispatchPageTransitionEvent('pageshow', true)

    expect(resumeIfRunningMock).toHaveBeenCalledWith('conv-1')
    expect(disposeConnectionMock).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('resets global lastEventId and disposes the connection on unmount', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
    })

    await act(async () => {
      root.unmount()
    })

    expect(resetLastEventIdMock).toHaveBeenCalledTimes(1)
    expect(disposeConnectionMock).toHaveBeenCalledTimes(1)
  })
})
