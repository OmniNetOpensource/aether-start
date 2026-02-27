import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '@/server/functions/auth/session'
import { getServerBindings } from '@/server/env'
import {
  deleteNoteById,
  listNotesPage,
  type NoteCursor,
  upsertNote,
} from '@/server/db/notes-db'

const cursorSchema = z
  .object({
    updated_at: z.string(),
    id: z.string(),
  })
  .nullable()

const attachmentSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('image'),
  name: z.string().min(1),
  size: z.number().nonnegative(),
  mimeType: z.string().min(1),
  url: z.string().min(1),
  storageKey: z.string().optional(),
})

const notePayloadSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  attachments: z.array(attachmentSchema),
  created_at: z.string(),
  updated_at: z.string(),
})

export type NotesCursor = NoteCursor

export const listNotesPageFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      limit: z.number().int().positive().max(100),
      cursor: cursorSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return listNotesPage(DB, {
      userId: session.user.id,
      limit: data.limit,
      cursor: data.cursor,
    })
  })

export const upsertNoteFn = createServerFn({ method: 'POST' })
  .inputValidator(notePayloadSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return upsertNote(DB, {
      ...data,
      user_id: session.user.id,
    })
  })

export const deleteNoteFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return deleteNoteById(DB, data.id, session.user.id)
  })
