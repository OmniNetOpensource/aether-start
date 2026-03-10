import { describe, expect, it, vi } from 'vitest'
import {
  getPublicShareByToken,
  getShareByConversation,
  revokeShare,
  upsertOrReactivateShare,
} from './conversation-shares-db'
import type { SharedConversationSnapshot } from '@/types/share'

const createMockD1 = () => {
  const mockRun = vi.fn()
  const mockFirst = vi.fn()

  const prepare = vi.fn(() => ({
    bind: vi.fn(() => ({
      run: mockRun,
      first: mockFirst,
    })),
  }))

  return {
    prepare,
    mockRun,
    mockFirst,
  } as unknown as D1Database & {
    mockRun: ReturnType<typeof vi.fn>
    mockFirst: ReturnType<typeof vi.fn>
  }
}

const snapshot: SharedConversationSnapshot = {
  version: 1,
  messages: [
    {
      id: 1,
      role: 'user',
      createdAt: '2024-01-01T00:00:00.000Z',
      blocks: [{ type: 'content', content: 'hello' }],
    },
  ],
}

const row = (overrides?: Partial<Record<string, unknown>>) => ({
  user_id: 'u1',
  conversation_id: 'c1',
  share_token: 's_token_1',
  title: 'demo',
  snapshot_json: JSON.stringify(snapshot),
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  revoked_at: null,
  ...overrides,
})

describe('conversation-shares-db', () => {
  it('creates share on first enable', async () => {
    const db = createMockD1()
    db.mockFirst.mockResolvedValueOnce(undefined)
    db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

    const result = await upsertOrReactivateShare(db, {
      userId: 'u1',
      conversationId: 'c1',
      title: 'demo',
      snapshot,
    })

    expect(result.status).toBe('active')
    expect(result.token.startsWith('s_')).toBe(true)
  })

  it('reuses token on repeated enable and refreshes snapshot', async () => {
    const db = createMockD1()
    db.mockFirst.mockResolvedValueOnce(row({ share_token: 's_reuse_me', is_active: 1 }))
    db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

    const result = await upsertOrReactivateShare(db, {
      userId: 'u1',
      conversationId: 'c1',
      title: 'demo',
      snapshot,
    })

    expect(result).toEqual({
      status: 'active',
      token: 's_reuse_me',
      title: 'demo',
    })
  })

  it('returns revoked status after revoke', async () => {
    const db = createMockD1()
    db.mockFirst.mockResolvedValueOnce(row({ is_active: 1 }))
    db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

    const revokeResult = await revokeShare(db, {
      userId: 'u1',
      conversationId: 'c1',
    })

    expect(revokeResult.ok).toBe(true)
    expect(revokeResult.status).toBe('revoked')
    expect(revokeResult.token).toBe('s_token_1')
  })

  it('reactivates revoked share with same token', async () => {
    const db = createMockD1()
    db.mockFirst.mockResolvedValueOnce(row({ share_token: 's_same_token', is_active: 0 }))
    db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

    const result = await upsertOrReactivateShare(db, {
      userId: 'u1',
      conversationId: 'c1',
      title: 'demo',
      snapshot,
    })

    expect(result.token).toBe('s_same_token')
    expect(result.status).toBe('active')
  })

  it('returns public view status for active/revoked/not_found', async () => {
    const db = createMockD1()

    db.mockFirst.mockResolvedValueOnce(undefined)
    const missing = await getPublicShareByToken(db, 's_not_found')
    expect(missing).toEqual({ status: 'not_found' })

    db.mockFirst.mockResolvedValueOnce(row({ is_active: 0 }))
    const revoked = await getPublicShareByToken(db, 's_revoked')
    expect(revoked).toEqual({
      status: 'revoked',
      token: 's_token_1',
      title: 'demo',
    })

    db.mockFirst.mockResolvedValueOnce(row({ is_active: 1, share_token: 's_active' }))
    const active = await getPublicShareByToken(db, 's_active')
    expect(active.status).toBe('active')
    if (active.status === 'active') {
      expect(active.token).toBe('s_active')
      expect(active.snapshotRaw.version).toBe(1)
    }
  })

  it('returns not_shared when no share exists for conversation', async () => {
    const db = createMockD1()
    db.mockFirst.mockResolvedValueOnce(undefined)

    const result = await getShareByConversation(db, {
      userId: 'u1',
      conversationId: 'c_missing',
    })

    expect(result).toEqual({ status: 'not_shared' })
  })
})
