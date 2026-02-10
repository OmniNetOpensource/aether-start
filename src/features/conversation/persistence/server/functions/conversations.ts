import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getServerBindings } from '@/server/env'

const cursorSchema = z
  .object({
    updated_at: z.string(),
    id: z.string(),
  })
  .nullable()

type ConversationCursor = z.infer<typeof cursorSchema>

type ConversationRecord = {
  id: string
  title: string | null
  currentPath: number[]
  messages: object[]
  created_at: string
  updated_at: string
}

const conversationPayloadSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  currentPath: z.array(z.number().int()),
  messages: z.array(z.record(z.any())),
  created_at: z.string(),
  updated_at: z.string(),
})

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

export const listConversationsPageFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      limit: z.number().int().positive().max(100),
      cursor: cursorSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()

    const rows = data.cursor
      ? await DB.prepare(
          `
          SELECT m.id, m.title, m.created_at, m.updated_at
          FROM conversation_metas m
          WHERE (m.updated_at < ?1) OR (m.updated_at = ?1 AND m.id < ?2)
          ORDER BY m.updated_at DESC, m.id DESC
          LIMIT ?3
          `,
        )
          .bind(data.cursor.updated_at, data.cursor.id, data.limit)
          .all()
      : await DB.prepare(
          `
          SELECT m.id, m.title, m.created_at, m.updated_at
          FROM conversation_metas m
          ORDER BY m.updated_at DESC, m.id DESC
          LIMIT ?1
          `,
        )
          .bind(data.limit)
          .all()

    const mapped = Array.isArray(rows.results)
      ? rows.results
          .map((row) => toConversationSummaryRecord(row))
          .filter((row): row is ConversationRecord => !!row)
      : []

    const last = mapped.at(-1)
    const nextCursor: ConversationCursor =
      mapped.length === data.limit && last
        ? { updated_at: last.updated_at, id: last.id }
        : null

    return {
      items: mapped,
      nextCursor,
    }
  })

export const getConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()

    const row = await DB.prepare(
      `
      SELECT m.id, m.title, m.created_at, m.updated_at, b.current_path_json, b.messages_json
      FROM conversation_metas m
      JOIN conversation_bodies b ON b.id = m.id
      WHERE m.id = ?1
      LIMIT 1
      `,
    )
      .bind(data.id)
      .first()

    return toConversationRecord(row)
  })

export const upsertConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(conversationPayloadSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()

    await DB.batch([
      DB.prepare(
        `
        INSERT INTO conversation_metas(id, title, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          updated_at = excluded.updated_at
        `,
      ).bind(data.id, data.title, data.created_at, data.updated_at),
      DB.prepare(
        `
        INSERT INTO conversation_bodies(id, current_path_json, messages_json, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET
          current_path_json = excluded.current_path_json,
          messages_json = excluded.messages_json,
          updated_at = excluded.updated_at
        `,
      ).bind(
        data.id,
        JSON.stringify(data.currentPath ?? []),
        JSON.stringify(data.messages ?? []),
        data.updated_at,
      ),
    ])

    return { ok: true }
  })

export const deleteConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()

    await DB.batch([
      DB.prepare('DELETE FROM conversation_bodies WHERE id = ?1').bind(data.id),
      DB.prepare('DELETE FROM conversation_metas WHERE id = ?1').bind(data.id),
    ])

    return { ok: true }
  })

export const clearConversationsFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { DB } = getServerBindings()

  await DB.batch([
    DB.prepare('DELETE FROM conversation_bodies'),
    DB.prepare('DELETE FROM conversation_metas'),
  ])

  return { ok: true }
})

export const updateConversationTitleFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
      title: z.string().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()

    const now = new Date().toISOString()

    await DB.batch([
      DB.prepare('UPDATE conversation_metas SET title = ?1, updated_at = ?2 WHERE id = ?3').bind(
        data.title,
        now,
        data.id,
      ),
      DB.prepare('UPDATE conversation_bodies SET updated_at = ?1 WHERE id = ?2').bind(now, data.id),
    ])

    return { ok: true, updated_at: now }
  })
