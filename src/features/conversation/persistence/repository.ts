import type { ConversationDetail } from '@/features/conversation/model/types/conversation'
import {
  clearConversationsFn,
  deleteConversationFn,
  getConversationFn,
  listConversationsPageFn,
  updateConversationTitleFn,
  upsertConversationFn,
} from '@/features/conversation/persistence/server/functions/conversations'

export type ConversationCursor = { updated_at: string; id: string } | null

type ConversationPageParams = {
  limit: number
  cursor: ConversationCursor
}

type ConversationPageResult = {
  items: ConversationDetail[]
  nextCursor: ConversationCursor
}

type ConversationRepository = {
  getAll: () => Promise<ConversationDetail[]>
  get: (id: string) => Promise<ConversationDetail | undefined>
  save: (conversation: ConversationDetail) => Promise<void>
  delete: (id: string) => Promise<void>
  clear: () => Promise<void>
  getUpdatedAtPage: (params: ConversationPageParams) => Promise<ConversationPageResult>
  updateTitle: (id: string, title: string) => Promise<void>
}

const DEFAULT_PAGE_LIMIT = 100

const compareUpdatedAtDesc = (
  a: { updated_at: string; id: string },
  b: { updated_at: string; id: string },
) => {
  const updatedAt = b.updated_at.localeCompare(a.updated_at)
  if (updatedAt !== 0) {
    return updatedAt
  }
  return b.id.localeCompare(a.id)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const toConversationDetail = (value: unknown): ConversationDetail | null => {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const title = typeof value.title === 'string' || value.title === null ? value.title : null
  const currentPath = Array.isArray(value.currentPath)
    ? value.currentPath.filter((item): item is number => typeof item === 'number')
    : []
  const messages = Array.isArray(value.messages)
    ? (value.messages as ConversationDetail['messages'])
    : []
  const created_at =
    typeof value.created_at === 'string' ? value.created_at : new Date().toISOString()
  const updated_at = typeof value.updated_at === 'string' ? value.updated_at : created_at

  return {
    id: value.id,
    title,
    currentPath,
    messages,
    created_at,
    updated_at,
  }
}

const toPageResult = (value: unknown): ConversationPageResult => {
  if (!isRecord(value)) {
    return { items: [], nextCursor: null }
  }

  const items = Array.isArray(value.items)
    ? value.items
        .map((item) => toConversationDetail(item))
        .filter((item): item is ConversationDetail => !!item)
    : []

  const nextCursor =
    isRecord(value.nextCursor) &&
    typeof value.nextCursor.updated_at === 'string' &&
    typeof value.nextCursor.id === 'string'
      ? {
          updated_at: value.nextCursor.updated_at,
          id: value.nextCursor.id,
        }
      : null

  return {
    items,
    nextCursor,
  }
}

const d1Repository: ConversationRepository = {
  async getAll() {
    const all: ConversationDetail[] = []
    let cursor: ConversationCursor = null

    while (true) {
      const page = toPageResult(
        await listConversationsPageFn({
          data: {
            limit: DEFAULT_PAGE_LIMIT,
            cursor,
          },
        }),
      )

      all.push(...page.items)

      if (!page.nextCursor) {
        break
      }

      if (
        cursor &&
        page.nextCursor.updated_at === cursor.updated_at &&
        page.nextCursor.id === cursor.id
      ) {
        break
      }

      cursor = page.nextCursor
    }

    return all.sort(compareUpdatedAtDesc)
  },

  async get(id) {
    const record = toConversationDetail(await getConversationFn({ data: { id } }))
    return record ?? undefined
  },

  async save(conversation) {
    await upsertConversationFn({
      data: {
        id: conversation.id,
        title: conversation.title,
        currentPath: conversation.currentPath,
        messages: conversation.messages as Array<Record<string, unknown>>,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
    })
  },

  async delete(id) {
    await deleteConversationFn({ data: { id } })
  },

  async clear() {
    await clearConversationsFn()
  },

  async getUpdatedAtPage(params) {
    return toPageResult(
      await listConversationsPageFn({
        data: {
          limit: params.limit,
          cursor: params.cursor,
        },
      }),
    )
  },

  async updateTitle(id, title) {
    await updateConversationTitleFn({
      data: {
        id,
        title,
      },
    })
  },
}

export const conversationRepository: ConversationRepository = d1Repository
