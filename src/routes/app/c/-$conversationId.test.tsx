import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const {
  resetLastEventIdMock,
  resumeRunningConversationMock,
  useConversationLoaderMock,
  clearRequestStateMock,
  setConnectionStateMock,
  resetRequestListeners,
  subscribeRequestStateMock,
  requestState,
} = vi.hoisted(() => {
  const requestListeners = new Set<() => void>()
  const requestState = {
    requestPhase: 'done' as 'sending' | 'answering' | 'done',
    connectionState: 'idle' as 'idle' | 'connecting' | 'connected' | 'disconnected',
  }

  return {
    resetLastEventIdMock: vi.fn(),
    resumeRunningConversationMock: vi.fn().mockResolvedValue(undefined),
    useConversationLoaderMock: vi.fn(),
    clearRequestStateMock: vi.fn(),
    setConnectionStateMock: vi.fn((connectionState: 'idle' | 'connecting' | 'connected' | 'disconnected') => {
      requestState.connectionState = connectionState
      requestListeners.forEach((listener) => listener())
    }),
    resetRequestListeners: () => requestListeners.clear(),
    subscribeRequestStateMock: vi.fn((listener: () => void) => {
      requestListeners.add(listener)
      return () => {
        requestListeners.delete(listener)
      }
    }),
    requestState,
  }
})

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({
    useParams: () => ({ conversationId: 'conv-1' }),
  }),
}))

vi.mock('@/features/sidebar/hooks/useConversationLoader', () => ({
  useConversationLoader: useConversationLoaderMock,
}))

vi.mock('@/features/chat/lib/api/chat-orchestrator', () => ({
  resetLastEventId: resetLastEventIdMock,
  resumeRunningConversation: resumeRunningConversationMock,
}))

vi.mock('@/features/chat/store/useChatRequestStore', () => ({
  useChatRequestStore: Object.assign(
    (selector: (state: {
      requestPhase: typeof requestState.requestPhase
      connectionState: typeof requestState.connectionState
    }) => unknown) =>
      selector({
        requestPhase: requestState.requestPhase,
        connectionState: requestState.connectionState,
      }),
    {
      getState: () => ({
        requestPhase: requestState.requestPhase,
        connectionState: requestState.connectionState,
        clearRequestState: clearRequestStateMock,
        setConnectionState: setConnectionStateMock,
      }),
      subscribe: subscribeRequestStateMock,
    },
  ),
}))

vi.mock('@/features/sidebar/store/useConversationsStore', () => ({
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
    subscribeRequestStateMock.mockClear()
    resetRequestListeners()
    requestState.requestPhase = 'done'
    requestState.connectionState = 'idle'
    useConversationLoaderMock.mockReturnValue({ isLoading: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not start recovery directly from the route on mount', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
      await flush()
    })

    expect(resumeRunningConversationMock).not.toHaveBeenCalled()

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

  it('marks the connection as disconnected when the browser goes offline mid-stream', async () => {
    requestState.requestPhase = 'answering'
    requestState.connectionState = 'connected'

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
      await flush()
    })

    setConnectionStateMock.mockClear()

    await act(async () => {
      window.dispatchEvent(new Event('offline'))
      await flush()
    })

    expect(setConnectionStateMock).toHaveBeenCalledWith('disconnected')

    await act(async () => {
      root.unmount()
      await flush()
    })
  })

  it('tries to resume the running conversation when the browser comes back online', async () => {
    requestState.requestPhase = 'answering'
    requestState.connectionState = 'disconnected'

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
      await flush()
    })

    resumeRunningConversationMock.mockClear()

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await flush()
    })

    expect(resumeRunningConversationMock).toHaveBeenCalledWith(
      'conv-1',
      expect.any(AbortSignal),
    )

    await act(async () => {
      root.unmount()
      await flush()
    })
  })

  it('retries with backoff when the stream is disconnected without an offline event', async () => {
    vi.useFakeTimers()

    requestState.requestPhase = 'answering'
    requestState.connectionState = 'disconnected'

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ConversationPage />)
      await flush()
    })

    resumeRunningConversationMock.mockClear()

    await act(async () => {
      vi.advanceTimersByTime(999)
      await flush()
    })

    expect(resumeRunningConversationMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await flush()
    })

    expect(resumeRunningConversationMock).toHaveBeenCalledWith(
      'conv-1',
      expect.any(AbortSignal),
    )

    await act(async () => {
      root.unmount()
      await flush()
    })
  })

  it('resets event cursor on unmount', async () => {
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

    expect(resetLastEventIdMock).toHaveBeenCalledTimes(1)
  })
})
