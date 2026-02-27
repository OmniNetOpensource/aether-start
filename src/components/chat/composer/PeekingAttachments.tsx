
import { useMemo } from 'react'
import { X } from 'lucide-react'
import { ImagePreview } from '@/components/ImagePreview'
import { Button } from '@/components/ui/button'
import type { Attachment } from '@/types/message'

type PeekingAttachmentsProps = {
  attachments: Attachment[]
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
  onRemove,
}: PeekingAttachmentsProps) {
  const items = useMemo(
    () =>
      attachments.map((a) => ({
        attachment: a,
        rotate: seededAngle(a.id),
        offsetY: seededOffset(a.id),
      })),
    [attachments],
  )

  return (
    <div className="relative flex items-end justify-start pl-3 pb-0 -mb-1 h-0 z-0">
      <div
        className="flex items-end"
        style={{ transform: 'translateY(80%)' }}
      >
      {items.map(({ attachment, rotate, offsetY }, index) => (
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
              className="relative rounded-lg overflow-hidden shadow-md ring-1 ring-black/5"
              style={{
                width: 72,
                height: 72,
              }}
            >
              <ImagePreview
                url={attachment.url}
                name={attachment.name}
                size={attachment.size}
                className="!w-full !h-full !rounded-lg"
              />
            </div>

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
          </div>
        ))}
      </div>
    </div>
  )
}
