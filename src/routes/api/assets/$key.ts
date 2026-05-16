import { createFileRoute } from '@tanstack/react-router';
import { requireSessionFromRequest } from '@/features/auth/session';

export const Route = createFileRoute('/api/assets/$key')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: async ({ request }) => {
          await requireSessionFromRequest(request);

          return new Response('Not Found', { status: 404 });
        },
      }),
  },
});
