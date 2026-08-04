import { arrayBufferToBase64, parseDataUrl } from '@/shared/worker/base64';
import { getServerBindings } from '@/shared/worker/env';
import { log } from './logger';

const INLINE_IMAGE_MAX_SIZE = 4 * 1024 * 1024;
const INLINE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type AttachmentInput = {
  name: string;
  mimeType: string;
  url?: string;
  storageKey?: string;
};

export type ResolvedAttachment = {
  media_type: string;
  data: string;
};

export const resolveAttachmentToBase64 = async (
  tag: string,
  attachment: AttachmentInput,
): Promise<ResolvedAttachment | null> => {
  if (attachment.url) {
    const parsed = parseDataUrl(attachment.url);
    if (parsed) {
      if (!INLINE_IMAGE_MIME_TYPES.has(parsed.mimeType)) {
        throw new Error(`Unsupported inline image type for ${attachment.name}.`);
      }

      if (!BASE64_PATTERN.test(parsed.base64)) {
        throw new Error(`Invalid inline image data for ${attachment.name}.`);
      }

      if (
        (parsed.base64.length * 3) / 4 -
          (parsed.base64.endsWith('==') ? 2 : parsed.base64.endsWith('=') ? 1 : 0) >
        INLINE_IMAGE_MAX_SIZE
      ) {
        throw new Error(`Inline image ${attachment.name} exceeds the 4MB limit.`);
      }

      return { media_type: parsed.mimeType, data: parsed.base64 };
    }

    if (attachment.url.startsWith('data:')) {
      throw new Error(`Invalid inline image data for ${attachment.name}.`);
    }
  }

  if (attachment.storageKey) {
    try {
      const { CHAT_ASSETS } = getServerBindings();
      if (!CHAT_ASSETS) {
        log(tag, 'Attachment storage is disabled');
        return null;
      }

      const object = await CHAT_ASSETS.get(attachment.storageKey);
      if (!object) {
        log(tag, `R2 object not found for ${attachment.storageKey}`);
      } else {
        const buffer = await object.arrayBuffer();
        return {
          media_type: object.httpMetadata?.contentType || attachment.mimeType,
          data: arrayBufferToBase64(buffer),
        };
      }
    } catch (error) {
      log(tag, `Failed to read storageKey ${attachment.storageKey}`, error);
    }
  }

  if (attachment.url && /^https?:\/\//.test(attachment.url)) {
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) {
        log(tag, 'Failed to fetch attachment url', {
          url: attachment.url,
          status: response.status,
        });
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return {
        media_type: response.headers.get('content-type') || attachment.mimeType,
        data: arrayBufferToBase64(arrayBuffer),
      };
    } catch (error) {
      log(tag, 'Failed to fetch http attachment', error);
    }
  }

  return null;
};
