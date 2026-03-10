import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initialChatRequestState,
  useChatRequestStore,
} from '@/stores/zustand/useChatRequestStore'

const {
  addConversationMock,
  appNavigateMock,
  applyChatEventToTreeMock,
  messageTreeState,
  fetchMock,
} = vi.hoisted(() => {
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
    messageTreeState,
    fetchMock: vi.fn(),
  }
})

vi.mock('@/hooks/useToast', () => ({
  toast: {
    warning: vi.fn(),
  },
}))

vi.mock('@/stores/zustand/useConversationsStore', () => ({
  useConversationsStore: {
    getState: () => ({
      addConversation: addConversationMock,
    }),
  },
}))

vi.mock('@/lib/chat/api/event-handlers', () => ({
  applyChatEventToTree: applyChatEventToTreeMock,
}))

vi.mock('@/lib/navigation', () => ({
  appNavigate: appNavigateMock,
}))

vi.mock('@/stores/zustand/useMessageTreeStore', () => ({
  useMessageTreeStore: {
    getState: () => messageTreeState,
  },
}))

vi.stubGlobal('fetch', fetchMock)

// Helper: create a ReadableStream that closes immediately
const emptyStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })

// Helper: create an SSE stream from events
const sseStream = (events: Array<{ event: string; data: unknown }>) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const { event, data } of events) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        )
      }
      controller.close()
    },
  })

describe('chat-orchestrator SSE model', () => {
  beforeEach(() => {
    addConversationMock.mockReset()
    appNavigateMock.mockReset()
    applyChatEventToTreeMock.mockReset()
    fetchMock.mockReset()

    useChatRequestStore.setState(initialChatRequestState)
    useChatRequestStore.getState().setCurrentRole('aether')
    useChatRequestStore.getState().setAvailableRoles([
      { id: 'aether', name: 'Aether' },
    ])

    messageTreeState.conversationId = 'conv-1'
    messageTreeState.setConversationId.mockClear()
    messageTreeState._getTreeState.mockClear()
  })

  it('sends a POST to /chat and consumes the SSE response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream([
        { event: 'chat_started', data: { requestId: 'req-1' } },
        {
          event: 'chat_event',
          data: {
            eventId: 1,
            requestId: 'req-1',
            event: { type: 'content', content: 'hello' },
          },
        },
        {
          event: 'chat_finished',
          data: { requestId: 'req-1', status: 'completed' },
        },
      ]),
    })

    const orchestrator = await import('./chat-orchestrator')
    await orchestrator.startChatRequest({
      messages: [{ role: 'user', blocks: [] } as never],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/conv-1/chat')
    expect(opts.method).toBe('POST')

    // After SSE consumption finishes, request should be done
    expect(useChatRequestStore.getState().status).toBe('done')
    expect(applyChatEventToTreeMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'content', content: 'hello' }),
    )
  })

  it('creates a new conversation when conversationId is null', async () => {
    messageTreeState.conversationId = null

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream([
        {
          event: 'chat_finished',
          data: { requestId: 'req-1', status: 'completed' },
        },
      ]),
    })

    const orchestrator = await import('./chat-orchestrator')
    await orchestrator.startChatRequest({
      messages: [{ role: 'user', blocks: [] } as never],
    })

    expect(messageTreeState.setConversationId).toHaveBeenCalledTimes(1)
    expect(addConversationMock).toHaveBeenCalledTimes(1)
    expect(appNavigateMock).toHaveBeenCalledWith(
      expect.stringContaining('/app/c/'),
    )
  })

  it('handles 409 busy response from server', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ currentRequestId: 'req-busy' }),
    })

    const orchestrator = await import('./chat-orchestrator')
    await orchestrator.startChatRequest({
      messages: [{ role: 'user', blocks: [] } as never],
    })

    // Should set to answering with the busy request's ID
    expect(useChatRequestStore.getState().status).toBe('answering')
    expect(useChatRequestStore.getState().activeRequestId).toBe('req-busy')
  })

  it('stopActiveChatRequest aborts and sends abort to server', async () => {
    // Set up an in-flight request
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: emptyStream(),
    })

    const orchestrator = await import('./chat-orchestrator')
    // Start request (it will resolve immediately due to empty stream)
    await orchestrator.startChatRequest({
      messages: [{ role: 'user', blocks: [] } as never],
    })

    // Reset mock for the abort call
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })

    orchestrator.stopActiveChatRequest()

    // Abort POST should have been made
    const abortCall = fetchMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/abort'),
    )
    expect(abortCall).toBeDefined()
    expect(useChatRequestStore.getState().status).toBe('done')
  })

  it('resumeRunningConversation connects to events stream when agent is running', async () => {
    // First call: status probe
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'running', requestId: 'req-remote' }),
    })

    // Second call: events stream
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream([
        {
          event: 'sync_response',
          data: {
            status: 'running',
            requestId: 'req-remote',
            events: [],
          },
        },
        {
          event: 'chat_finished',
          data: { requestId: 'req-remote', status: 'completed' },
        },
      ]),
    })

    const orchestrator = await import('./chat-orchestrator')
    const ac = new AbortController()
    await orchestrator.resumeRunningConversation('conv-1', ac.signal)

    expect(useChatRequestStore.getState().status).toBe('done')

    // Should have made the status probe and events subscription
    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>
    expect(calls.some(([url]) => url.includes('/conv-1') && !url.includes('/events'))).toBe(true)
    expect(calls.some(([url]) => url.includes('/conv-1/events'))).toBe(true)
  })

  it('resumeRunningConversation does nothing when agent is idle', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'idle' }),
    })

    const orchestrator = await import('./chat-orchestrator')
    const ac = new AbortController()
    await orchestrator.resumeRunningConversation('conv-1', ac.signal)

    // Only the status probe should have been called
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
