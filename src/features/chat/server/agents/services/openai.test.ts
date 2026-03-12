import { describe, expect, it } from 'vitest'
import { formatOpenAIToolContinuation } from './openai'

describe('formatOpenAIToolContinuation', () => {
  it('adds a native image message when a tool result contains an image data URL', () => {
    const continuation = formatOpenAIToolContinuation(
      'tool call incoming',
      [
        {
          id: 'call_1',
          name: 'fetch_url',
          args: { url: 'https://example.com/image.png' },
        },
      ],
      [
        {
          id: 'call_1',
          name: 'fetch_url',
          result: JSON.stringify({
            type: 'image',
            data_url: 'data:image/png;base64,abc123',
            mime_type: 'image/png',
            size_bytes: 123,
          }),
        },
      ],
    )

    expect(continuation).toEqual([
      {
        role: 'assistant',
        content: 'tool call incoming',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'fetch_url',
              arguments: '{"url":"https://example.com/image.png"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content:
          '{"type":"image","data_url":"data:image/png;base64,abc123","mime_type":"image/png","size_bytes":123}',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Image returned by tool fetch_url. Use it when answering.',
          },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,abc123',
            },
          },
        ],
      },
    ])
  })
})
