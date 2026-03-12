import { describe, expect, it } from 'vitest'
import { formatGeminiToolContinuation } from './gemini'

describe('formatGeminiToolContinuation', () => {
  it('adds inlineData to function responses when a tool result contains an image data URL', () => {
    const continuation = formatGeminiToolContinuation(
      '',
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

    expect(continuation[1]).toMatchObject({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call_1',
            name: 'fetch_url',
            response: {
              output: {
                type: 'image',
                mime_type: 'image/png',
              },
            },
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'abc123',
                },
              },
            ],
          },
        },
      ],
    })
  })
})
