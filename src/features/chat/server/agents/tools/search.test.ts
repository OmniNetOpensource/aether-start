import { describe, expect, it } from 'vitest'
import { beforeEach, afterEach, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({
  env: {},
}))

vi.mock('@/server/env', () => ({
  getServerEnv: () => ({}),
}))

import { formatSearchResponse } from './search'

type SearchFormatPayload = {
  client: {
    results: Array<{ title: string; url: string; faviconDataUrl?: string }>
  }
  ai: string
}

const parsePayload = (value: string) => JSON.parse(value) as SearchFormatPayload
const originalFetch = global.fetch

beforeEach(() => {
  global.fetch = vi.fn().mockRejectedValue(new Error('favicon unavailable')) as typeof fetch
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('formatSearchResponse', () => {
  it('keeps only title/url in client results and filters invalid entries', () => {
    return formatSearchResponse({
        organic: [
          {
            title: 'Example Result',
            link: 'https://example.com',
            snippet: 'Example snippet',
          },
          {
            title: 'Missing URL',
            snippet: 'Should be filtered',
          },
        ],
      }).then((raw) => {
        const payload = parsePayload(raw)

        expect(payload.client).toEqual({
          results: [{ title: 'Example Result', url: 'https://example.com' }],
        })
        expect(Object.keys(payload.client.results[0])).toEqual(['title', 'url'])
        expect(payload.client.results.every((item) => item.title && item.url)).toBe(true)
      })
  })

  it('falls back title to url when title is missing', () => {
    return formatSearchResponse({
        organic: [
          {
            title: '   ',
            link: 'https://fallback.example.com',
            snippet: 'Snippet',
          },
        ],
      }).then((raw) => {
        const payload = parsePayload(raw)

        expect(payload.client.results).toEqual([
          {
            title: 'https://fallback.example.com',
            url: 'https://fallback.example.com',
          },
        ])
        expect(payload.ai).toContain('[1]title: https://fallback.example.com')
      })
  })

  it('always outputs description line even when snippet is missing', () => {
    return formatSearchResponse({
        organic: [
          {
            title: 'No Snippet',
            link: 'https://nosnippet.example.com',
          },
        ],
      }).then((raw) => {
        const payload = parsePayload(raw)

        expect(payload.ai).toBe(
          '[1]title: No Snippet\n' +
          '[1]description: \n' +
          '[1]url: https://nosnippet.example.com',
        )
      })
  })

  it('returns fixed ai text when no valid entries exist', () => {
    return formatSearchResponse({
        organic: [
          { title: 'Missing URL only' },
          { snippet: 'Still missing URL' },
        ],
      }).then((raw) => {
        const payload = parsePayload(raw)

        expect(payload.client).toEqual({ results: [] })
        expect(payload.ai).toBe('No valid search results.')
      })
  })

  it('includes faviconDataUrl for client results when favicon fetch succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('icon', {
        headers: {
          'content-type': 'image/png',
        },
      }),
    ) as typeof fetch

    const payload = parsePayload(await formatSearchResponse({
      organic: [
        {
          title: 'Example Result',
          link: 'https://example.com',
          snippet: 'Example snippet',
        },
      ],
    }))

    expect(payload.client.results[0]).toMatchObject({
      title: 'Example Result',
      url: 'https://example.com',
    })
    expect(payload.client.results[0]?.faviconDataUrl).toMatch(/^data:image\/png;base64,/)
  })
})
