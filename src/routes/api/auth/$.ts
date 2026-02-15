import { createFileRoute } from '@tanstack/react-router'
import { auth } from '@/features/auth/server/auth'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        ANY: async ({ request }) => {
          return auth.handler(request)
        },
      }),
  },
})
