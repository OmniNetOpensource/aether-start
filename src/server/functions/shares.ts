import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getServerBindings } from '@/server/env'
import { requireSession } from '@/server/functions/auth/session'
import {
  getShareByConversation,
  getPublicShareByToken,
  isSafeShareToken,
  revokeShare,
  resolveStorageKeyForSharedAttachment,
  upsertOrReactivateShare,
} from '@/server/db/conversation-shares-db'
import { getConversationById } from '@/server/db/conversations-db'
import type {
  SharedAttachmentSnapshot,
  SharedConversationSnapshot,
  SharedMessageBlock,
} from '@/types/share'

const shareTokenSchema = z.string().min(1).max(128)

const createShareSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().nullable(),
})

const conversationIdSchema = z.object({
  conversationId: z.string().min(1),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const sanitizeSharedAttachment = (value: unknown): SharedAttachmentSnapshot | null => {
  if (!isRecord(value)) {
    return null
  }

  const size = value.size
  if (
    typeof value.id !== 'string' ||
    value.kind !== 'image' ||
    typeof value.name !== 'string' ||
    typeof size !== 'number' ||
    !Number.isFinite(size) ||
    size < 0 ||
    typeof value.mimeType !== 'string' ||
    typeof value.url !== 'string'
  ) {
    return null
  }

  const attachment: SharedAttachmentSnapshot = {
    id: value.id,
    kind: 'image',
    name: value.name,
    size,
    mimeType: value.mimeType,
    url: value.url,
    ...(typeof value.storageKey === 'string' ? { storageKey: value.storageKey } : {}),
  }

  const storageKey = resolveStorageKeyForSharedAttachment(attachment)
  if (!storageKey) {
    return null
  }

  return {
    ...attachment,
    storageKey,
    // Ensure stored URL points to an allowlisted internal asset route.
    url: `/api/assets/${encodeURIComponent(storageKey)}`,
  }
}

const toSharedMessageBlock = (
  value: unknown,
  role: 'user' | 'assistant',
): SharedMessageBlock | null => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }

  if (value.type === 'content' && typeof value.content === 'string') {
    return { type: 'content', content: value.content }
  }

  if (role === 'assistant' && value.type === 'error' && typeof value.message === 'string') {
    return { type: 'error', message: value.message }
  }

  if (role === 'assistant' && value.type === 'research' && Array.isArray(value.items)) {
    return {
      type: 'research',
      // Stored blocks are produced by trusted server code paths; preserve shape.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: value.items as any,
    }
  }

  if (role === 'user' && value.type === 'attachments' && Array.isArray(value.attachments)) {
    const attachments = value.attachments
      .map((attachment) => sanitizeSharedAttachment(attachment))
      .filter((attachment): attachment is SharedAttachmentSnapshot => attachment !== null)

    if (attachments.length === 0) {
      return null
    }

    return { type: 'attachments', attachments }
  }

  return null
}

const toSharedMessageSnapshot = (
  value: unknown,
): SharedConversationSnapshot['messages'][number] | null => {
  const role = isRecord(value) ? value.role : null

  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !Number.isInteger(value.id) ||
    value.id <= 0 ||
    (role !== 'user' && role !== 'assistant') ||
    !Array.isArray(value.blocks)
  ) {
    return null
  }

  const blocks = value.blocks
    .map((block) => toSharedMessageBlock(block, role))
    .filter((block): block is SharedMessageBlock => block !== null)

  if (blocks.length === 0) {
    return null
  }

  return {
    id: value.id,
    role,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    blocks,
  }
}

const buildSnapshotFromConversation = (
  conversation: Exclude<Awaited<ReturnType<typeof getConversationById>>, null>,
): SharedConversationSnapshot => {
  const messagesById = new Map<number, unknown>()
  for (const message of conversation.messages) {
    if (!isRecord(message) || typeof message.id !== 'number') {
      continue
    }
    messagesById.set(message.id, message)
  }

  const currentPathMessages = conversation.currentPath
    .map((messageId) => messagesById.get(messageId))
    .filter((message): message is unknown => message !== undefined)

  const sourceMessages = currentPathMessages.length > 0
    ? currentPathMessages
    : conversation.messages

  return {
    version: 1,
    messages: sourceMessages
      .map((message) => toSharedMessageSnapshot(message))
      .filter((message): message is SharedConversationSnapshot['messages'][number] => message !== null),
  }
}

const buildPublicSnapshot = (
  token: string,
  snapshot: SharedConversationSnapshot,
): SharedConversationSnapshot => {
  return {
    version: 1,
    messages: snapshot.messages.map((message) => ({
      id: message.id,
      role: message.role,
      createdAt: message.createdAt,
      blocks: message.blocks.map((block) => {
        if (block.type !== 'attachments') {
          return block
        }

        return {
          type: 'attachments' as const,
          attachments: block.attachments.map((attachment) => {
            const storageKey = resolveStorageKeyForSharedAttachment(attachment)
            const publicUrl = storageKey
              ? `/api/share-assets/${encodeURIComponent(token)}/${encodeURIComponent(attachment.id)}`
              : attachment.url

            return {
              id: attachment.id,
              kind: attachment.kind,
              name: attachment.name,
              size: attachment.size,
              mimeType: attachment.mimeType,
              url: publicUrl,
            }
          }),
        }
      }),
    })),
  }
}

export const getConversationShareFn = createServerFn({ method: 'POST' })
  .inputValidator(conversationIdSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return getShareByConversation(DB, {
      userId: session.user.id,
      conversationId: data.conversationId,
    })
  })

export const createConversationShareFn = createServerFn({ method: 'POST' })
  .inputValidator(createShareSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    const conversation = await getConversationById(DB, data.conversationId, session.user.id)
    if (!conversation) {
      throw new Error('Conversation not found')
    }

    const snapshot = buildSnapshotFromConversation(conversation)
    if (snapshot.messages.length === 0) {
      throw new Error('No messages to share')
    }

    const title = data.title ?? conversation.title ?? null

    return upsertOrReactivateShare(DB, {
      userId: session.user.id,
      conversationId: data.conversationId,
      title,
      snapshot,
    })
  })

export const revokeConversationShareFn = createServerFn({ method: 'POST' })
  .inputValidator(conversationIdSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return revokeShare(DB, {
      userId: session.user.id,
      conversationId: data.conversationId,
    })
  })

export const getPublicConversationShareFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      token: shareTokenSchema,
    }),
  )
  .handler(async ({ data }) => {
    if (!isSafeShareToken(data.token)) {
      return { status: 'not_found' as const }
    }

    const { DB } = getServerBindings()
    const result = await getPublicShareByToken(DB, data.token)

    if (result.status === 'not_found' || result.status === 'revoked') {
      return result
    }

    return {
      status: 'active' as const,
      token: result.token,
      title: result.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildPublicSnapshot output matches PublicShareView structurally
      snapshot: buildPublicSnapshot(result.token, result.snapshotRaw) as any,
    }
  })
