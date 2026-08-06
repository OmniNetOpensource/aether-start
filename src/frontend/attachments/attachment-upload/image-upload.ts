import type { Attachment } from '@/shared/chat/message';
import { arrayBufferToBase64 } from '@/shared/core/base64';

export const STORAGE_IMAGE_MAX_SIZE = 20 * 1024 * 1024;
export const BASE64_IMAGE_MAX_SIZE = 4 * 1024 * 1024;
export const BASE64_MESSAGE_MAX_SIZE = 8 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const getImageValidationMessage = (file: File, maxSize: number) => {
  if (!IMAGE_MIME_TYPES.has(file.type)) {
    return `不支持图片「${file.name}」的格式。`;
  }

  if (file.size > maxSize) {
    return `图片「${file.name}」超过 ${maxSize / (1024 * 1024)}MB 限制。`;
  }

  return null;
};

export const createAttachmentId = () => crypto.randomUUID();

export const getStorageImageValidationMessage = (file: File) =>
  getImageValidationMessage(file, STORAGE_IMAGE_MAX_SIZE);

export const getBase64ImageValidationMessage = (file: File) =>
  getImageValidationMessage(file, BASE64_IMAGE_MAX_SIZE);

export const uploadImageToStorage = async (file: File, id: string): Promise<Attachment> => {
  const validationMessage = getStorageImageValidationMessage(file);
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch('/api/upload-attachment', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const uploaded: unknown = await response.json();
  if (
    typeof uploaded !== 'object' ||
    uploaded === null ||
    !('storageKey' in uploaded) ||
    !('url' in uploaded) ||
    typeof uploaded.storageKey !== 'string' ||
    typeof uploaded.url !== 'string'
  ) {
    throw new Error('Invalid image upload response.');
  }

  return {
    id,
    kind: 'image',
    name: file.name,
    size: file.size,
    mimeType: file.type,
    url: uploaded.url,
    storageKey: uploaded.storageKey,
  };
};

export const convertImageToBase64 = async (file: File, id: string): Promise<Attachment> => {
  const validationMessage = getBase64ImageValidationMessage(file);
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  return {
    id,
    kind: 'image',
    name: file.name,
    size: file.size,
    mimeType: file.type,
    url: `data:${file.type};base64,${arrayBufferToBase64(await file.arrayBuffer())}`,
  };
};
