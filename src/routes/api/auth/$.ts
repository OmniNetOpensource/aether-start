import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '@/features/auth/server/auth'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        ANY: async ({ request }) => {
          return getAuth().handler(request)
        },
      }),
  },
})
