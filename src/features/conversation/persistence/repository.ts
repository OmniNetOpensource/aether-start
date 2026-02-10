import { ConvexHttpClient } from 'convex/browser'
import type { LocalConversation } from '@/features/conversation/model/types/conversation'
import { api } from '../../../../convex/_generated/api'

export type ConversationCursor = { updated_at: string; id: string } | null

type ConversationPageParams = {
  limit: number
  cursor: ConversationCursor
}

type ConversationPageResult = {
  items: LocalConversation[]
  nextCursor: ConversationCursor
}

type ConversationRepository = {
  getAll: () => Promise<LocalConversation[]>
  get: (id: string) => Promise<LocalConversation | undefined>
  save: (conversation: LocalConversation) => Promise<void>
  delete: (id: string) => Promise<void>
  clear: () => Promise<void>
  getUpdatedAtPage: (params: ConversationPageParams) => Promise<ConversationPageResult>
  updateTitle: (id: string, title: string) => Promise<void>
}

export const CONVEX_WORKSPACE_ID = 'global'

const DEFAULT_PAGE_LIMIT = 100

const convexUrl =
  typeof import.meta.env.VITE_CONVEX_URL === 'string' &&
  import.meta.env.VITE_CONVEX_URL.trim().length > 0
    ? import.meta.env.VITE_CONVEX_URL.trim()
    : typeof import.meta.env.NEXT_PUBLIC_CONVEX_URL === 'string' &&
      import.meta.env.NEXT_PUBLIC_CONVEX_URL.trim().length > 0
    ? import.meta.env.NEXT_PUBLIC_CONVEX_URL.trim()
    : ''

export const isConvexConfigured = convexUrl.length > 0

let convexClient: ConvexHttpClient | null = null

const getConvexClient = () => {
  if (convexClient) {
    return convexClient
  }

  if (!isConvexConfigured) {
    throw new Error('Convex is not configured. Set VITE_CONVEX_URL or NEXT_PUBLIC_CONVEX_URL.')
  }

  convexClient = new ConvexHttpClient(convexUrl)
  return convexClient
}

const compareUpdatedAtDesc = (
  a: { updated_at: string; id: string },
  b: { updated_at: string; id: string }
) => {
  const updatedAt = b.updated_at.localeCompare(a.updated_at)
  if (updatedAt !== 0) {
    return updatedAt
  }
  return b.id.localeCompare(a.id)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isCursor = (value: unknown): value is Exclude<ConversationCursor, null> =>
  isRecord(value) && typeof value.updated_at === 'string' && typeof value.id === 'string'

const mapConvexConversation = (value: unknown): LocalConversation | null => {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const title = typeof value.title === 'string' || value.title === null ? value.title : null
  const currentPath = Array.isArray(value.currentPath)
    ? value.currentPath.filter((item): item is number => typeof item === 'number')
    : []
  const messages = Array.isArray(value.messages)
    ? (value.messages as LocalConversation['messages'])
    : []
  const created_at =
    typeof value.created_at === 'string' ? value.created_at : new Date().toISOString()
  const updated_at =
    typeof value.updated_at === 'string' ? value.updated_at : created_at

  return {
    id: value.id,
    title,
    currentPath,
    messages,
    created_at,
    updated_at,
  }
}

const mapConversationArray = (value: unknown): LocalConversation[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((record) => mapConvexConversation(record))
    .filter((record): record is LocalConversation => !!record)
}

const toConvexPayload = (conversation: LocalConversation) => ({
  workspaceId: CONVEX_WORKSPACE_ID,
  conversationId: conversation.id,
  title: conversation.title,
  currentPath: conversation.currentPath,
  messages: conversation.messages,
  created_at: conversation.created_at,
  updated_at: conversation.updated_at,
})

const queryConversationPage = async (
  client: ConvexHttpClient,
  params: ConversationPageParams
): Promise<ConversationPageResult> => {
  const result = await client.query(api.conversations.listConversationsPage, {
    workspaceId: CONVEX_WORKSPACE_ID,
    limit: params.limit,
    cursor: params.cursor,
  })

  if (!isRecord(result)) {
    return { items: [], nextCursor: null }
  }

  return {
    items: mapConversationArray(result.items),
    nextCursor: isCursor(result.nextCursor) ? result.nextCursor : null,
  }
}

const convexRepository: ConversationRepository = {
  async getAll() {
    const client = getConvexClient()
    const all: LocalConversation[] = []
    let cursor: ConversationCursor = null

    while (true) {
      const page = await queryConversationPage(client, {
        limit: DEFAULT_PAGE_LIMIT,
        cursor,
      })

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
    const client = getConvexClient()
    const record = await client.query(api.conversations.getConversation, {
      workspaceId: CONVEX_WORKSPACE_ID,
      conversationId: id,
    })
    const mapped = mapConvexConversation(record)
    return mapped ?? undefined
  },

  async save(conversation) {
    const client = getConvexClient()
    await client.mutation(api.conversations.upsertConversation, toConvexPayload(conversation))
  },

  async delete(id) {
    const client = getConvexClient()
    await client.mutation(api.conversations.deleteConversation, {
      workspaceId: CONVEX_WORKSPACE_ID,
      conversationId: id,
    })
  },

  async clear() {
    const client = getConvexClient()
    await client.mutation(api.conversations.clearConversations, {
      workspaceId: CONVEX_WORKSPACE_ID,
    })
  },

  async getUpdatedAtPage(params) {
    const client = getConvexClient()
    return queryConversationPage(client, params)
  },

  async updateTitle(id, title) {
    const client = getConvexClient()
    await client.mutation(api.conversations.updateConversationTitle, {
      workspaceId: CONVEX_WORKSPACE_ID,
      conversationId: id,
      title,
    })
  },
}

export const conversationRepository: ConversationRepository = convexRepository
