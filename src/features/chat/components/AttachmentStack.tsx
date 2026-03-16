import { X } from "lucide-react";
import { ImagePreview } from "@/components/ImagePreview";
import { Button } from "@/components/ui/button";
import { getAttachmentPreviewUrl } from "@/lib/chat/attachments";
import type { Attachment } from "@/types/message";

type AttachmentStackProps = {
  items: Attachment[];
  onRemove?: (id: string) => void;
};

function getRotate(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }

  return ((hash % 13) - 6) * 0.9;
}

function getOffsetY(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 17 + id.charCodeAt(index)) | 0;
  }

  return (hash % 7) - 3;
}

export function AttachmentStack({
  items: rawItems,
  onRemove,
}: AttachmentStackProps) {
  const items = rawItems.map((attachment) => ({
    attachment,
    rotate: getRotate(attachment.id),
    offsetY: getOffsetY(attachment.id),
  }));

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative z-0 flex  items-start justify-start px-2">
      <div
        data-testid="attachment-stack"
        className="flex justify-between items-center"
        style={{ transform: "translateY(70%)" }}
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
              className="animate-peeking-attachment-pop relative overflow-hidden rounded-lg shadow-md ring-1 ring-black"
              style={{ width: 72, height: 72 }}
            >
              <ImagePreview
                url={attachment.url}
                previewUrl={getAttachmentPreviewUrl(attachment)}
                name={attachment.name}
                size={attachment.size}
                className="!h-full !w-full !rounded-lg"
              />
            </div>

            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove attachment"
                onClick={() => onRemove(attachment.id)}
                className="absolute -right-1.5 -top-1.5 z-10 h-5 w-5 rounded-full bg-(--interactive-primary) text-(--surface-primary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500 hover:text-white"
              >
                <X className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
