import { describe, expect, it } from 'vitest'
import type { SerializedMessage } from '@/types/message'
import {
  parseFetchClientPayload,
  parseSearchClientPayload,
  stripTransientFetchClientPayload,
  stripTransientSearchClientPayload,
  stripTransientSearchDataFromMessages,
} from './search-result-payload'

describe('search-result-payload', () => {
  it('parses search client payloads with title/url only', () => {
    const parsed = parseSearchClientPayload(
      JSON.stringify({
        results: [
          {
            title: 'Example',
            url: 'https://example.com',
          },
        ],
      }),
    )

    expect(parsed).toEqual({
      results: [
        {
          title: 'Example',
          url: 'https://example.com',
        },
      ],
    })
  })

  it('strips faviconDataUrl from persisted search payloads', () => {
    const stripped = stripTransientSearchClientPayload(
      JSON.stringify({
        results: [
          {
            title: 'Example',
            url: 'https://example.com',
            faviconDataUrl: 'data:image/png;base64,abc123',
          },
        ],
      }),
    )

    expect(stripped).toBe('{"results":[{"title":"Example","url":"https://example.com"}]}')
  })

  it('parses fetch client payloads without favicon data', () => {
    const parsed = parseFetchClientPayload(
      JSON.stringify({
        type: 'fetch_result',
      }),
    )

    expect(parsed).toEqual({
      type: 'fetch_result',
    })
  })

  it('strips faviconDataUrl from persisted fetch payloads', () => {
    expect(
      stripTransientFetchClientPayload(
        JSON.stringify({
          type: 'fetch_result',
          faviconDataUrl: 'data:image/png;base64,abc123',
        }),
      ),
    ).toBe('{"type":"fetch_result"}')

    expect(
      stripTransientFetchClientPayload(
        JSON.stringify({
          type: 'image',
          data_url: 'data:image/png;base64,xyz',
          faviconDataUrl: 'data:image/png;base64,abc123',
        }),
      ),
    ).toBe('{"type":"image","data_url":"data:image/png;base64,xyz"}')
  })

  it('removes transient favicon data from search research items only', () => {
    const messages: SerializedMessage[] = [
      {
        role: 'assistant',
        blocks: [
          {
            type: 'research',
            items: [
              {
                kind: 'tool',
                data: {
                  call: {
                    tool: 'search',
                    args: { query: 'example' },
                  },
                  result: {
                    result: JSON.stringify({
                      results: [
                        {
                          title: 'Example',
                          url: 'https://example.com',
                          faviconDataUrl: 'data:image/png;base64,abc123',
                        },
                      ],
                    }),
                  },
                },
              },
              {
                kind: 'tool',
                data: {
                  call: {
                    tool: 'fetch_url',
                    args: { url: 'https://example.com' },
                  },
                  result: {
                    result: JSON.stringify({
                      type: 'image',
                      data_url: 'data:image/png;base64,xyz',
                      faviconDataUrl: 'data:image/png;base64,abc123',
                    }),
                  },
                },
              },
            ],
          },
        ],
      },
    ]

    const sanitized = stripTransientSearchDataFromMessages(messages)
    const researchBlock = sanitized[0]?.blocks[0]

    expect(researchBlock).toMatchObject({
      type: 'research',
    })

    if (researchBlock?.type !== 'research') {
      throw new Error('Expected research block')
    }

    const [searchItem, fetchItem] = researchBlock.items
    expect(searchItem).toMatchObject({
      kind: 'tool',
      data: {
        call: {
          tool: 'search',
        },
        result: {
          result: '{"results":[{"title":"Example","url":"https://example.com"}]}',
        },
      },
    })
    expect(fetchItem).toMatchObject({
      kind: 'tool',
      data: {
        call: {
          tool: 'fetch_url',
        },
        result: {
          result: JSON.stringify({
            type: 'image',
            data_url: 'data:image/png;base64,xyz',
          }),
        },
      },
    })
  })
})
