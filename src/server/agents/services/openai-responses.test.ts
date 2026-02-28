import { beforeEach, describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import type { ChatTool } from '@/server/agents/tools/types'
import type { SerializedMessage } from '@/types/message'

const { resolveAttachmentToBase64Mock, getOpenAIClientMock } = vi.hoisted(() => ({
  resolveAttachmentToBase64Mock: vi.fn(),
  getOpenAIClientMock: vi.fn(),
}))

vi.mock('./attachment-utils', () => ({
  resolveAttachmentToBase64: resolveAttachmentToBase64Mock,
}))

vi.mock('./openai', () => ({
  getOpenAIClient: getOpenAIClientMock,
}))

vi.mock('@/server/agents/services/chat-config', () => ({
  buildSystemPrompt: () => 'BASE_SYSTEM_PROMPT',
}))

import {
  convertToOpenAIResponsesMessages,
  formatOpenAIResponsesToolContinuation,
  OpenAIResponsesChatProvider,
} from './openai-responses'

const sampleTools: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch URL content',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
        },
        required: ['url'],
      },
    },
  },
]

const createStream = (events: OpenAI.Responses.ResponseStreamEvent[]) => {
  return (async function* () {
    for (const event of events) {
      yield event
    }
  })()
}

describe('openai-responses provider', () => {
  beforeEach(() => {
    resolveAttachmentToBase64Mock.mockReset()
    getOpenAIClientMock.mockReset()
  })

  it('converts text and image attachments to responses input messages', async () => {
    resolveAttachmentToBase64Mock.mockResolvedValueOnce({
      media_type: 'image/png',
      data: 'abc123',
    })

    const history: SerializedMessage[] = [
      {
        role: 'user',
        blocks: [
          { type: 'content', content: 'hello' },
          {
            type: 'attachments',
            attachments: [
              {
                id: 'a1',
                kind: 'image',
                name: 'photo.png',
                size: 123,
                mimeType: 'image/png',
                url: 'https://example.com/photo.png',
              },
            ],
          },
        ],
      },
      {
        role: 'assistant',
        blocks: [{ type: 'content', content: 'roger' }],
      },
    ]

    const converted = await convertToOpenAIResponsesMessages(history)

    expect(converted).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'hello' },
          {
            type: 'input_image',
            detail: 'auto',
            image_url: 'data:image/png;base64,abc123',
          },
        ],
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'roger',
      },
    ])
  })

  it('formats assistant text, function_call and function_call_output in order', () => {
    const continuation = formatOpenAIResponsesToolContinuation(
      'tool call incoming',
      [
        {
          id: 'call_1',
          name: 'fetch_url',
          args: { url: 'https://example.com' },
        },
      ],
      [
        {
          id: 'call_1',
          name: 'fetch_url',
          result: '{"ok":true}',
        },
      ],
    )

    expect(continuation).toEqual([
      {
        type: 'message',
        role: 'assistant',
        content: 'tool call incoming',
      },
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'fetch_url',
        arguments: '{"url":"https://example.com"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"ok":true}',
      },
    ])
  })

  it('streams content and thinking, then returns parsed pending tool calls', async () => {
    const streamEvents: OpenAI.Responses.ResponseStreamEvent[] = [
      {
        type: 'response.output_text.delta',
        delta: 'Hello ',
        content_index: 0,
        item_id: 'msg_1',
        output_index: 0,
        sequence_number: 1,
        logprobs: [],
      } as OpenAI.Responses.ResponseStreamEvent,
      {
        type: 'response.reasoning_text.delta',
        delta: 'Need to call fetch tool.',
        content_index: 0,
        item_id: 'reason_1',
        output_index: 1,
        sequence_number: 2,
      } as OpenAI.Responses.ResponseStreamEvent,
      {
        type: 'response.reasoning_summary_text.delta',
        delta: 'Summarizing plan.',
        item_id: 'reason_1',
        output_index: 1,
        sequence_number: 3,
        summary_index: 0,
      } as OpenAI.Responses.ResponseStreamEvent,
      {
        type: 'response.output_item.added',
        output_index: 2,
        sequence_number: 4,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_123',
          name: 'fetch_url',
          arguments: '',
        },
      } as OpenAI.Responses.ResponseStreamEvent,
      {
        type: 'response.function_call_arguments.delta',
        delta: '{"url":"https://example',
        item_id: 'fc_1',
        output_index: 2,
        sequence_number: 5,
      } as OpenAI.Responses.ResponseStreamEvent,
      {
        type: 'response.function_call_arguments.done',
        arguments: '{"url":"https://example.com"}',
        item_id: 'fc_1',
        output_index: 2,
        sequence_number: 6,
      } as OpenAI.Responses.ResponseStreamEvent,
      {
        type: 'response.output_item.done',
        output_index: 2,
        sequence_number: 7,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_123',
          name: 'fetch_url',
          arguments: '{"url":"https://example.com"}',
        },
      } as OpenAI.Responses.ResponseStreamEvent,
    ]

    const createMock = vi.fn().mockResolvedValue(createStream(streamEvents))
    getOpenAIClientMock.mockReturnValue({
      responses: {
        create: createMock,
      },
    })

    const provider = new OpenAIResponsesChatProvider({
      model: 'gpt-4o',
      backendConfig: {
        apiKey: 'test',
        baseURL: 'https://api.example.com/v1',
        defaultHeaders: {},
      },
      tools: sampleTools,
      systemPrompt: 'You are a test assistant',
    })

    const emitted: Array<{ type: string; content?: string; message?: string }> = []
    const generator = provider.run([])
    let runResult = { pendingToolCalls: [], thinkingBlocks: [] } as {
      pendingToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>
      thinkingBlocks: unknown[]
    }

    while (true) {
      const chunk = await generator.next()
      if (chunk.done) {
        runResult = chunk.value
        break
      }
      emitted.push(chunk.value)
    }

    expect(createMock).toHaveBeenCalledTimes(1)
    const [requestParams] = createMock.mock.calls[0] as [OpenAI.Responses.ResponseCreateParamsStreaming]
    expect(requestParams.model).toBe('gpt-4o')
    expect(requestParams.stream).toBe(true)
    expect(requestParams.tools).toHaveLength(1)
    expect(requestParams.instructions).toContain('BASE_SYSTEM_PROMPT')

    expect(emitted).toEqual([
      { type: 'content', content: 'Hello ' },
      { type: 'thinking', content: 'Need to call fetch tool.' },
      { type: 'thinking', content: 'Summarizing plan.' },
    ])

    expect(runResult.pendingToolCalls).toEqual([
      {
        id: 'call_123',
        name: 'fetch_url',
        args: { url: 'https://example.com' },
      },
    ])
  })
})
