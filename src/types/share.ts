import type { Message, ResearchItem } from '@/types/message'

export type SharedAttachmentSnapshot = {
  id: string
  kind: 'image'
  name: string
  size: number
  mimeType: string
  url: string
  storageKey?: string
}

export type SharedUserBlock =
  | { type: 'content'; content: string }
  | { type: 'attachments'; attachments: SharedAttachmentSnapshot[] }

export type SharedAssistantBlock =
  | { type: 'content'; content: string }
  | { type: 'research'; items: ResearchItem[] }
  | { type: 'error'; message: string }

export type SharedMessageBlock = SharedUserBlock | SharedAssistantBlock

export type SharedMessageSnapshot = {
  id: number
  role: Message['role']
  createdAt: string
  blocks: SharedMessageBlock[]
}

export type SharedConversationSnapshot = {
  version: 1
  messages: SharedMessageSnapshot[]
}

export type PublicSharedAttachment = Omit<SharedAttachmentSnapshot, 'storageKey'>

export type PublicSharedMessageBlock =
  | { type: 'content'; content: string }
  | { type: 'attachments'; attachments: PublicSharedAttachment[] }
  | { type: 'research'; items: ResearchItem[] }
  | { type: 'error'; message: string }

export type PublicSharedMessage = {
  id: number
  role: Message['role']
  createdAt: string
  blocks: PublicSharedMessageBlock[]
}

export type PublicSharedConversationSnapshot = {
  version: 1
  messages: PublicSharedMessage[]
}

export type PublicShareStatus = 'active' | 'revoked' | 'not_found'

export type PublicShareView =
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
      snapshot: PublicSharedConversationSnapshot
    }

export type ConversationShareStatus = 'not_shared' | 'active' | 'revoked'
