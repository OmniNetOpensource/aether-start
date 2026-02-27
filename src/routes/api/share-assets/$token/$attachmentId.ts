import { createFileRoute } from '@tanstack/react-router'
import {
  findAttachmentInSnapshot,
  getPublicShareByToken,
  isSafeShareToken,
  resolveStorageKeyForSharedAttachment,
} from '@/server/db/conversation-shares-db'
import { getServerBindings } from '@/server/env'

const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/share-assets/$token/$attachmentId')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: async ({ params }) => {
          const token = safeDecodeURIComponent(params.token)
          if (!token || !isSafeShareToken(token)) {
            return new Response('Not Found', { status: 404 })
          }

          const attachmentId = safeDecodeURIComponent(params.attachmentId)
          if (!attachmentId) {
            return new Response('Not Found', { status: 404 })
          }

          const { DB, CHAT_ASSETS } = getServerBindings()
          const shareResult = await getPublicShareByToken(DB, token)
          if (shareResult.status !== 'active') {
            return new Response('Not Found', { status: 404 })
          }

          const attachment = findAttachmentInSnapshot(shareResult.snapshotRaw, attachmentId)
          if (!attachment) {
            return new Response('Not Found', { status: 404 })
          }

          const storageKey = resolveStorageKeyForSharedAttachment(attachment)
          if (!storageKey) {
            return new Response('Not Found', { status: 404 })
          }

          const object = await CHAT_ASSETS.get(storageKey)
          if (!object) {
            return new Response('Not Found', { status: 404 })
          }

          const headers = new Headers()
          object.writeHttpMetadata(headers)
          headers.set('etag', object.httpEtag)
          headers.set('cache-control', 'public, max-age=300')

          return new Response(object.body, {
            status: 200,
            headers,
          })
        },
      }),
  },
})
