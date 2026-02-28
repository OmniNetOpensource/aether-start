import { arrayBufferToBase64, parseDataUrl } from '@/server/base64'
import { getServerBindings } from '@/server/env'
import { log } from './logger'

export type AttachmentInput = {
  name: string
  mimeType: string
  url?: string
  storageKey?: string
}

export type ResolvedAttachment = {
  media_type: string
  data: string
}

export const resolveAttachmentToBase64 = async (
  tag: string,
  attachment: AttachmentInput,
): Promise<ResolvedAttachment | null> => {
  if (attachment.url) {
    const parsed = parseDataUrl(attachment.url)
    if (parsed) {
      return { media_type: parsed.mimeType, data: parsed.base64 }
    }
  }

  if (attachment.storageKey) {
    try {
      const { CHAT_ASSETS } = getServerBindings()
      const object = await CHAT_ASSETS.get(attachment.storageKey)
      if (!object) {
        log(tag, `R2 object not found for ${attachment.storageKey}`)
      } else {
        const buffer = await object.arrayBuffer()
        return {
          media_type: object.httpMetadata?.contentType || attachment.mimeType,
          data: arrayBufferToBase64(buffer),
        }
      }
    } catch (error) {
      log(tag, `Failed to read storageKey ${attachment.storageKey}`, error)
    }
  }

  if (attachment.url && /^https?:\/\//.test(attachment.url)) {
    try {
      const response = await fetch(attachment.url)
      if (!response.ok) {
        log(tag, 'Failed to fetch attachment url', {
          url: attachment.url,
          status: response.status,
        })
        return null
      }
      const arrayBuffer = await response.arrayBuffer()
      return {
        media_type: response.headers.get('content-type') || attachment.mimeType,
        data: arrayBufferToBase64(arrayBuffer),
      }
    } catch (error) {
      log(tag, 'Failed to fetch http attachment', error)
    }
  }

  return null
}
