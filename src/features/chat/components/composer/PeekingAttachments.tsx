import { Loader2, X } from 'lucide-react'
import { ImagePreview } from '@/components/ImagePreview'
import { Button } from '@/components/ui/button'
import {
  getAttachmentPreviewUrl,
  type PendingAttachmentUpload,
} from '@/lib/chat/attachments'
import type { Attachment } from '@/types/message'

type PeekingAttachmentsProps = {
  attachments: Attachment[]
  uploadingAttachments?: PendingAttachmentUpload[]
  onRemove: (id: string) => void
}

function seededAngle(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return ((hash % 13) - 6) * 0.9
}

function seededOffset(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 17 + id.charCodeAt(i)) | 0
  }
  return (hash % 7) - 3
}

export function PeekingAttachments({
  attachments,
  uploadingAttachments = [],
  onRemove,
}: PeekingAttachmentsProps) {
  const items = [
    ...attachments.map((attachment) => ({
      kind: 'ready' as const,
      id: attachment.id,
      attachment,
      rotate: seededAngle(attachment.id),
      offsetY: seededOffset(attachment.id),
    })),
    ...uploadingAttachments.map((attachment) => ({
      kind: 'uploading' as const,
      id: attachment.id,
      attachment,
      rotate: seededAngle(attachment.id),
      offsetY: seededOffset(attachment.id),
    })),
  ]

  return (
    <div className="relative flex h-0 items-end justify-start -mb-1 pl-3 pb-0 z-0">
      <div
        className="flex items-end"
        style={{ transform: 'translateY(80%)' }}
      >
        {items.map(({ kind, attachment, rotate, offsetY }, index) => (
          <div
            key={attachment.id}
            className="group relative flex-shrink-0 transition-transform duration-200 ease-out hover:!-translate-y-[28px] hover:!rotate-0"
            style={{
              transform: `translateY(${offsetY}px) rotate(${rotate}deg)`,
              marginLeft: index === 0 ? 0 : -12,
              zIndex: index,
            }}
          >
            <div
              className="relative overflow-hidden rounded-lg shadow-md ring-1 ring-black"
              style={{
                width: 72,
                height: 72,
              }}
            >
              {kind === 'ready' ? (
                <ImagePreview
                  url={attachment.url}
                  previewUrl={getAttachmentPreviewUrl(attachment)}
                  name={attachment.name}
                  size={attachment.size}
                  className="!w-full !h-full !rounded-lg"
                />
              ) : (
                <div className="relative h-full w-full overflow-hidden rounded-lg">
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="h-full w-full object-cover opacity-75"
                    draggable={false}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-white backdrop-blur-[1px]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-[10px] font-medium uppercase tracking-[0.16em]">
                      上传中
                    </span>
                  </div>
                </div>
              )}
            </div>

            {kind === 'ready' && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="移除附件"
                onClick={() => onRemove(attachment.id)}
                className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-(--interactive-primary)/60 text-(--surface-primary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500 hover:text-white z-10"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
