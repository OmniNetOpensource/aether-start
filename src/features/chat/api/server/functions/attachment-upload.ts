import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { parseDataUrl, base64ToUint8Array } from '@/server/base64'
import { getServerBindings } from '@/server/env'

const sanitizeFileName = (filename: string): string =>
  filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 128)

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const uploadAttachmentInputSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  dataUrl: z.string().min(1),
})

export const uploadAttachmentFn = createServerFn({ method: 'POST' })
  .inputValidator(uploadAttachmentInputSchema)
  .handler(async ({ data }) => {
    const parsed = parseDataUrl(data.dataUrl)
    if (!parsed) {
      throw new Error('Invalid data URL payload')
    }

    if (parsed.mimeType !== data.mimeType) {
      throw new Error('MIME type mismatch')
    }

    if (!allowedMimeTypes.has(data.mimeType)) {
      throw new Error(`Unsupported attachment MIME type: ${data.mimeType}`)
    }

    const bytes = base64ToUint8Array(parsed.base64)
    const now = new Date().toISOString().replace(/[:.]/g, '-')
    const randomSuffix =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(16).slice(2)

    const key = `chat-assets/${now}-${randomSuffix}-${sanitizeFileName(data.filename)}`
    const { CHAT_ASSETS } = getServerBindings()

    await CHAT_ASSETS.put(key, bytes, {
      httpMetadata: {
        contentType: data.mimeType,
        cacheControl: 'private, max-age=31536000, immutable',
      },
    })

    return {
      storageKey: key,
      displayUrl: `/api/assets/${encodeURIComponent(key)}`,
    }
  })
