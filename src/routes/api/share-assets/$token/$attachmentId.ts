import { createFileRoute } from '@tanstack/react-router';
import { getPublicShareByToken, isSafeShareToken } from '@/features/share/share-record';
import { getServerBindings } from '@/shared/worker/env';

const safeDecodeURIComponent = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

export const Route = createFileRoute('/api/share-assets/$token/$attachmentId')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: async ({ params }) => {
          const token = safeDecodeURIComponent(params.token);
          if (!token || !isSafeShareToken(token)) {
            return new Response('Not Found', { status: 404 });
          }

          const attachmentId = safeDecodeURIComponent(params.attachmentId);
          if (!attachmentId) {
            return new Response('Not Found', { status: 404 });
          }

          const { DB } = getServerBindings();
          const shareResult = await getPublicShareByToken(DB, token);
          if (shareResult.status !== 'active') {
            return new Response('Not Found', { status: 404 });
          }

          return new Response('Not Found', { status: 404 });
        },
      }),
  },
});
