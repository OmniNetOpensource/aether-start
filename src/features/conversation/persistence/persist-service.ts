import { conversationRepository } from '@/features/conversation/persistence/repository'
import { useConversationsStore } from '@/features/conversation/persistence/store/useConversationsStore'
import { buildConversationTitle } from '@/features/conversation/formatting/format'
import {
  cloneMessages,
  extractContentFromBlocks,
} from '@/features/conversation/model/tree/block-operations'
import { computeMessagesFromPath } from '@/features/conversation/model/tree/message-tree'
import type {
  ConversationDetail,
  ConversationMeta,
} from '@/features/conversation/model/types/conversation'
import type { Message, MessageLike } from '@/features/conversation/model/types/message'

const DEFAULT_CONVERSATION_TITLE = 'New Chat'
const PERSIST_THROTTLE_MS = 2000

// --- Signature dedup ---

const persistSignatures = new Map<string, string>()

const buildPersistSignature = (conversation: ConversationDetail) => {
  const lastMessage = conversation.messages[conversation.messages.length - 1]
  const lastMessageContent = lastMessage
    ? extractContentFromBlocks(lastMessage.blocks).slice(0, 120)
    : ''

  return [
    conversation.id,
    conversation.messages.length,
    conversation.currentPath.join(','),
    conversation.title ?? '',
    lastMessage?.role ?? '',
    lastMessageContent,
  ].join('|')
}

// --- Throttled queue ---

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
const persistQueue = new Map<string, ConversationDetail>()
const persistInFlight = new Map<string, Promise<void>>()

const flushQueued = (conversationId: string): Promise<void> => {
  const currentInFlight = persistInFlight.get(conversationId)
  if (currentInFlight) {
    return currentInFlight
  }

  const payload = persistQueue.get(conversationId)
  if (!payload) {
    return Promise.resolve()
  }

  persistQueue.delete(conversationId)

  const timer = persistTimers.get(conversationId)
  if (timer) {
    clearTimeout(timer)
    persistTimers.delete(conversationId)
  }

  const task = conversationRepository
    .save(payload)
    .then(() => {
      persistSignatures.set(conversationId, buildPersistSignature(payload))
    })
    .catch((error) => {
      console.error('Failed to persist conversation:', error)
    })
    .finally(() => {
      persistInFlight.delete(conversationId)
      if (persistQueue.has(conversationId)) {
        void flushQueued(conversationId)
      }
    })

  persistInFlight.set(conversationId, task)
  return task
}

// --- Payload building ---

const isConversationDetail = (
  value: ConversationMeta | ConversationDetail | undefined
): value is ConversationDetail =>
  !!value && Array.isArray((value as ConversationDetail).currentPath)

export type BuildPayloadOptions = {
  id: string
  messages: Message[]
  currentPath: number[]
  title?: string
  titleSource?: MessageLike
  created_at?: string
  updated_at?: string
  existingConversation?: ConversationDetail
}

export const buildConversationPayload = (
  options: BuildPayloadOptions
): ConversationDetail => {
  const now = options.updated_at ?? new Date().toISOString()
  const existing = options.existingConversation
  const allMessages = cloneMessages(options.messages)
  const resolvedCurrentPath =
    options.currentPath.length > 0
      ? options.currentPath
      : (existing?.currentPath ?? [])
  const pathMessages = computeMessagesFromPath(
    options.messages,
    resolvedCurrentPath
  )
  const resolvedTitleSource =
    options.titleSource ??
    pathMessages.find((message) => message.role === 'user') ??
    pathMessages[0]
  const title =
    options.title ??
    existing?.title ??
    (resolvedTitleSource
      ? buildConversationTitle(resolvedTitleSource)
      : DEFAULT_CONVERSATION_TITLE)
  const created_at = options.created_at ?? existing?.created_at ?? now

  return {
    id: options.id,
    title,
    currentPath: resolvedCurrentPath,
    messages: allMessages,
    created_at,
    updated_at: now,
  }
}

// --- Existing conversation resolution ---

const existingConversationCache = new Map<
  string,
  ConversationDetail | undefined
>()

export const resolveExistingConversation = async (
  id: string
): Promise<ConversationDetail | undefined> => {
  if (existingConversationCache.has(id)) {
    return existingConversationCache.get(id)
  }

  const { conversations } = useConversationsStore.getState()
  const stored = conversations.find((item) => item.id === id)
  if (isConversationDetail(stored)) {
    existingConversationCache.set(id, stored)
    return stored
  }

  const fromDb = await conversationRepository.get(id)
  existingConversationCache.set(id, fromDb)
  return fromDb
}

export const cacheExistingConversation = (
  id: string,
  conversation: ConversationDetail
) => {
  existingConversationCache.set(id, conversation)
}

export const clearExistingConversationCache = () => {
  existingConversationCache.clear()
}

// --- Public API ---

export type PersistOptions = {
  force?: boolean
}

export const persistConversation = (
  payload: ConversationDetail,
  options?: PersistOptions
) => {
  const signature = buildPersistSignature(payload)
  if (persistSignatures.get(payload.id) === signature) {
    return
  }

  persistQueue.set(payload.id, payload)

  if (options?.force) {
    void flushQueued(payload.id)
    return
  }

  if (persistTimers.has(payload.id)) {
    return
  }

  const timer = setTimeout(() => {
    persistTimers.delete(payload.id)
    void flushQueued(payload.id)
  }, PERSIST_THROTTLE_MS)

  persistTimers.set(payload.id, timer)
}