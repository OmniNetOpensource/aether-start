import { describe, expect, it } from 'vitest'
import { formatToolContinuation, type ThinkingBlockData } from './anthropic'
import type { PendingToolInvocation, ToolInvocationResult } from '@/types/chat-api'

describe('formatToolContinuation', () => {
  const thinkingBlocks: ThinkingBlockData[] = []
  const pendingToolCalls: PendingToolInvocation[] = [
    {
      id: 'toolu_test',
      name: 'fetch_url',
      args: {
        url: 'https://example.com/image.png',
        response_type: 'image',
      },
    },
  ]

  it('formats supported image tool results as Anthropic image blocks', () => {
    const toolResults: ToolInvocationResult[] = [
      {
        id: 'toolu_test',
        name: 'fetch_url',
        result: JSON.stringify({
          type: 'image',
          data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
          mime_type: 'image/png',
          size_bytes: 123,
        }),
      },
    ]

    const messages = formatToolContinuation(
      '',
      thinkingBlocks,
      pendingToolCalls,
      toolResults,
    )

    expect(messages[1]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_test',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
              },
            },
          ],
        },
      ],
    })
  })

  it('marks unsupported image tool results as errors instead of sending invalid image blocks', () => {
    const toolResults: ToolInvocationResult[] = [
      {
        id: 'toolu_test',
        name: 'fetch_url',
        result: JSON.stringify({
          type: 'image',
          data_url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          mime_type: 'image/svg+xml',
          size_bytes: 123,
        }),
      },
    ]

    const messages = formatToolContinuation(
      '',
      thinkingBlocks,
      pendingToolCalls,
      toolResults,
    )

    expect(messages[1]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_test',
          is_error: true,
          content:
            'Unsupported image format for Anthropic tool_result: image/svg+xml. ' +
            'Anthropic supports image/jpeg, image/png, image/gif, and image/webp.',
        },
      ],
    })
  })
})
