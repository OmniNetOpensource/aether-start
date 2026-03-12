import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateTitleFromConversation } from '@/server/functions/chat/chat-title'
import { getConversationById, upsertConversation } from '@/server/db/conversations-db'

const { MockDurableObject } = vi.hoisted(() => {
  class MockDurableObject {
    env: Record<string, unknown>
    ctx: {
      waitUntil: ReturnType<typeof vi.fn>
    }

    constructor() {
      this.env = {}
      this.ctx = {
        waitUntil: vi.fn(),
      }
    }
  }

  return {
    MockDurableObject,
  }
})

vi.mock('cloudflare:workers', () => ({
  DurableObject: MockDurableObject,
}))

vi.mock('@/server/agents/tools/executor', () => ({
  getAvailableTools: vi.fn(() => []),
  executeToolsGen: vi.fn(),
}))

vi.mock('@/server/agents/services/model-provider-config', () => ({
  getDefaultModelConfig: vi.fn(),
  getModelConfig: vi.fn(),
  getPromptById: vi.fn(),
  getDefaultPromptId: vi.fn(() => 'aether'),
  getBackendConfig: vi.fn(),
}))

vi.mock('@/server/agents/services/logger', () => ({
  log: vi.fn(),
}))

vi.mock('@/server/agents/services/provider-factory', () => ({
  createChatProvider: vi.fn(),
}))

vi.mock('@/server/functions/chat/chat-title', () => ({
  generateTitleFromConversation: vi.fn(),
}))

vi.mock('@/server/agents/services/event-processor', () => ({
  processEventToTree: vi.fn((tree) => tree),
  cloneTreeSnapshot: vi.fn((tree) => tree),
}))

vi.mock('@/server/db/conversations-db', () => ({
  getConversationById: vi.fn(),
  upsertConversation: vi.fn(),
}))

vi.mock('@/server/db/prompt-quota-db', () => ({
  consumePromptQuotaOnAccept: vi.fn(),
}))

import { ChatAgent } from './chat-agent'

type TestChatAgent = {
  runtimeState: {
    status: 'running'
    conversationId: string
    ownerUserId: string
    updatedAt: number
  }
  persistAndBroadcastEvent: (event: { type: 'content'; content: string }) => void
  persistConversationSnapshot: (
    conversationId: string,
    userId: string,
    snapshot: {
      messages: Array<{
        id: number
        prevSibling: number | null
        nextSibling: number | null
        latestChild: number | null
        createdAt: string
        role: 'user' | 'assistant'
        blocks: Array<{ type: 'content'; content: string }>
      }>
      currentPath: number[]
      latestRootId: number
      nextId: number
    },
    role: string,
    completed: boolean,
  ) => Promise<void>
  fetch: (request: Request) => Promise<Response>
  ensureInitialized: (name: string) => void
}

const createAgent = (status: 'running' | 'completed' = 'running') => {
  const agent = new ChatAgent({} as never, {} as never) as unknown as TestChatAgent

  agent.ensureInitialized('conv-1')
  agent.runtimeState = {
    status,
    conversationId: 'conv-1',
    ownerUserId: 'user-1',
    updatedAt: Date.now(),
  } as TestChatAgent['runtimeState']

  return agent
}

// Helper: consume SSE response body into parsed events
const consumeSSEResponse = async (response: Response) => {
  const text = await response.text()
  const parts = text.split('\n\n').filter(Boolean)
  const events: Array<{ event: string; data: unknown }> = []

  for (const part of parts) {
    let event = 'message'
    let data = ''
    for (const line of part.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7)
      else if (line.startsWith('data: ')) data += line.slice(6)
    }
    if (data) {
      events.push({ event, data: JSON.parse(data) })
    }
  }

  return events
}

describe('ChatAgent sync replay via POST /events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only the events newer than the client lastEventId', async () => {
    const agent = createAgent('completed')

    agent.persistAndBroadcastEvent({
      type: 'content',
      content: 'one',
    })
    agent.persistAndBroadcastEvent({
      type: 'content',
      content: 'two',
    })
    agent.persistAndBroadcastEvent({
      type: 'content',
      content: 'three',
    })

    const request = new Request(
      'http://localhost/agents/chat-agent/conv-1/events',
      {
        method: 'POST',
        headers: {
          'x-aether-user-id': 'user-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lastEventId: 1 }),
      },
    )

    const response = await agent.fetch(request)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')

    const events = await consumeSSEResponse(response)
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('sync_response')

    const syncData = events[0].data as {
      status: string
      events: Array<{ eventId: number; event: { content: string } }>
    }
    expect(syncData.status).toBe('completed')
    expect(syncData.events).toHaveLength(2)
    expect(syncData.events.map((e) => e.eventId)).toEqual([2, 3])
    expect(syncData.events.map((e) => e.event.content)).toEqual(['two', 'three'])
  })

  it('treats negative lastEventId as 0 and replays the whole cache', async () => {
    const agent = createAgent('completed')

    agent.persistAndBroadcastEvent({
      type: 'content',
      content: 'one',
    })
    agent.persistAndBroadcastEvent({
      type: 'content',
      content: 'two',
    })

    const request = new Request(
      'http://localhost/agents/chat-agent/conv-1/events',
      {
        method: 'POST',
        headers: {
          'x-aether-user-id': 'user-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lastEventId: -999 }),
      },
    )

    const response = await agent.fetch(request)
    const events = await consumeSSEResponse(response)
    const syncData = events[0].data as { events: Array<{ eventId: number }> }
    expect(syncData.events).toHaveLength(2)
    expect(syncData.events.map((e) => e.eventId)).toEqual([1, 2])
  })

  it('returns an empty replay when the client already has the latest event', async () => {
    const agent = createAgent('completed')

    agent.persistAndBroadcastEvent({
      type: 'content',
      content: 'one',
    })
    agent.persistAndBroadcastEvent({
      type: 'content',
      content: 'two',
    })

    const request = new Request(
      'http://localhost/agents/chat-agent/conv-1/events',
      {
        method: 'POST',
        headers: {
          'x-aether-user-id': 'user-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lastEventId: 2 }),
      },
    )

    const response = await agent.fetch(request)
    const events = await consumeSSEResponse(response)
    const syncData = events[0].data as { events: unknown[] }
    expect(syncData.events).toEqual([])
  })
})

describe('ChatAgent title regeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('regenerates title from the current conversation when a reply completes', async () => {
    vi.mocked(getConversationById).mockResolvedValue({
      user_id: 'user-1',
      id: 'conv-1',
      title: 'Old Title',
      role: 'assistant',
      currentPath: [1, 2],
      messages: [],
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      is_pinned: false,
      pinned_at: null,
    } as never)
    vi.mocked(generateTitleFromConversation).mockResolvedValue('New Title')
    vi.mocked(upsertConversation).mockResolvedValue(undefined as never)

    const agent = createAgent()

    await agent.persistConversationSnapshot(
      'conv-1',
      'user-1',
      {
        messages: [
          {
            id: 1,
            prevSibling: null,
            nextSibling: null,
            latestChild: 2,
            createdAt: '2024-01-01T00:00:00.000Z',
            role: 'user',
            blocks: [{ type: 'content', content: '我想做一个番茄炒蛋' }],
          },
          {
            id: 2,
            prevSibling: null,
            nextSibling: null,
            latestChild: 3,
            createdAt: '2024-01-01T00:00:01.000Z',
            role: 'assistant',
            blocks: [{ type: 'content', content: '我给你一个家常做法' }],
          },
          {
            id: 3,
            prevSibling: null,
            nextSibling: null,
            latestChild: 4,
            createdAt: '2024-01-01T00:00:02.000Z',
            role: 'user',
            blocks: [{ type: 'content', content: '顺便告诉我要不要放糖' }],
          },
          {
            id: 4,
            prevSibling: null,
            nextSibling: null,
            latestChild: null,
            createdAt: '2024-01-01T00:00:03.000Z',
            role: 'assistant',
            blocks: [{ type: 'content', content: '可以少放一点提鲜' }],
          },
        ],
        currentPath: [1, 2, 3, 4],
        latestRootId: 1,
        nextId: 5,
      },
      'assistant',
      true,
    )

    expect(generateTitleFromConversation).toHaveBeenCalledWith(
      'User: 我想做一个番茄炒蛋\nAssistant: 我给你一个家常做法\nUser: 顺便告诉我要不要放糖\nAssistant: 可以少放一点提鲜',
    )
    expect(vi.mocked(upsertConversation).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        id: 'conv-1',
        title: 'New Title',
      }),
    )
  })

  it('keeps the existing title when this run did not complete normally', async () => {
    vi.mocked(getConversationById).mockResolvedValue({
      user_id: 'user-1',
      id: 'conv-1',
      title: 'Stable Title',
      role: 'assistant',
      currentPath: [1, 2],
      messages: [],
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      is_pinned: false,
      pinned_at: null,
    } as never)
    vi.mocked(upsertConversation).mockResolvedValue(undefined as never)

    const agent = createAgent()

    await agent.persistConversationSnapshot(
      'conv-1',
      'user-1',
      {
        messages: [
          {
            id: 1,
            prevSibling: null,
            nextSibling: null,
            latestChild: 2,
            createdAt: '2024-01-01T00:00:00.000Z',
            role: 'user',
            blocks: [{ type: 'content', content: '你好' }],
          },
          {
            id: 2,
            prevSibling: null,
            nextSibling: null,
            latestChild: null,
            createdAt: '2024-01-01T00:00:01.000Z',
            role: 'assistant',
            blocks: [{ type: 'content', content: '你好，我在' }],
          },
        ],
        currentPath: [1, 2],
        latestRootId: 1,
        nextId: 3,
      },
      'assistant',
      false,
    )

    expect(generateTitleFromConversation).not.toHaveBeenCalled()
    expect(vi.mocked(upsertConversation).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        id: 'conv-1',
        title: 'Stable Title',
      }),
    )
  })
})
