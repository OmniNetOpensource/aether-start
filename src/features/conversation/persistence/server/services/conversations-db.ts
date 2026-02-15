export type ConversationCursor = {
  updated_at: string
  id: string
} | null

export type ConversationRecord = {
  user_id: string
  id: string
  title: string | null
  currentPath: number[]
  messages: object[]
  created_at: string
  updated_at: string
}

export type ConversationPayload = {
  user_id: string
  id: string
  title: string | null
  currentPath: number[]
  messages: object[]
  created_at: string
  updated_at: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const safeParsePath = (value: string): number[] => {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is number => typeof item === 'number')
  } catch {
    return []
  }
}

const safeParseMessages = (value: string): object[] => {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is object => typeof item === 'object' && item !== null)
  } catch {
    return []
  }
}

const toConversationRecord = (row: unknown): ConversationRecord | null => {
  if (
    !isRecord(row) ||
    typeof row.id !== 'string' ||
    typeof row.user_id !== 'string'
  ) {
    return null
  }

  const title = typeof row.title === 'string' || row.title === null ? row.title : null
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt
  const currentPathJson = typeof row.current_path_json === 'string' ? row.current_path_json : '[]'
  const messagesJson = typeof row.messages_json === 'string' ? row.messages_json : '[]'

  return {
    user_id: row.user_id,
    id: row.id,
    title,
    currentPath: safeParsePath(currentPathJson),
    messages: safeParseMessages(messagesJson),
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

const toConversationSummaryRecord = (row: unknown): ConversationRecord | null => {
  if (
    !isRecord(row) ||
    typeof row.id !== 'string' ||
    typeof row.user_id !== 'string'
  ) {
    return null
  }

  const title = typeof row.title === 'string' || row.title === null ? row.title : null
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt

  return {
    user_id: row.user_id,
    id: row.id,
    title,
    currentPath: [],
    messages: [],
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

export const listConversationsPage = async (
  db: D1Database,
  input: { userId: string; limit: number; cursor: ConversationCursor },
) => {
  const rows = input.cursor
    ? await db
        .prepare(
          `
          SELECT m.user_id, m.id, m.title, m.created_at, m.updated_at
          FROM conversation_metas m
          WHERE m.user_id = ?1
            AND ((m.updated_at < ?2) OR (m.updated_at = ?2 AND m.id < ?3))
          ORDER BY m.updated_at DESC, m.id DESC
          LIMIT ?4
          `,
        )
        .bind(input.userId, input.cursor.updated_at, input.cursor.id, input.limit)
        .all()
    : await db
        .prepare(
          `
          SELECT m.user_id, m.id, m.title, m.created_at, m.updated_at
          FROM conversation_metas m
          WHERE m.user_id = ?1
          ORDER BY m.updated_at DESC, m.id DESC
          LIMIT ?2
          `,
        )
        .bind(input.userId, input.limit)
        .all()

  const mapped = Array.isArray(rows.results)
    ? rows.results
        .map((row) => toConversationSummaryRecord(row))
        .filter((row): row is ConversationRecord => !!row)
    : []

  const last = mapped.at(-1)
  const nextCursor: ConversationCursor =
    mapped.length === input.limit && last
      ? { updated_at: last.updated_at, id: last.id }
      : null

  return {
    items: mapped,
    nextCursor,
  }
}

export const getConversationById = async (
  db: D1Database,
  id: string,
  userId: string,
) => {
  const row = await db
    .prepare(
      `
      SELECT m.user_id, m.id, m.title, m.created_at, m.updated_at, b.current_path_json, b.messages_json
      FROM conversation_metas m
      JOIN conversation_bodies b ON b.user_id = m.user_id AND b.id = m.id
      WHERE m.id = ?1 AND m.user_id = ?2
      LIMIT 1
      `,
    )
    .bind(id, userId)
    .first()

  return toConversationRecord(row)
}

export const upsertConversation = async (
  db: D1Database,
  payload: ConversationPayload,
) => {
  await db.batch([
    db.prepare(
      `
      INSERT INTO conversation_metas(user_id, id, title, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(user_id, id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at
      `,
    ).bind(payload.user_id, payload.id, payload.title, payload.created_at, payload.updated_at),
    db.prepare(
      `
      INSERT INTO conversation_bodies(user_id, id, current_path_json, messages_json)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(user_id, id) DO UPDATE SET
        current_path_json = excluded.current_path_json,
        messages_json = excluded.messages_json
      `,
    ).bind(
      payload.user_id,
      payload.id,
      JSON.stringify(payload.currentPath ?? []),
      JSON.stringify(payload.messages ?? []),
    ),
  ])

  return { ok: true }
}

export const deleteConversationById = async (
  db: D1Database,
  id: string,
  userId: string,
) => {
  await db.batch([
    db.prepare('DELETE FROM conversation_bodies WHERE user_id = ?1 AND id = ?2').bind(
      userId,
      id,
    ),
    db.prepare('DELETE FROM conversation_metas WHERE user_id = ?1 AND id = ?2').bind(
      userId,
      id,
    ),
  ])

  return { ok: true }
}

export const clearConversations = async (db: D1Database, userId: string) => {
  await db.batch([
    db.prepare('DELETE FROM conversation_bodies WHERE user_id = ?1').bind(userId),
    db.prepare('DELETE FROM conversation_metas WHERE user_id = ?1').bind(userId),
  ])

  return { ok: true }
}

export const updateConversationTitle = async (
  db: D1Database,
  input: { userId: string; id: string; title: string | null },
) => {
  const now = new Date().toISOString()

  await db.batch([
    db
      .prepare(
        'UPDATE conversation_metas SET title = ?1, updated_at = ?2 WHERE user_id = ?3 AND id = ?4',
      )
      .bind(input.title, now, input.userId, input.id),
  ])

  return { ok: true, updated_at: now }
}
