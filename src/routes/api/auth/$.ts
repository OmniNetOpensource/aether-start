import { createFileRoute } from '@tanstack/solid-router';
import { getAuth } from '@/backend/auth/identity';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        ANY: async ({ request }) => {
          return getAuth().handler(request);
        },
      }),
  },
});
