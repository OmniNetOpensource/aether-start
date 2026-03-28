import { X } from 'lucide-react';
import { ImagePreview } from '@/features/attachments/attachment-preview';
import { Button } from '@/shared/design-system/button';
import { getAttachmentPreviewUrl } from '@/features/attachments/attachment-upload';
import type { Attachment } from '@/features/chat/message-thread';

type PendingQuote = { id: string; text: string };

type AttachmentStackProps = {
  items: Attachment[];
  quotes?: PendingQuote[];
  onRemove?: (id: string) => void;
  onRemoveQuote?: (id: string) => void;
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

const cardStyle =
  'animate-peeking-attachment-pop relative overflow-hidden rounded-lg shadow-md ring-1 ring-black';
const cardSize = { width: 72, height: 72 };

export function AttachmentStack({
  items: rawItems,
  quotes = [],
  onRemove,
  onRemoveQuote,
}: AttachmentStackProps) {
  const quoteEntries = quotes.map((q) => ({
    kind: 'quote' as const,
    id: q.id,
    text: q.text,
    rotate: getRotate(q.id),
    offsetY: getOffsetY(q.id),
  }));
  const attachmentEntries = rawItems.map((a) => ({
    kind: 'attachment' as const,
    attachment: a,
    rotate: getRotate(a.id),
    offsetY: getOffsetY(a.id),
  }));
  const entries = [...quoteEntries, ...attachmentEntries];

  if (entries.length === 0) return null;

  return (
    <div className='relative z-0 flex items-start justify-start px-2'>
      <div
        data-testid='attachment-stack'
        className='flex items-center'
        style={{ transform: 'translateY(70%)' }}
      >
        {entries.map((entry, index) => (
          <div
            key={entry.kind === 'quote' ? entry.id : entry.attachment.id}
            className='group relative flex-shrink-0 transition-transform duration-200 ease-out hover:!-translate-y-[28px] hover:!rotate-0'
            style={{
              transform: `translateY(${entry.offsetY}px) rotate(${entry.rotate}deg)`,
              marginLeft: index === 0 ? 0 : -12,
              zIndex: index,
            }}
          >
            <div className={cardStyle} style={cardSize}>
              {entry.kind === 'quote' ? (
                <p className='line-clamp-3 h-full w-full select-none overflow-hidden p-1.5 text-[10px] leading-tight text-muted-foreground'>
                  {entry.text}
                </p>
              ) : (
                <ImagePreview
                  url={entry.attachment.url}
                  previewUrl={getAttachmentPreviewUrl(entry.attachment)}
                  name={entry.attachment.name}
                  size={entry.attachment.size}
                  className='!h-full !w-full !rounded-lg'
                />
              )}
            </div>

            {entry.kind === 'quote' && onRemoveQuote ? (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label='Remove quote'
                onClick={() => onRemoveQuote(entry.id)}
                className='absolute -right-1.5 -top-1.5 z-10 h-5 w-5 rounded-full bg-(--interactive-primary) text-(--surface-primary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500 hover:text-white'
              >
                <X className='h-3 w-3' />
              </Button>
            ) : null}
            {entry.kind === 'attachment' && onRemove ? (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label='Remove attachment'
                onClick={() => onRemove(entry.attachment.id)}
                className='absolute -right-1.5 -top-1.5 z-10 h-5 w-5 rounded-full bg-(--interactive-primary) text-(--surface-primary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500 hover:text-white'
              >
                <X className='h-3 w-3' />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
