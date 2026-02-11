export type ConversationCursor = {
  updated_at: string
  id: string
} | null

export type ConversationRecord = {
  id: string
  title: string | null
  currentPath: number[]
  messages: object[]
  created_at: string
  updated_at: string
}

export type ConversationPayload = {
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
  if (!isRecord(row) || typeof row.id !== 'string') {
    return null
  }

  const title = typeof row.title === 'string' || row.title === null ? row.title : null
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt
  const currentPathJson = typeof row.current_path_json === 'string' ? row.current_path_json : '[]'
  const messagesJson = typeof row.messages_json === 'string' ? row.messages_json : '[]'

  return {
    id: row.id,
    title,
    currentPath: safeParsePath(currentPathJson),
    messages: safeParseMessages(messagesJson),
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

const toConversationSummaryRecord = (row: unknown): ConversationRecord | null => {
  if (!isRecord(row) || typeof row.id !== 'string') {
    return null
  }

  const title = typeof row.title === 'string' || row.title === null ? row.title : null
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt

  return {
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
  input: { limit: number; cursor: ConversationCursor },
) => {
  const rows = input.cursor
    ? await db
        .prepare(
          `
          SELECT m.id, m.title, m.created_at, m.updated_at
          FROM conversation_metas m
          WHERE (m.updated_at < ?1) OR (m.updated_at = ?1 AND m.id < ?2)
          ORDER BY m.updated_at DESC, m.id DESC
          LIMIT ?3
          `,
        )
        .bind(input.cursor.updated_at, input.cursor.id, input.limit)
        .all()
    : await db
        .prepare(
          `
          SELECT m.id, m.title, m.created_at, m.updated_at
          FROM conversation_metas m
          ORDER BY m.updated_at DESC, m.id DESC
          LIMIT ?1
          `,
        )
        .bind(input.limit)
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

export const getConversationById = async (db: D1Database, id: string) => {
  const row = await db
    .prepare(
      `
      SELECT m.id, m.title, m.created_at, m.updated_at, b.current_path_json, b.messages_json
      FROM conversation_metas m
      JOIN conversation_bodies b ON b.id = m.id
      WHERE m.id = ?1
      LIMIT 1
      `,
    )
    .bind(id)
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
      INSERT INTO conversation_metas(id, title, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at
      `,
    ).bind(payload.id, payload.title, payload.created_at, payload.updated_at),
    db.prepare(
      `
      INSERT INTO conversation_bodies(id, current_path_json, messages_json)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(id) DO UPDATE SET
        current_path_json = excluded.current_path_json,
        messages_json = excluded.messages_json
      `,
    ).bind(
      payload.id,
      JSON.stringify(payload.currentPath ?? []),
      JSON.stringify(payload.messages ?? []),
    ),
  ])

  return { ok: true }
}

export const deleteConversationById = async (db: D1Database, id: string) => {
  await db.batch([
    db.prepare('DELETE FROM conversation_bodies WHERE id = ?1').bind(id),
    db.prepare('DELETE FROM conversation_metas WHERE id = ?1').bind(id),
  ])

  return { ok: true }
}

export const clearConversations = async (db: D1Database) => {
  await db.batch([
    db.prepare('DELETE FROM conversation_bodies'),
    db.prepare('DELETE FROM conversation_metas'),
  ])

  return { ok: true }
}

export const updateConversationTitle = async (
  db: D1Database,
  input: { id: string; title: string | null },
) => {
  const now = new Date().toISOString()

  await db.batch([
    db.prepare('UPDATE conversation_metas SET title = ?1, updated_at = ?2 WHERE id = ?3').bind(
      input.title,
      now,
      input.id,
    ),
  ])

  return { ok: true, updated_at: now }
}
