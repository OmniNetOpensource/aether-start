import { createFileRoute } from '@tanstack/react-router';
import { requireSessionFromRequest } from '@/backend/auth/request';

export const Route = createFileRoute('/api/upload-attachment')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        POST: async ({ request }) => {
          await requireSessionFromRequest(request);

          return new Response('Attachment upload is temporarily disabled.', { status: 503 });
        },
      }),
  },
});
