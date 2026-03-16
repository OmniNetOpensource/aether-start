import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({}),
}))

vi.mock('@/components/sidebar/Sidebar', () => ({
  default: () => null,
}))

vi.mock('@/server/functions/auth/session-state', () => ({
  getSessionStateFn: vi.fn(),
}))

import { getNormalizedAppTarget } from './route'

describe('getNormalizedAppTarget', () => {
  it('preserves the bare /app path without adding a trailing slash', () => {
    expect(
      getNormalizedAppTarget({
        pathname: '/app',
        searchStr: '',
        hash: '',
      }),
    ).toBe('/app')
  })

  it('preserves search params and hash fragments on /app', () => {
    expect(
      getNormalizedAppTarget({
        pathname: '/app',
        searchStr: '?q=test',
        hash: 'section-1',
      }),
    ).toBe('/app?q=test#section-1')
  })

  it('keeps nested app routes relative for auth redirects', () => {
    expect(
      getNormalizedAppTarget({
        pathname: '/app/notes',
        searchStr: '?tab=recent',
        hash: 'top',
      }),
    ).toBe('/app/notes?tab=recent#top')
  })
})
