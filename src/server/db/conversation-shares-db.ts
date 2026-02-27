import type {
  ConversationShareStatus,
  SharedAttachmentSnapshot,
  SharedConversationSnapshot,
  SharedMessageBlock,
  SharedMessageSnapshot,
} from '@/types/share'
import type { ResearchItem } from '@/types/message'

type ConversationShareRecord = {
  user_id: string
  conversation_id: string
  share_token: string
  title: string | null
  snapshot: SharedConversationSnapshot
  is_active: boolean
  created_at: string
  updated_at: string
  revoked_at: string | null
}

const SHARE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/
const STORAGE_KEY_PREFIX = 'chat-assets/'
const ASSET_ROUTE_PREFIX = '/api/assets/'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const safeParseSnapshot = (value: string): SharedConversationSnapshot | null => {
  try {
    const parsed = JSON.parse(value)
    return toSharedConversationSnapshot(parsed)
  } catch {
    return null
  }
}

const toSharedMessageBlock = (value: unknown): SharedMessageBlock | null => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }

  if (value.type === 'content' && typeof value.content === 'string') {
    return { type: 'content', content: value.content }
  }

  if (value.type === 'error' && typeof value.message === 'string') {
    return { type: 'error', message: value.message }
  }

  if (value.type === 'research' && Array.isArray(value.items)) {
    return {
      type: 'research',
      items: value.items as ResearchItem[],
    }
  }

  if (value.type !== 'attachments' || !Array.isArray(value.attachments)) {
    return null
  }

  const attachments = value.attachments
    .map((attachment) => toSharedAttachment(attachment))
    .filter((attachment): attachment is SharedAttachmentSnapshot => attachment !== null)

  return { type: 'attachments', attachments }
}

const toSharedAttachment = (value: unknown): SharedAttachmentSnapshot | null => {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    value.kind !== 'image' ||
    typeof value.name !== 'string' ||
    typeof value.size !== 'number' ||
    typeof value.mimeType !== 'string' ||
    typeof value.url !== 'string'
  ) {
    return null
  }

  const storageKey = typeof value.storageKey === 'string' ? value.storageKey : undefined

  return {
    id: value.id,
    kind: 'image',
    name: value.name,
    size: value.size,
    mimeType: value.mimeType,
    url: value.url,
    storageKey,
  }
}

const toSharedMessageSnapshot = (value: unknown): SharedMessageSnapshot | null => {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'number' ||
    !Number.isInteger(value.id) ||
    value.id <= 0 ||
    (value.role !== 'user' && value.role !== 'assistant') ||
    typeof value.createdAt !== 'string' ||
    !Array.isArray(value.blocks)
  ) {
    return null
  }

  const blocks = value.blocks
    .map((block) => toSharedMessageBlock(block))
    .filter((block): block is SharedMessageBlock => block !== null)

  return {
    id: value.id,
    role: value.role,
    createdAt: value.createdAt,
    blocks,
  }
}

const toSharedConversationSnapshot = (value: unknown): SharedConversationSnapshot | null => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.messages)) {
    return null
  }

  const messages = value.messages
    .map((message) => toSharedMessageSnapshot(message))
    .filter((message): message is SharedMessageSnapshot => message !== null)

  return {
    version: 1,
    messages,
  }
}

const toConversationShareRecord = (row: unknown): ConversationShareRecord | null => {
  if (
    !isRecord(row) ||
    typeof row.user_id !== 'string' ||
    typeof row.conversation_id !== 'string' ||
    typeof row.share_token !== 'string'
  ) {
    return null
  }

  const snapshotJson = typeof row.snapshot_json === 'string' ? row.snapshot_json : ''
  const snapshot = safeParseSnapshot(snapshotJson)
  if (!snapshot) {
    return null
  }

  const title = typeof row.title === 'string' || row.title === null ? row.title : null
  const isActive = row.is_active === 1 || row.is_active === true
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt
  const revokedAt = typeof row.revoked_at === 'string' ? row.revoked_at : null

  return {
    user_id: row.user_id,
    conversation_id: row.conversation_id,
    share_token: row.share_token,
    title,
    snapshot,
    is_active: isActive,
    created_at: createdAt,
    updated_at: updatedAt,
    revoked_at: revokedAt,
  }
}

const generateShareToken = () => {
  const raw =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`

  return `s_${raw.slice(0, 40)}`
}

export const isSafeShareToken = (token: string) => SHARE_TOKEN_PATTERN.test(token)

export const isSafeStorageKey = (storageKey: string) =>
  storageKey.startsWith(STORAGE_KEY_PREFIX) && !storageKey.includes('..')

export const extractStorageKeyFromAssetUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url, 'https://aether.local')
    if (!parsed.pathname.startsWith(ASSET_ROUTE_PREFIX)) {
      return null
    }

    const encodedKey = parsed.pathname.slice(ASSET_ROUTE_PREFIX.length)
    const decodedKey = decodeURIComponent(encodedKey)
    return isSafeStorageKey(decodedKey) ? decodedKey : null
  } catch {
    return null
  }
}

export const resolveStorageKeyForSharedAttachment = (attachment: SharedAttachmentSnapshot) => {
  if (attachment.storageKey && isSafeStorageKey(attachment.storageKey)) {
    return attachment.storageKey
  }

  return extractStorageKeyFromAssetUrl(attachment.url)
}

export const getShareByConversation = async (
  db: D1Database,
  input: { userId: string; conversationId: string },
): Promise<{
  status: ConversationShareStatus
  token?: string
  title?: string | null
}> => {
  const row = await db
    .prepare(
      `
      SELECT user_id, conversation_id, share_token, title, snapshot_json, is_active, created_at, updated_at, revoked_at
      FROM conversation_shares
      WHERE user_id = ?1 AND conversation_id = ?2
      LIMIT 1
      `,
    )
    .bind(input.userId, input.conversationId)
    .first()

  const record = toConversationShareRecord(row)
  if (!record) {
    return { status: 'not_shared' }
  }

  return {
    status: record.is_active ? 'active' : 'revoked',
    token: record.share_token,
    title: record.title,
  }
}

export const upsertOrReactivateShare = async (
  db: D1Database,
  input: {
    userId: string
    conversationId: string
    title: string | null
    snapshot: SharedConversationSnapshot
  },
) => {
  const now = new Date().toISOString()
  const snapshotJson = JSON.stringify(input.snapshot)

  const existingRow = await db
    .prepare(
      `
      SELECT user_id, conversation_id, share_token, title, snapshot_json, is_active, created_at, updated_at, revoked_at
      FROM conversation_shares
      WHERE user_id = ?1 AND conversation_id = ?2
      LIMIT 1
      `,
    )
    .bind(input.userId, input.conversationId)
    .first()

  const existing = toConversationShareRecord(existingRow)
  if (existing) {
    await db
      .prepare(
        `
        UPDATE conversation_shares
        SET title = ?1,
            snapshot_json = ?2,
            is_active = 1,
            updated_at = ?3,
            revoked_at = NULL
        WHERE user_id = ?4 AND conversation_id = ?5
        `,
      )
      .bind(input.title, snapshotJson, now, input.userId, input.conversationId)
      .run()

    return {
      status: 'active' as const,
      token: existing.share_token,
      title: input.title,
    }
  }

  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shareToken = generateShareToken()
    if (!isSafeShareToken(shareToken)) {
      continue
    }

    try {
      await db
        .prepare(
          `
          INSERT INTO conversation_shares(
            user_id,
            conversation_id,
            share_token,
            title,
            snapshot_json,
            is_active,
            created_at,
            updated_at,
            revoked_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, NULL)
          `,
        )
        .bind(
          input.userId,
          input.conversationId,
          shareToken,
          input.title,
          snapshotJson,
          now,
          now,
        )
        .run()

      return {
        status: 'active' as const,
        token: shareToken,
        title: input.title,
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to create share token')
}

export const revokeShare = async (
  db: D1Database,
  input: { userId: string; conversationId: string },
) => {
  const existing = await getShareByConversation(db, input)
  if (existing.status === 'not_shared') {
    return {
      ok: true,
      status: 'not_shared' as const,
    }
  }

  const now = new Date().toISOString()
  await db
    .prepare(
      `
      UPDATE conversation_shares
      SET is_active = 0,
          revoked_at = ?1,
          updated_at = ?1
      WHERE user_id = ?2 AND conversation_id = ?3
      `,
    )
    .bind(now, input.userId, input.conversationId)
    .run()

  return {
    ok: true,
    status: 'revoked' as const,
    token: existing.token,
  }
}

export const getPublicShareByToken = async (
  db: D1Database,
  token: string,
): Promise<
  | {
      status: 'not_found'
    }
  | {
      status: 'revoked'
      token: string
      title: string | null
    }
  | {
      status: 'active'
      token: string
      title: string | null
      snapshotRaw: SharedConversationSnapshot
    }
> => {
  const row = await db
    .prepare(
      `
      SELECT user_id, conversation_id, share_token, title, snapshot_json, is_active, created_at, updated_at, revoked_at
      FROM conversation_shares
      WHERE share_token = ?1
      LIMIT 1
      `,
    )
    .bind(token)
    .first()

  const record = toConversationShareRecord(row)
  if (!record) {
    return { status: 'not_found' }
  }

  if (!record.is_active) {
    return {
      status: 'revoked',
      token: record.share_token,
      title: record.title,
    }
  }

  return {
    status: 'active',
    token: record.share_token,
    title: record.title,
    snapshotRaw: record.snapshot,
  }
}

export const findAttachmentInSnapshot = (
  snapshot: SharedConversationSnapshot,
  attachmentId: string,
) => {
  for (const message of snapshot.messages) {
    for (const block of message.blocks) {
      if (block.type !== 'attachments') {
        continue
      }

      const target = block.attachments.find((attachment) => attachment.id === attachmentId)
      if (target) {
        return target
      }
    }
  }

  return null
}
