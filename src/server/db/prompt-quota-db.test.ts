import { describe, expect, it, vi } from 'vitest'
import {
  getOrCreateUserQuota,
  consumePromptQuotaOnAccept,
  redeemSingleUseCode,
  createRedeemCode,
  adminListRedeemCodes,
  updateRedeemCodeStatus,
} from './prompt-quota-db'

const createMockD1 = (overrides?: Partial<D1Database>) => {
  const mockRun = vi.fn()
  const mockFirst = vi.fn()
  const mockAll = vi.fn()
  const mockBatch = vi.fn()

  const prepare = vi.fn(() => ({
    bind: vi.fn(() => ({
      run: mockRun,
      first: mockFirst,
      all: mockAll,
    })),
  }))

  return {
    prepare,
    batch: mockBatch,
    mockRun,
    mockFirst,
    mockAll,
    mockBatch,
    ...overrides,
  } as unknown as D1Database & {
    mockRun: ReturnType<typeof vi.fn>
    mockFirst: ReturnType<typeof vi.fn>
    mockAll: ReturnType<typeof vi.fn>
    mockBatch: ReturnType<typeof vi.fn>
  }
}

describe('prompt-quota-db', () => {
  describe('getOrCreateUserQuota', () => {
    it('returns existing quota when row exists', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce({
        user_id: 'u1',
        balance: 50,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      })

      const result = await getOrCreateUserQuota(db, 'u1')

      expect(result).toEqual({
        user_id: 'u1',
        balance: 50,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      })
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT user_id, balance'),
      )
    })

    it('creates and returns new quota when no row exists', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce(undefined)

      const result = await getOrCreateUserQuota(db, 'u2')

      expect(result.balance).toBe(100)
      expect(result.user_id).toBe('u2')
      expect(db.prepare).toHaveBeenCalledTimes(2)
    })
  })

  describe('consumePromptQuotaOnAccept', () => {
    it('returns ok:true when consumption already exists (idempotent)', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce({ 1: 1 })

      const result = await consumePromptQuotaOnAccept(db, 'u1', 'req-1')

      expect(result).toEqual({ ok: true })
    })

    it('returns insufficient when balance is 0', async () => {
      const db = createMockD1()
      db.mockFirst
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ balance: 0 })

      const result = await consumePromptQuotaOnAccept(db, 'u1', 'req-1')

      expect(result).toEqual({ ok: false, reason: 'insufficient' })
    })

    it('returns insufficient when no quota row exists', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)

      const result = await consumePromptQuotaOnAccept(db, 'u1', 'req-1')

      expect(result).toEqual({ ok: false, reason: 'insufficient' })
    })

    it('returns ok:true and deducts when balance >= 1', async () => {
      const db = createMockD1()
      db.mockFirst
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ balance: 10 })
      db.mockBatch.mockResolvedValueOnce([
        { meta: { changes: 1 } },
        { meta: { changes: 1 } },
      ])

      const result = await consumePromptQuotaOnAccept(db, 'u1', 'req-1')

      expect(result).toEqual({ ok: true })
      expect(db.batch).toHaveBeenCalled()
    })
  })

  describe('redeemSingleUseCode', () => {
    it('returns invalid_code for empty code', async () => {
      const db = createMockD1()
      const result = await redeemSingleUseCode(db, 'u1', '   ')
      expect(result).toEqual({ ok: false, reason: 'invalid_code' })
    })

    it('returns invalid_code when code not found', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce(undefined)

      const result = await redeemSingleUseCode(db, 'u1', 'UNKNOWN')

      expect(result).toEqual({ ok: false, reason: 'invalid_code' })
    })

    it('returns already_used when code was used', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce({
        id: 'c1',
        code: 'USED',
        amount: 50,
        is_active: 1,
        used_at: '2024-01-01',
        expires_at: null,
      })

      const result = await redeemSingleUseCode(db, 'u1', 'USED')

      expect(result).toEqual({ ok: false, reason: 'already_used' })
    })

    it('returns inactive when code is inactive', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce({
        id: 'c1',
        code: 'INACTIVE',
        amount: 50,
        is_active: 0,
        used_at: null,
        expires_at: null,
      })

      const result = await redeemSingleUseCode(db, 'u1', 'INACTIVE')

      expect(result).toEqual({ ok: false, reason: 'inactive' })
    })
  })

  describe('createRedeemCode', () => {
    it('returns duplicate_code when code exists', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce({ 1: 1 })

      const result = await createRedeemCode(db, {
        code: 'EXISTING',
        amount: 50,
        createdByUserId: 'admin1',
      })

      expect(result).toEqual({ ok: false, reason: 'duplicate_code' })
    })

    it('returns ok with id when created successfully', async () => {
      const db = createMockD1()
      db.mockFirst.mockResolvedValueOnce(undefined)
      db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

      const result = await createRedeemCode(db, {
        code: 'NEWCODE',
        amount: 100,
        createdByUserId: 'admin1',
      })

      expect(result.ok).toBe(true)
      expect('id' in result && typeof result.id === 'string').toBe(true)
    })
  })

  describe('adminListRedeemCodes', () => {
    it('returns empty items when no codes', async () => {
      const db = createMockD1()
      db.mockAll.mockResolvedValueOnce({ results: [] })

      const result = await adminListRedeemCodes(db, { limit: 10, cursor: null })

      expect(result.items).toEqual([])
      expect(result.nextCursor).toBeNull()
    })

    it('returns items and nextCursor when has more', async () => {
      const db = createMockD1()
      db.mockAll.mockResolvedValueOnce({
        results: [
          {
            id: 'c1',
            code: 'CODE1',
            amount: 50,
            is_active: 1,
            used_at: null,
            used_by_user_id: null,
            created_by_user_id: 'a1',
            expires_at: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ],
      })

      const result = await adminListRedeemCodes(db, { limit: 1, cursor: null })

      expect(result.items).toHaveLength(1)
      expect(result.items[0].code).toBe('CODE1')
      expect(result.items[0].amount).toBe(50)
      expect(result.nextCursor).toEqual({
        created_at: '2024-01-01',
        id: 'c1',
      })
    })
  })

  describe('updateRedeemCodeStatus', () => {
    it('returns not_found when no rows updated', async () => {
      const db = createMockD1()
      db.mockRun.mockResolvedValueOnce({ meta: { changes: 0 } })

      const result = await updateRedeemCodeStatus(db, 'c1', false)

      expect(result).toEqual({ ok: false, reason: 'not_found' })
    })

    it('returns ok when updated', async () => {
      const db = createMockD1()
      db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

      const result = await updateRedeemCodeStatus(db, 'c1', false)

      expect(result).toEqual({ ok: true })
    })
  })
})
