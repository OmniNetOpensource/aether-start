import { describe, expect, it, vi } from 'vitest'
import { listConversationsPage, setConversationPinned } from './conversations-db'

const createMockD1 = () => {
  const mockRun = vi.fn()
  const mockFirst = vi.fn()
  const mockAll = vi.fn()
  const bind = vi.fn(() => ({
    run: mockRun,
    first: mockFirst,
    all: mockAll,
  }))
  const prepare = vi.fn(() => ({ bind }))

  return {
    prepare,
    bind,
    mockRun,
    mockFirst,
    mockAll,
  } as unknown as D1Database & {
    prepare: ReturnType<typeof vi.fn>
    bind: ReturnType<typeof vi.fn>
    mockRun: ReturnType<typeof vi.fn>
    mockFirst: ReturnType<typeof vi.fn>
    mockAll: ReturnType<typeof vi.fn>
  }
}

describe('conversations-db pinning', () => {
  it('listConversationsPage returns pin-aware cursor and latestUpdatedRole on first page', async () => {
    const db = createMockD1()

    db.mockAll.mockResolvedValueOnce({
      results: [
        {
          user_id: 'u1',
          id: 'c-pinned',
          title: 'Pinned',
          role: 'role-pinned',
          is_pinned: 1,
          pinned_at: '2024-01-05T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-04T00:00:00.000Z',
        },
        {
          user_id: 'u1',
          id: 'c-history',
          title: 'History',
          role: 'role-history',
          is_pinned: 0,
          pinned_at: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-03T00:00:00.000Z',
        },
      ],
    })
    db.mockFirst.mockResolvedValueOnce({ role: 'role-latest-updated' })

    const result = await listConversationsPage(db, {
      userId: 'u1',
      limit: 2,
      cursor: null,
    })

    expect(result.items.map((item) => item.id)).toEqual(['c-pinned', 'c-history'])
    expect(result.nextCursor).toEqual({
      is_pinned: 0,
      sort_at: '2024-01-03T00:00:00.000Z',
      updated_at: '2024-01-03T00:00:00.000Z',
      id: 'c-history',
    })
    expect(result.latestUpdatedRole).toBe('role-latest-updated')
  })

  it('listConversationsPage skips latestUpdatedRole lookup when loading more', async () => {
    const db = createMockD1()

    db.mockAll.mockResolvedValueOnce({
      results: [
        {
          user_id: 'u1',
          id: 'c-1',
          title: 'History 1',
          role: 'role-history',
          is_pinned: 0,
          pinned_at: null,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ],
    })

    const result = await listConversationsPage(db, {
      userId: 'u1',
      limit: 1,
      cursor: {
        is_pinned: 0,
        sort_at: '2024-01-03T00:00:00.000Z',
        updated_at: '2024-01-03T00:00:00.000Z',
        id: 'c-2',
      },
    })

    expect(result.latestUpdatedRole).toBeNull()
    expect(db.mockFirst).not.toHaveBeenCalled()
  })

  it('setConversationPinned updates only pin fields and keeps updated_at untouched', async () => {
    const db = createMockD1()
    db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

    const result = await setConversationPinned(db, {
      userId: 'u1',
      id: 'c-1',
      pinned: true,
    })

    expect(result.ok).toBe(true)
    expect(result.pinned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const updateSql = String(db.prepare.mock.calls[0][0])
    expect(updateSql).toContain('SET is_pinned = ?1, pinned_at = ?2')
    expect(updateSql).not.toContain('updated_at')

    expect(db.bind.mock.calls[0][0]).toBe(1)
    expect(db.bind.mock.calls[0][1]).toBeTypeOf('string')
    expect(db.bind.mock.calls[0][2]).toBe('u1')
    expect(db.bind.mock.calls[0][3]).toBe('c-1')

    db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

    const unpinResult = await setConversationPinned(db, {
      userId: 'u1',
      id: 'c-1',
      pinned: false,
    })

    expect(unpinResult).toEqual({ ok: true, pinned_at: null })
    expect(db.bind.mock.calls[1]).toEqual([0, null, 'u1', 'c-1'])
  })
})
