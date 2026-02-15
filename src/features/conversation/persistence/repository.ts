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

type ConversationPageResult = {
  items: ConversationDetail[]
  nextCursor: ConversationCursor
}

export const conversationRepository = {
  async get(id: string): Promise<ConversationDetail | undefined> {
    const record = await getConversationFn({ data: { id } })
    return (record as ConversationDetail) ?? undefined
  },

  async save(conversation: ConversationDetail): Promise<void> {
    await upsertConversationFn({
      data: {
        id: conversation.id,
        title: conversation.title,
        role: conversation.role ?? null,
        currentPath: conversation.currentPath,
        messages: conversation.messages as Array<Record<string, unknown>>,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
    })
  },

  async delete(id: string): Promise<void> {
    await deleteConversationFn({ data: { id } })
  },

  async clear(): Promise<void> {
    await clearConversationsFn()
  },

  async getUpdatedAtPage(params: {
    limit: number
    cursor: ConversationCursor
  }): Promise<ConversationPageResult> {
    return (await listConversationsPageFn({
      data: {
        limit: params.limit,
        cursor: params.cursor,
      },
    })) as ConversationPageResult
  },

  async updateTitle(id: string, title: string): Promise<void> {
    await updateConversationTitleFn({
      data: { id, title },
    })
  },
}
