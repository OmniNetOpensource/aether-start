import { describe, expect, it } from 'vitest'
import { parseSearchClientPayload, stringifyFetchClientPayload } from './search-result-payload'

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

  it('stringifies fetch client payload', () => {
    expect(stringifyFetchClientPayload({ type: 'fetch_result' })).toBe(
      '{"type":"fetch_result"}',
    )
  })
})
