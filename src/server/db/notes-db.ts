import type { Attachment } from '@/types/message'

export type NoteCursor = {
  updated_at: string
  id: string
} | null

export type NoteRecord = {
  user_id: string
  id: string
  content: string
  attachments: Attachment[]
  created_at: string
  updated_at: string
}

export type NotePayload = {
  user_id: string
  id: string
  content: string
  attachments: Attachment[]
  created_at: string
  updated_at: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isAttachment = (value: unknown): value is Attachment => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    value.kind === 'image' &&
    typeof value.name === 'string' &&
    typeof value.size === 'number' &&
    typeof value.mimeType === 'string' &&
    value.mimeType.startsWith('image/') &&
    typeof value.url === 'string' &&
    value.url.length > 0 &&
    (typeof value.storageKey === 'string' || typeof value.storageKey === 'undefined')
  )
}

const safeParseAttachments = (value: string): Attachment[] => {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is Attachment => isAttachment(item))
  } catch {
    return []
  }
}

const toNoteRecord = (row: unknown): NoteRecord | null => {
  if (
    !isRecord(row) ||
    typeof row.id !== 'string' ||
    typeof row.user_id !== 'string'
  ) {
    return null
  }

  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt
  const content = typeof row.content === 'string' ? row.content : ''
  const attachmentsJson = typeof row.attachments_json === 'string' ? row.attachments_json : '[]'

  return {
    user_id: row.user_id,
    id: row.id,
    content,
    attachments: safeParseAttachments(attachmentsJson),
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

export const listNotesPage = async (
  db: D1Database,
  input: { userId: string; limit: number; cursor: NoteCursor },
) => {
  const rows = input.cursor
    ? await db
        .prepare(
          `
          SELECT user_id, id, content, attachments_json, created_at, updated_at
          FROM notes
          WHERE user_id = ?1
            AND ((updated_at < ?2) OR (updated_at = ?2 AND id < ?3))
          ORDER BY updated_at DESC, id DESC
          LIMIT ?4
          `,
        )
        .bind(input.userId, input.cursor.updated_at, input.cursor.id, input.limit)
        .all()
    : await db
        .prepare(
          `
          SELECT user_id, id, content, attachments_json, created_at, updated_at
          FROM notes
          WHERE user_id = ?1
          ORDER BY updated_at DESC, id DESC
          LIMIT ?2
          `,
        )
        .bind(input.userId, input.limit)
        .all()

  const mapped = Array.isArray(rows.results)
    ? rows.results
        .map((row) => toNoteRecord(row))
        .filter((row): row is NoteRecord => !!row)
    : []

  const last = mapped.at(-1)
  const nextCursor: NoteCursor =
    mapped.length === input.limit && last
      ? { updated_at: last.updated_at, id: last.id }
      : null

  return {
    items: mapped,
    nextCursor,
  }
}

export const getNoteById = async (
  db: D1Database,
  id: string,
  userId: string,
) => {
  const row = await db
    .prepare(
      `
      SELECT user_id, id, content, attachments_json, created_at, updated_at
      FROM notes
      WHERE id = ?1 AND user_id = ?2
      LIMIT 1
      `,
    )
    .bind(id, userId)
    .first()

  return toNoteRecord(row)
}

export const upsertNote = async (
  db: D1Database,
  payload: NotePayload,
) => {
  await db
    .prepare(
      `
      INSERT INTO notes(user_id, id, content, attachments_json, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(user_id, id) DO UPDATE SET
        content = excluded.content,
        attachments_json = excluded.attachments_json,
        updated_at = excluded.updated_at
      `,
    )
    .bind(
      payload.user_id,
      payload.id,
      payload.content,
      JSON.stringify(payload.attachments ?? []),
      payload.created_at,
      payload.updated_at,
    )
    .run()

  return { ok: true }
}

export const deleteNoteById = async (
  db: D1Database,
  id: string,
  userId: string,
) => {
  await db
    .prepare('DELETE FROM notes WHERE user_id = ?1 AND id = ?2')
    .bind(userId, id)
    .run()

  return { ok: true }
}
