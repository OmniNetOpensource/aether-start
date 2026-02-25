import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '@/features/auth/server/session'
import { getServerBindings } from '@/server/env'
import {
  clearConversations,
  deleteConversationById,
  getConversationById,
  listConversationsPage,
  searchConversations,
  updateConversationTitle,
  upsertConversation,
} from '@/features/conversation/persistence/server/services/conversations-db'

const cursorSchema = z
  .object({
    updated_at: z.string(),
    id: z.string(),
  })
  .nullable()

const conversationPayloadSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  role: z.string().nullable().optional(),
  currentPath: z.array(z.number().int()),
  messages: z.array(z.record(z.any())),
  created_at: z.string(),
  updated_at: z.string(),
})

export const listConversationsPageFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      limit: z.number().int().positive().max(100),
      cursor: cursorSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return listConversationsPage(DB, {
      userId: session.user.id,
      limit: data.limit,
      cursor: data.cursor,
    })
  })

export const searchConversationsFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().positive().max(50),
      cursor: cursorSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return searchConversations(DB, {
      userId: session.user.id,
      query: data.query,
      limit: data.limit,
      cursor: data.cursor,
    })
  })

export const getConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return getConversationById(DB, data.id, session.user.id)
  })

export const upsertConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(conversationPayloadSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return upsertConversation(DB, {
      ...data,
      user_id: session.user.id,
    })
  })

export const deleteConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return deleteConversationById(DB, data.id, session.user.id)
  })

export const clearConversationsFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { DB } = getServerBindings()
  const session = await requireSession()

  return clearConversations(DB, session.user.id)
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
    const session = await requireSession()

    return updateConversationTitle(DB, {
      userId: session.user.id,
      id: data.id,
      title: data.title,
    })
  })
