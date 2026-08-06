import { X } from '@/frontend/design-system/icons';
import { ImagePreview } from '@/frontend/attachments/attachment-preview';
import { Button } from '@/frontend/design-system/button';
import type { Attachment } from '@/shared/chat/message';
import { For } from 'solid-js';

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
const cardSize = { width: '72px', height: '72px' };

export function AttachmentStack(props: AttachmentStackProps) {
  const entries = () => [
    ...(props.quotes ?? []).map((q) => ({
      kind: 'quote' as const,
      id: q.id,
      text: q.text,
      rotate: getRotate(q.id),
      offsetY: getOffsetY(q.id),
    })),
    ...props.items.map((a) => ({
      kind: 'attachment' as const,
      attachment: a,
      rotate: getRotate(a.id),
      offsetY: getOffsetY(a.id),
    })),
  ];

  return (
    <>
      {entries().length > 0 && (
        <div class='relative z-0 flex items-start justify-start px-2'>
          <div
            data-testid='attachment-stack'
            class='flex items-center'
            style={{ transform: 'translateY(70%)' }}
          >
            <For each={entries()}>
              {(entry, index) => (
                <div
                  class='group relative flex-shrink-0 transition-transform duration-200 ease-out hover:!-translate-y-[28px] hover:!rotate-0'
                  style={{
                    transform: `translateY(${entry.offsetY}px) rotate(${entry.rotate}deg)`,
                    'margin-left': index() === 0 ? '0' : '-12px',
                    'z-index': index(),
                  }}
                >
                  <div class={cardStyle} style={cardSize}>
                    {entry.kind === 'quote' ? (
                      <p class='line-clamp-3 h-full w-full select-none overflow-hidden p-1.5 text-[10px] leading-tight text-muted-foreground'>
                        {entry.text}
                      </p>
                    ) : (
                      <ImagePreview
                        url={entry.attachment.url}
                        name={entry.attachment.name}
                        size={entry.attachment.size}
                        class='!h-full !w-full !rounded-lg'
                      />
                    )}
                  </div>

                  {entry.kind === 'quote' && props.onRemoveQuote ? (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      aria-label='Remove quote'
                      onClick={() => props.onRemoveQuote?.(entry.id)}
                      class='absolute -right-1.5 -top-1.5 z-10 h-5 w-5 rounded-full bg-primary text-background opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500 hover:text-white'
                    >
                      <X class='h-3 w-3' />
                    </Button>
                  ) : null}
                  {entry.kind === 'attachment' && props.onRemove ? (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      aria-label='Remove attachment'
                      onClick={() => props.onRemove?.(entry.attachment.id)}
                      class='absolute -right-1.5 -top-1.5 z-10 h-5 w-5 rounded-full bg-primary text-background opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500 hover:text-white'
                    >
                      <X class='h-3 w-3' />
                    </Button>
                  ) : null}
                </div>
              )}
            </For>
          </div>
        </div>
      )}
    </>
  );
}
