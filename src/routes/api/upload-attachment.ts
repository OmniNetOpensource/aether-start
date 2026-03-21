import { createFileRoute } from '@tanstack/react-router';
import { requireSessionFromRequest } from '@/server/functions/auth/session';
import { getServerBindings } from '@/server/env';

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const sanitizeFileName = (filename: string): string =>
  filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 128);

export const Route = createFileRoute('/api/upload-attachment')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        POST: async ({ request }) => {
          await requireSessionFromRequest(request);

          const contentType = request.headers.get('content-type') ?? '';
          if (!contentType.includes('multipart/form-data')) {
            return new Response('Expected multipart/form-data', {
              status: 400,
            });
          }

          const formData = await request.formData();
          const file = formData.get('file');
          if (!(file instanceof File)) {
            return new Response('Missing or invalid file', { status: 400 });
          }

          const mimeType = file.type || '';
          if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            return new Response(`Unsupported MIME type: ${mimeType}`, {
              status: 400,
            });
          }

          if (file.size > MAX_ATTACHMENT_SIZE) {
            return new Response(`File exceeds ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB limit`, {
              status: 413,
            });
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          const now = new Date().toISOString().replace(/[:.]/g, '-');
          const randomSuffix =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : Math.random().toString(16).slice(2);
          const key = `chat-assets/${now}-${randomSuffix}-${sanitizeFileName(file.name)}`;
          const { CHAT_ASSETS } = getServerBindings();

          await CHAT_ASSETS.put(key, bytes, {
            httpMetadata: {
              contentType: mimeType,
              cacheControl: 'private, max-age=31536000, immutable',
            },
          });

          return new Response(
            JSON.stringify({
              storageKey: key,
              url: `/api/assets/${encodeURIComponent(key)}`,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      }),
  },
});
