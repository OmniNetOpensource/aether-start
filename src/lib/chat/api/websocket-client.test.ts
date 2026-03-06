import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agentClientInstances, MockAgentClient } = vi.hoisted(() => {
  type MockEventListener = (event?: unknown) => void
  const agentClientInstances: MockAgentClient[] = []

  class MockAgentClient {
    static nextReadyError: Error | null = null

    public ready: Promise<void>
    public sent: string[] = []
    public closed = false
    private listeners = new Map<string, Set<MockEventListener>>()

    constructor() {
      agentClientInstances.push(this)
      const nextError = MockAgentClient.nextReadyError
      MockAgentClient.nextReadyError = null
      this.ready = nextError ? Promise.reject(nextError) : Promise.resolve()
    }

    addEventListener(type: string, callback: MockEventListener) {
      const set = this.listeners.get(type) ?? new Set()
      set.add(callback)
      this.listeners.set(type, set)
    }

    removeEventListener(type: string, callback: MockEventListener) {
      this.listeners.get(type)?.delete(callback)
    }

    send(message: string) {
      this.sent.push(message)
    }

    close() {
      this.closed = true
    }

    emit(type: string, event?: unknown) {
      for (const callback of this.listeners.get(type) ?? []) {
        callback(event)
      }
    }
  }

  return {
    agentClientInstances,
    MockAgentClient,
  }
})

vi.mock('agents/client', () => ({
  AgentClient: MockAgentClient,
}))

import {
  ChatClient,
  resetLastEventId,
} from './websocket-client'

describe('websocket-client global lastEventId', () => {
  beforeEach(() => {
    resetLastEventId()
    agentClientInstances.length = 0
    MockAgentClient.nextReadyError = null
  })

  it('starts sync from 0 for a fresh page lifecycle', async () => {
    const client = new ChatClient({
      onEvent: vi.fn(),
      onError: vi.fn(),
    })

    await client.sync('conv-a')

    expect(agentClientInstances).toHaveLength(1)
    expect(JSON.parse(agentClientInstances[0].sent[0])).toMatchObject({
      type: 'sync',
      conversationId: 'conv-a',
      lastEventId: 0,
    })
  })

  it('deduplicates live and sync events against the global cursor', async () => {
    const onEvent = vi.fn()
    const client = new ChatClient({
      onEvent,
      onError: vi.fn(),
    })

    await client.connect('conv-a')

    const socket = agentClientInstances[0]
    socket.emit('message', {
      data: JSON.stringify({
        type: 'chat_event',
        eventId: 1,
        requestId: 'req-1',
        event: {
          type: 'content',
          content: 'hello',
        },
      }),
    })

    socket.emit('message', {
      data: JSON.stringify({
        type: 'chat_event',
        eventId: 1,
        requestId: 'req-1',
        event: {
          type: 'content',
          content: 'duplicate',
        },
      }),
    })

    socket.emit('message', {
      data: JSON.stringify({
        type: 'sync_response',
        status: 'running',
        requestId: 'req-1',
        events: [
          {
            eventId: 1,
            requestId: 'req-1',
            event: {
              type: 'content',
              content: 'already-consumed',
            },
          },
          {
            eventId: 2,
            requestId: 'req-1',
            event: {
              type: 'content',
              content: 'world',
            },
          },
        ],
      }),
    })

    await client.sync('conv-a')

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent.mock.calls[0]?.[1]).toMatchObject({
      eventId: 1,
      source: 'live',
    })
    expect(onEvent.mock.calls[1]?.[1]).toMatchObject({
      eventId: 2,
      source: 'sync',
    })
    expect(JSON.parse(socket.sent[socket.sent.length - 1])).toMatchObject({
      type: 'sync',
      conversationId: 'conv-a',
      lastEventId: 2,
    })
  })

  it('allows the same event ids again after reset', async () => {
    const onEvent = vi.fn()
    const client = new ChatClient({
      onEvent,
      onError: vi.fn(),
    })

    await client.connect('conv-a')

    const socket = agentClientInstances[0]
    const emitEventOne = () =>
      socket.emit('message', {
        data: JSON.stringify({
          type: 'chat_event',
          eventId: 1,
          requestId: 'req-1',
          event: {
            type: 'content',
            content: 'hello',
          },
        }),
      })

    emitEventOne()
    resetLastEventId()
    emitEventOne()
    await client.sync('conv-a')

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(JSON.parse(socket.sent[socket.sent.length - 1])).toMatchObject({
      type: 'sync',
      lastEventId: 1,
    })
  })
})
