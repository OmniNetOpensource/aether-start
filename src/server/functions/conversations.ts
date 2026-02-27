import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '@/server/functions/auth/session'
import { getServerBindings } from '@/server/env'
import {
  clearConversations,
  deleteConversationById,
  getConversationById,
  listConversationsPage,
  setConversationPinned,
  searchConversations,
  updateConversationTitle,
  upsertConversation,
} from '@/server/db/conversations-db'

const listCursorSchema = z
  .object({
    is_pinned: z.union([z.literal(0), z.literal(1)]),
    sort_at: z.string(),
    updated_at: z.string(),
    id: z.string(),
  })
  .nullable()

const searchCursorSchema = z
  .object({
    updated_at: z.string(),
    id: z.string(),
  })
  .nullable()

export type ConversationListCursor = {
  is_pinned: 0 | 1
  sort_at: string
  updated_at: string
  id: string
} | null

export type ConversationSearchCursor = { updated_at: string; id: string } | null

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
      cursor: listCursorSchema,
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
      cursor: searchCursorSchema,
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

export const setConversationPinnedFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
      pinned: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return setConversationPinned(DB, {
      userId: session.user.id,
      id: data.id,
      pinned: data.pinned,
    })
  })
