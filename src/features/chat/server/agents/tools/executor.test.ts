import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingToolInvocation, ChatServerToClientEvent, ToolInvocationResult } from '@/types/chat-api'

const { searchHandlerMock, fetchHandlerMock, getServerEnvMock } = vi.hoisted(() => ({
  searchHandlerMock: vi.fn(),
  fetchHandlerMock: vi.fn(),
  getServerEnvMock: vi.fn(),
}))

vi.mock('cloudflare:workers', () => ({
  env: {},
}))

vi.mock('./search', () => ({
  searchTool: {
    spec: {
      type: 'function',
      function: {
        name: 'search',
        description: 'Search tool',
        parameters: {},
      },
    },
    handler: searchHandlerMock,
  },
}))

vi.mock('./fetch', () => ({
  fetchUrlTool: {
    spec: {
      type: 'function',
      function: {
        name: 'fetch_url',
        description: 'Fetch URL tool',
        parameters: {},
      },
    },
    handler: fetchHandlerMock,
  },
}))

vi.mock('@/server/env', () => ({
  getServerEnv: getServerEnvMock,
}))

vi.mock('@/server/agents/services/logger', () => ({
  log: vi.fn(),
}))

import { executeToolsGen } from './executor'

const collectExecution = async (
  generator: AsyncGenerator<ChatServerToClientEvent, ToolInvocationResult[]>,
) => {
  const events: ChatServerToClientEvent[] = []

  while (true) {
    const chunk = await generator.next()
    if (chunk.done) {
      return { events, results: chunk.value }
    }
    events.push(chunk.value)
  }
}

describe('executeToolsGen for search dual-channel result routing', () => {
  beforeEach(() => {
    searchHandlerMock.mockReset()
    fetchHandlerMock.mockReset()
    getServerEnvMock.mockReset()
    getServerEnvMock.mockReturnValue({
      SERP_API_KEY: 'test-serp-key',
      JINA_API_KEY: 'test-jina-key',
    })
  })

  it('sends client JSON to tool_result and markdown to model continuation', async () => {
    const rawToolOutput = JSON.stringify({
      client: {
        results: [{
          title: 'Result A',
          url: 'https://example.com/a',
          faviconDataUrl: 'data:image/png;base64,abc123',
        }],
      },
      ai:
        '[1]title: Result A\n' +
        '[1]description: Description A\n' +
        '[1]url: https://example.com/a',
    })
    searchHandlerMock.mockResolvedValueOnce(rawToolOutput)

    const toolCalls: PendingToolInvocation[] = [
      {
        id: 'call_1',
        name: 'search',
        args: { query: 'result a' },
      },
    ]

    const { events, results } = await collectExecution(executeToolsGen(toolCalls))

    expect(searchHandlerMock).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({
      type: 'tool_call',
      tool: 'search',
      args: { query: 'result a' },
      callId: 'call_1',
    })
    expect(events[1]).toEqual({
      type: 'tool_result',
      tool: 'search',
      result: '{"results":[{"title":"Result A","url":"https://example.com/a","faviconDataUrl":"data:image/png;base64,abc123"}]}',
      callId: 'call_1',
    })
    expect(results).toEqual([
      {
        id: 'call_1',
        name: 'search',
        result:
          '[1]title: Result A\n' +
          '[1]description: Description A\n' +
          '[1]url: https://example.com/a',
      },
    ])
  })

  it('falls back to raw string for both channels when parsing fails', async () => {
    searchHandlerMock.mockResolvedValueOnce('search raw output')

    const toolCalls: PendingToolInvocation[] = [
      {
        id: 'call_2',
        name: 'search',
        args: { query: 'raw fallback' },
      },
    ]

    const { events, results } = await collectExecution(executeToolsGen(toolCalls))

    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({
      type: 'tool_result',
      tool: 'search',
      result: 'search raw output',
      callId: 'call_2',
    })
    expect(results).toEqual([
      {
        id: 'call_2',
        name: 'search',
        result: 'search raw output',
      },
    ])
  })

  it('sends fetch favicon payload to the client and keeps raw result for the model', async () => {
    fetchHandlerMock.mockResolvedValueOnce('Fetched markdown content')

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue(
      new Response('icon', {
        headers: {
          'content-type': 'image/png',
        },
      }),
    ) as typeof fetch

    try {
      const toolCalls: PendingToolInvocation[] = [
        {
          id: 'call_3',
          name: 'fetch_url',
          args: {
            url: 'https://example.com/article',
            response_type: 'markdown',
          },
        },
      ]

      const { events, results } = await collectExecution(executeToolsGen(toolCalls))

      expect(events).toHaveLength(2)
      expect(events[1]).toEqual({
        type: 'tool_result',
        tool: 'fetch_url',
        result: expect.stringMatching(
          /^\{"type":"fetch_result","faviconDataUrl":"data:image\/png;base64,/,
        ),
        callId: 'call_3',
      })
      expect(results).toEqual([
        {
          id: 'call_3',
          name: 'fetch_url',
          result: 'Fetched markdown content',
        },
      ])
    } finally {
      global.fetch = originalFetch
    }
  })
})
