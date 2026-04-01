/**
 * 聊天附件模块
 *
 * 负责图片附件的校验、上传及状态管理。上传后的资源存储在 Cloudflare R2，通过 /api/upload-attachment 接口完成。
 */

import type { Attachment } from '@/features/chat/message-thread';
import { MAX_IMAGE_SIZE } from '@/shared/browser/file';
import { toast } from '@/shared/app-shell/useToast';

/** 上传成功后服务端返回的资源信息 */
type UploadedAsset = {
  storageKey: string;
  url: string;
};

/** 生成唯一附件 ID，优先用 crypto.randomUUID，否则用时间戳与随机数兜底 */
const createAttachmentId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * 校验文件是否为可上传的图片
 * @returns 校验失败时返回错误提示文案，通过时返回 null
 */
const buildValidationMessage = (file: File) => {
  const mimeType = file.type || '';
  if (!mimeType.startsWith('image/')) {
    return `仅支持上传图片，已跳过「${file.name}」。`;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return `图片「${file.name}」超过 ${(MAX_IMAGE_SIZE / (1024 * 1024)).toFixed(0)}MB 限制。`;
  }

  return null;
};

/**
 * 将 blob 上传到 /api/upload-attachment，存入 R2
 * @returns 服务端返回的 storageKey 与 url
 */
const uploadBlobAsAsset = async (blob: Blob, filename: string): Promise<UploadedAsset> => {
  const formData = new FormData();
  formData.append('file', blob, filename);

  const res = await fetch('/api/upload-attachment', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed: ${res.status}`);
  }

  const json = (await res.json()) as { storageKey: string; url: string };
  return json;
};

/** 获取附件展示用的 URL，优先用缩略图，没有则用原图 */
export const getAttachmentPreviewUrl = (attachment: Pick<Attachment, 'thumbnailUrl' | 'url'>) =>
  attachment.thumbnailUrl || attachment.url;

/**
 * 上传单张图片附件
 * 校验类型和大小后直接上传原图，成功后用返回的 url 渲染
 * @returns 上传成功返回 Attachment，失败返回 null
 */
export const uploadAttachmentFile = async (file: File): Promise<Attachment | null> => {
  const validationMessage = buildValidationMessage(file);
  if (validationMessage) {
    toast.warning(validationMessage);
    return null;
  }

  try {
    const uploaded = await uploadBlobAsAsset(file, file.name);
    return {
      id: createAttachmentId(),
      kind: 'image',
      name: file.name,
      size: file.size,
      mimeType: file.type || '',
      url: uploaded.url,
      storageKey: uploaded.storageKey,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || 'Unknown error');
    console.error(`Failed to upload image "${file.name}"`, error);
    toast.error(`上传图片「${file.name}」失败：${detail}`);
    return null;
  }
};

/**
 * 批量上传图片文件
 * 每张图片单独上传，失败时各自 toast
 * @returns 仅包含上传成功的 Attachment 数组
 */
export const buildAttachmentsFromFiles = async (files: File[]): Promise<Attachment[]> => {
  const results = await Promise.all(files.map((f) => uploadAttachmentFile(f)));
  return results.filter((a): a is Attachment => a !== null);
};
