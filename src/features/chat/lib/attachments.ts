import type { Attachment } from "@/types/message";
import { MAX_IMAGE_SIZE, convertFileToBase64 } from "@/lib/utils/file";
import { toast } from "@/hooks/useToast";
import { uploadAttachmentFn } from '@/server/functions/chat/attachment-upload'

const THUMBNAIL_MAX_DIMENSION = 320
const THUMBNAIL_MIME_TYPE = 'image/webp'
const THUMBNAIL_QUALITY = 0.82

type UploadedAsset = {
  storageKey: string
  url: string
}

export type PendingAttachmentUpload = {
  id: string
  kind: 'image'
  name: string
  size: number
  mimeType: string
  previewUrl: string
}

const createAttachmentId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const buildValidationMessage = (file: File) => {
  const mimeType = file.type || ''
  if (!mimeType.startsWith('image/')) {
    return `仅支持上传图片，已跳过「${file.name}」。`
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return `图片「${file.name}」超过 ${(MAX_IMAGE_SIZE / (1024 * 1024)).toFixed(0)}MB 限制。`
  }

  return null
}

const loadImageElement = async (src: string) => {
  const image = new Image()
  image.decoding = 'async'

  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`))
  })

  image.src = src

  if (image.complete && image.naturalWidth > 0) {
    if (typeof image.decode === 'function') {
      try {
        await image.decode()
      } catch {
        // decode() can reject even when the image is still renderable.
      }
    }
    return image
  }

  const loaded = await ready
  if (typeof loaded.decode === 'function') {
    try {
      await loaded.decode()
    } catch {
      // decode() can reject even when the image is still renderable.
    }
  }
  return loaded
}

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })

const buildThumbnailFilename = (filename: string) => {
  const dotIndex = filename.lastIndexOf('.')
  const baseName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  return `${baseName}-thumb.webp`
}

const generateThumbnailFromFile = async (file: File) => {
  if (typeof document === 'undefined' || file.type === 'image/gif') {
    return null
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImageElement(objectUrl)
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight)
    if (!largestSide || largestSide <= THUMBNAIL_MAX_DIMENSION) {
      return null
    }

    const scale = THUMBNAIL_MAX_DIMENSION / largestSide
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return null
    }

    context.drawImage(image, 0, 0, width, height)

    const blob = await canvasToBlob(canvas, THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY)
    if (!blob) {
      return null
    }

    return {
      blob,
      filename: buildThumbnailFilename(file.name),
      mimeType: THUMBNAIL_MIME_TYPE,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const uploadBlobAsAsset = async (
  blob: Blob,
  filename: string,
  mimeType: string,
): Promise<UploadedAsset> => {
  const dataUrl = await convertFileToBase64(blob)
  return uploadAttachmentFn({
    data: {
      filename,
      mimeType,
      dataUrl,
    },
  })
}

export const getAttachmentPreviewUrl = (attachment: Pick<Attachment, 'thumbnailUrl' | 'url'>) =>
  attachment.thumbnailUrl || attachment.url

export const createPendingAttachmentUpload = (file: File): PendingAttachmentUpload => ({
  id: createAttachmentId(),
  kind: 'image',
  name: file.name,
  size: file.size,
  mimeType: file.type || '',
  previewUrl: URL.createObjectURL(file),
})

export const revokePendingAttachmentUpload = (attachment: PendingAttachmentUpload) => {
  URL.revokeObjectURL(attachment.previewUrl)
}

export const uploadAttachmentFile = async (
  file: File,
): Promise<Attachment | null> => {
  const validationMessage = buildValidationMessage(file)
  if (validationMessage) {
    toast.warning(validationMessage)
    return null
  }

  try {
    const mimeType = file.type || ''
    const thumbnail = await generateThumbnailFromFile(file)
    const [uploadedOriginal, uploadedThumbnail] = await Promise.all([
      uploadBlobAsAsset(file, file.name, mimeType),
      thumbnail
        ? uploadBlobAsAsset(thumbnail.blob, thumbnail.filename, thumbnail.mimeType)
        : Promise.resolve<UploadedAsset | null>(null),
    ])

    const attachment: Attachment = {
      id: createAttachmentId(),
      kind: 'image',
      name: file.name,
      size: file.size,
      mimeType,
      url: uploadedOriginal.url,
      storageKey: uploadedOriginal.storageKey,
      ...(uploadedThumbnail
        ? {
            thumbnailUrl: uploadedThumbnail.url,
            thumbnailStorageKey: uploadedThumbnail.storageKey,
          }
        : {}),
    }

    await loadImageElement(getAttachmentPreviewUrl(attachment))
    return attachment
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error || 'Unknown error')
    console.error(`Failed to upload image "${file.name}"`, error)
    toast.error(`上传图片「${file.name}」失败：${detail}`)
    return null
  }
}

export const buildAttachmentsFromFiles = async (
  files: File[],
): Promise<Attachment[]> => {
  const attachments: Attachment[] = []

  for (const file of files) {
    const attachment = await uploadAttachmentFile(file)
    if (attachment) {
      attachments.push(attachment)
    }
  }

  return attachments
}
