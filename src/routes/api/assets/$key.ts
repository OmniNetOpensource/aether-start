import { createFileRoute } from '@tanstack/react-router'
import { requireSessionFromRequest } from '@/server/functions/auth/session'
import { getServerBindings } from '@/server/env'

const KEY_PREFIX = 'chat-assets/'

const isSafeStorageKey = (value: string) =>
  value.startsWith(KEY_PREFIX) && !value.includes('..')

export const Route = createFileRoute('/api/assets/$key')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: async ({ params, request }) => {
          await requireSessionFromRequest(request)

          const rawKey = decodeURIComponent(params.key)
          if (!isSafeStorageKey(rawKey)) {
            return new Response('Invalid asset key', { status: 400 })
          }

          const { CHAT_ASSETS } = getServerBindings()
          const object = await CHAT_ASSETS.get(rawKey)
          if (!object) {
            return new Response('Not Found', { status: 404 })
          }

          const headers = new Headers()
          object.writeHttpMetadata(headers)
          headers.set('etag', object.httpEtag)
          headers.set('cache-control', 'private, max-age=31536000, immutable')

          return new Response(object.body, {
            status: 200,
            headers,
          })
        },
      }),
  },
})
