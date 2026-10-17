import { z } from 'zod';
import { arrayBufferToBase64 } from '@/shared/core/base64';
import type { ToolDefinition, ToolHandler } from '@/shared/chat/tool-types';
import { createRateLimitedQueue } from './shared/rate-limit';

const enqueueImageRead = createRateLimitedQueue(2_000);

const readImage: ToolHandler = async (args, signal) => {
  const { url } = z.object({ url: z.string().url() }).strict().parse(args);
  if (!['http:', 'https:'].includes(new URL(url).protocol)) {
    throw new Error('read_image requires an HTTP or HTTPS image URL');
  }
  signal?.throwIfAborted();

  return enqueueImageRead(async () => {
    signal?.throwIfAborted();
    const timeoutSignal = AbortSignal.timeout(30_000);
    try {
      const response = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AetherBot/1.0)' },
      });
      if (!response.ok) {
        return `Error: Image HTTP ${response.status} ${response.statusText}`;
      }
      const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!mimeType || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
        await response.body?.cancel();
        return 'Error: read_image requires a JPEG, PNG, GIF, or WebP image response';
      }
      const imageBytes = await response.arrayBuffer();
      return JSON.stringify({
        type: 'image',
        data_url: `data:${mimeType};base64,${arrayBufferToBase64(imageBytes)}`,
        mime_type: mimeType,
        size_bytes: imageBytes.byteLength,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (timeoutSignal.aborted) {
        return 'Error: Image request timed out';
      }
      throw error;
    }
  });
};

export const readImageTool: ToolDefinition = {
  spec: {
    type: 'function',
    function: {
      name: 'read_image',
      description:
        'Read the visual content of an image from a direct JPEG, PNG, GIF, or WebP URL. Returns the image to the model, not webpage text.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { url: { type: 'string', description: 'The direct image URL' } },
        required: ['url'],
      },
    },
  },
  handler: readImage,
};
