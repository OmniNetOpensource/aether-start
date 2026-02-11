import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getServerBindings } from '@/server/env'
import {
  clearConversations,
  deleteConversationById,
  getConversationById,
  listConversationsPage,
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

    return listConversationsPage(DB, {
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

    return getConversationById(DB, data.id)
  })

export const upsertConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(conversationPayloadSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()

    return upsertConversation(DB, data)
  })

export const deleteConversationFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()

    return deleteConversationById(DB, data.id)
  })

export const clearConversationsFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { DB } = getServerBindings()

  return clearConversations(DB)
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

    return updateConversationTitle(DB, {
      id: data.id,
      title: data.title,
    })
  })
