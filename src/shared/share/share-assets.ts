import type { SharedAttachmentSnapshot } from './share';

const SHARE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;
const STORAGE_KEY_PREFIX = 'chat-assets/';
const ASSET_ROUTE_PREFIX = '/api/assets/';

export const isSafeShareToken = (token: string) => SHARE_TOKEN_PATTERN.test(token);

export const isSafeStorageKey = (storageKey: string) =>
  storageKey.startsWith(STORAGE_KEY_PREFIX) && !storageKey.includes('..');

export const extractStorageKeyFromAssetUrl = (url: string): string | null => {
  if (!URL.canParse(url, 'https://aether.local')) {
    return null;
  }

  const parsed = new URL(url, 'https://aether.local');
  if (!parsed.pathname.startsWith(ASSET_ROUTE_PREFIX)) {
    return null;
  }

  const encodedKey = parsed.pathname.slice(ASSET_ROUTE_PREFIX.length);
  const decodedKey = decodeURIComponent(encodedKey);
  return isSafeStorageKey(decodedKey) ? decodedKey : null;
};

export const resolveStorageKeyForSharedAttachment = (attachment: SharedAttachmentSnapshot) => {
  if (attachment.storageKey && isSafeStorageKey(attachment.storageKey)) {
    return attachment.storageKey;
  }

  return extractStorageKeyFromAssetUrl(attachment.url);
};
