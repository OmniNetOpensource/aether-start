import { beforeEach, describe, expect, it, vi } from 'vitest'

const { MockAgent } = vi.hoisted(() => {
  class MockAgent {
    env: Record<string, unknown>
    name: string
    ctx: { waitUntil: ReturnType<typeof vi.fn> }
    broadcast: ReturnType<typeof vi.fn>

    constructor() {
      this.env = {}
      this.name = ''
      this.ctx = {
        waitUntil: vi.fn(),
      }
      this.broadcast = vi.fn()
    }
  }

  return {
    MockAgent,
  }
})

vi.mock('agents', () => ({
  Agent: MockAgent,
}))

vi.mock('@/server/agents/tools/executor', () => ({
  getAvailableTools: vi.fn(() => []),
  executeToolsGen: vi.fn(),
}))

vi.mock('@/server/agents/services/chat-config', () => ({
  getDefaultRoleConfig: vi.fn(),
  getRoleConfig: vi.fn(),
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
  name: string
  runtimeState: {
    status: 'running'
    currentRequestId: string
    conversationId: string
    ownerUserId: string
    updatedAt: number
  }
  persistAndBroadcastEvent: (requestId: string, event: { type: 'content'; content: string }) => void
  onMessage: (connection: never, message: string) => Promise<void>
}

class MockConnection {
  state: unknown
  sent: string[] = []
  closed: Array<{ code: number; reason: string }> = []

  constructor(userId = 'user-1') {
    this.state = { userId }
  }

  send(message: string) {
    this.sent.push(message)
  }

  close(code: number, reason: string) {
    this.closed.push({ code, reason })
  }

  setState(nextState: unknown) {
    this.state = nextState
  }
}

const createAgent = () => {
  const agent = new ChatAgent({} as never, {} as never) as unknown as TestChatAgent

  agent.name = 'conv-1'
  agent.runtimeState = {
    status: 'running',
    currentRequestId: 'req-2',
    conversationId: 'conv-1',
    ownerUserId: 'user-1',
    updatedAt: Date.now(),
  }

  return agent
}

describe('ChatAgent sync replay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only the events newer than the client lastEventId', async () => {
    const agent = createAgent()
    const connection = new MockConnection()

    agent.persistAndBroadcastEvent('req-1', {
      type: 'content',
      content: 'one',
    })
    agent.persistAndBroadcastEvent('req-1', {
      type: 'content',
      content: 'two',
    })
    agent.persistAndBroadcastEvent('req-2', {
      type: 'content',
      content: 'three',
    })

    await agent.onMessage(
      connection as never,
      JSON.stringify({
        type: 'sync',
        conversationId: 'conv-1',
        lastEventId: 1,
      }),
    )

    expect(connection.sent).toHaveLength(1)

    const response = JSON.parse(connection.sent[0])
    expect(response).toMatchObject({
      type: 'sync_response',
      status: 'running',
      requestId: 'req-2',
    })
    expect(response.events).toHaveLength(2)
    expect(response.events.map((event: { eventId: number }) => event.eventId)).toEqual([2, 3])
    expect(
      response.events.map(
        (event: { event: { type: string; content: string } }) => event.event.content,
      ),
    ).toEqual(['two', 'three'])
  })

  it('treats negative lastEventId as 0 and replays the whole cache', async () => {
    const agent = createAgent()
    const connection = new MockConnection()

    agent.persistAndBroadcastEvent('req-1', {
      type: 'content',
      content: 'one',
    })
    agent.persistAndBroadcastEvent('req-1', {
      type: 'content',
      content: 'two',
    })

    await agent.onMessage(
      connection as never,
      JSON.stringify({
        type: 'sync',
        conversationId: 'conv-1',
        lastEventId: -999,
      }),
    )

    const response = JSON.parse(connection.sent[0])
    expect(response.events).toHaveLength(2)
    expect(response.events.map((event: { eventId: number }) => event.eventId)).toEqual([1, 2])
  })

  it('returns an empty replay when the client already has the latest event', async () => {
    const agent = createAgent()
    const connection = new MockConnection()

    agent.persistAndBroadcastEvent('req-1', {
      type: 'content',
      content: 'one',
    })
    agent.persistAndBroadcastEvent('req-1', {
      type: 'content',
      content: 'two',
    })

    await agent.onMessage(
      connection as never,
      JSON.stringify({
        type: 'sync',
        conversationId: 'conv-1',
        lastEventId: 2,
      }),
    )

    const response = JSON.parse(connection.sent[0])
    expect(response.events).toEqual([])
  })
})
