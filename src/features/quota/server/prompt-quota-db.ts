const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export type UserQuotaRecord = {
  user_id: string
  balance: number
  created_at: string
  updated_at: string
}

export type RedeemCodeRecord = {
  id: string
  code: string
  amount: number
  is_active: boolean
  used_at: string | null
  used_by_user_id: string | null
  created_by_user_id: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

const toUserQuotaRecord = (row: unknown): UserQuotaRecord | null => {
  if (!isRecord(row) || typeof row.user_id !== 'string') {
    return null
  }
  const balance = typeof row.balance === 'number' ? row.balance : 0
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt
  return {
    user_id: row.user_id,
    balance,
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

const toRedeemCodeRecord = (row: unknown): RedeemCodeRecord | null => {
  if (!isRecord(row) || typeof row.id !== 'string' || typeof row.code !== 'string') {
    return null
  }
  const amount = typeof row.amount === 'number' ? row.amount : 0
  const isActive = row.is_active === 1 || row.is_active === true
  const usedAt = typeof row.used_at === 'string' ? row.used_at : null
  const usedByUserId = typeof row.used_by_user_id === 'string' ? row.used_by_user_id : null
  const createdByUserId = typeof row.created_by_user_id === 'string' ? row.created_by_user_id : null
  const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : null
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt
  return {
    id: row.id,
    code: row.code,
    amount,
    is_active: isActive,
    used_at: usedAt,
    used_by_user_id: usedByUserId,
    created_by_user_id: createdByUserId,
    expires_at: expiresAt,
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`

export const getOrCreateUserQuota = async (
  db: D1Database,
  userId: string,
): Promise<UserQuotaRecord> => {
  const row = await db
    .prepare('SELECT user_id, balance, created_at, updated_at FROM user_prompt_quota WHERE user_id = ?1')
    .bind(userId)
    .first()

  const existing = toUserQuotaRecord(row)
  if (existing) {
    return existing
  }

  const now = new Date().toISOString()
  await db
    .prepare(
      'INSERT INTO user_prompt_quota (user_id, balance, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)',
    )
    .bind(userId, 100, now, now)
    .run()

  return {
    user_id: userId,
    balance: 100,
    created_at: now,
    updated_at: now,
  }
}

export type ConsumeResult =
  | { ok: true }
  | { ok: false; reason: 'insufficient' }
  | { ok: false; reason: 'error'; message: string }

export const consumePromptQuotaOnAccept = async (
  db: D1Database,
  userId: string,
  requestId: string,
): Promise<ConsumeResult> => {
  const consumptionId = generateId()

  try {
    const existing = await db
      .prepare(
        'SELECT 1 FROM prompt_quota_consumptions WHERE user_id = ?1 AND request_id = ?2 LIMIT 1',
      )
      .bind(userId, requestId)
      .first()

    if (existing) {
      return { ok: true }
    }

    const quotaRow = await db
      .prepare('SELECT balance FROM user_prompt_quota WHERE user_id = ?1')
      .bind(userId)
      .first()

    const balance = isRecord(quotaRow) && typeof quotaRow.balance === 'number' ? quotaRow.balance : 0
    if (balance < 1) {
      return { ok: false, reason: 'insufficient' }
    }

    const results = await db.batch([
      db
        .prepare(
          'INSERT INTO prompt_quota_consumptions (id, user_id, request_id) VALUES (?1, ?2, ?3)',
        )
        .bind(consumptionId, userId, requestId),
      db
        .prepare(
          'UPDATE user_prompt_quota SET balance = balance - 1, updated_at = ?1 WHERE user_id = ?2 AND balance >= 1',
        )
        .bind(new Date().toISOString(), userId),
    ])

    const updateResult = results[1]
    const meta = updateResult?.meta as { changes?: number } | undefined
    const changes = typeof meta?.changes === 'number' ? meta.changes : 0

    if (changes === 0) {
      await db
        .prepare('DELETE FROM prompt_quota_consumptions WHERE user_id = ?1 AND request_id = ?2')
        .bind(userId, requestId)
        .run()
      return { ok: false, reason: 'insufficient' }
    }

    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'error', message }
  }
}

export type RedeemResult =
  | { ok: true; added: number }
  | { ok: false; reason: 'invalid_code' | 'already_used' | 'expired' | 'inactive' | 'error'; message?: string }

export const redeemSingleUseCode = async (
  db: D1Database,
  userId: string,
  code: string,
): Promise<RedeemResult> => {
  const normalizedCode = code.trim().toUpperCase()
  if (!normalizedCode) {
    return { ok: false, reason: 'invalid_code' }
  }

  try {
    const codeRow = await db
      .prepare(
        'SELECT id, code, amount, is_active, used_at, expires_at FROM redeem_codes WHERE code = ?1 LIMIT 1',
      )
      .bind(normalizedCode)
      .first()

    if (!isRecord(codeRow)) {
      return { ok: false, reason: 'invalid_code' }
    }

    const isActive = codeRow.is_active === 1 || codeRow.is_active === true
    if (!isActive) {
      return { ok: false, reason: 'inactive' }
    }

    const usedAt = codeRow.used_at
    if (usedAt != null && String(usedAt).length > 0) {
      return { ok: false, reason: 'already_used' }
    }

    const expiresAt = codeRow.expires_at
    if (expiresAt != null && String(expiresAt).length > 0) {
      const exp = new Date(String(expiresAt)).getTime()
      if (Number.isFinite(exp) && Date.now() > exp) {
        return { ok: false, reason: 'expired' }
      }
    }

    const amount = typeof codeRow.amount === 'number' ? Math.max(0, codeRow.amount) : 0
    if (amount <= 0) {
      return { ok: false, reason: 'invalid_code' }
    }

    const codeId = String(codeRow.id)
    const now = new Date().toISOString()
    const redemptionId = generateId()

    await getOrCreateUserQuota(db, userId)

    const batchResults = await db.batch([
      db
        .prepare(
          `UPDATE redeem_codes SET
            is_active = 0,
            used_at = ?1,
            used_by_user_id = ?2,
            updated_at = ?1
          WHERE id = ?3 AND is_active = 1 AND used_at IS NULL`,
        )
        .bind(now, userId, codeId),
      db
        .prepare(
          'UPDATE user_prompt_quota SET balance = balance + ?1, updated_at = ?2 WHERE user_id = ?3',
        )
        .bind(amount, now, userId),
      db
        .prepare(
          'INSERT INTO redeem_code_redemptions (id, redeem_code_id, user_id, amount) VALUES (?1, ?2, ?3, ?4)',
        )
        .bind(redemptionId, codeId, userId, amount),
    ])

    const updateCodeMeta = batchResults[0]?.meta as { changes?: number } | undefined
    const changes = typeof updateCodeMeta?.changes === 'number' ? updateCodeMeta.changes : 0
    if (changes === 0) {
      return { ok: false, reason: 'already_used' }
    }
    return { ok: true, added: amount }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'error', message }
  }
}

export type CreateRedeemCodeInput = {
  code: string
  amount: number
  expiresAt?: string | null
  createdByUserId: string
}

export const createRedeemCode = async (
  db: D1Database,
  input: CreateRedeemCodeInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: 'duplicate_code' | 'error'; message?: string }> => {
  const normalizedCode = input.code.trim().toUpperCase()
  if (!normalizedCode) {
    return { ok: false, reason: 'error', message: 'Code cannot be empty' }
  }

  const amount = Math.max(1, Math.floor(input.amount))
  const now = new Date().toISOString()
  const id = generateId()

  try {
    const existing = await db
      .prepare('SELECT 1 FROM redeem_codes WHERE code = ?1 LIMIT 1')
      .bind(normalizedCode)
      .first()

    if (existing) {
      return { ok: false, reason: 'duplicate_code' }
    }

    await db
      .prepare(
        `INSERT INTO redeem_codes (id, code, amount, is_active, created_by_user_id, expires_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?6)`,
      )
      .bind(
        id,
        normalizedCode,
        amount,
        input.createdByUserId,
        input.expiresAt ?? null,
        now,
      )
      .run()

    return { ok: true, id }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'error', message }
  }
}

export type RedeemCodeCursor = { created_at: string; id: string } | null

export const adminListRedeemCodes = async (
  db: D1Database,
  input: { limit: number; cursor: RedeemCodeCursor },
): Promise<{ items: RedeemCodeRecord[]; nextCursor: RedeemCodeCursor }> => {
  const rows = input.cursor
    ? await db
        .prepare(
          `SELECT id, code, amount, is_active, used_at, used_by_user_id, created_by_user_id, expires_at, created_at, updated_at
           FROM redeem_codes
           WHERE (created_at < ?1) OR (created_at = ?1 AND id < ?2)
           ORDER BY created_at DESC, id DESC
           LIMIT ?3`,
        )
        .bind(input.cursor.created_at, input.cursor.id, input.limit)
        .all()
    : await db
        .prepare(
          `SELECT id, code, amount, is_active, used_at, used_by_user_id, created_by_user_id, expires_at, created_at, updated_at
           FROM redeem_codes
           ORDER BY created_at DESC, id DESC
           LIMIT ?1`,
        )
        .bind(input.limit)
        .all()

  const results = Array.isArray(rows.results)
    ? rows.results.map(toRedeemCodeRecord).filter((r): r is RedeemCodeRecord => !!r)
    : []

  const last = results.at(-1)
  const nextCursor: RedeemCodeCursor =
    results.length === input.limit && last
      ? { created_at: last.created_at, id: last.id }
      : null

  return { items: results, nextCursor }
}

export const updateRedeemCodeStatus = async (
  db: D1Database,
  codeId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'error'; message?: string }> => {
  try {
    const result = await db
      .prepare(
        'UPDATE redeem_codes SET is_active = ?1, updated_at = ?2 WHERE id = ?3 AND used_at IS NULL',
      )
      .bind(isActive ? 1 : 0, new Date().toISOString(), codeId)
      .run()

    const meta = result?.meta as { changes?: number } | undefined
    const changes = typeof meta?.changes === 'number' ? meta.changes : 0
    if (changes === 0) {
      return { ok: false, reason: 'not_found' }
    }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'error', message }
  }
}
