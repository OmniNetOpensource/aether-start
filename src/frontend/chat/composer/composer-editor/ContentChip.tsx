import { FileText, Image, Quote, X } from '@/frontend/design-system/icons';
import { ImagePreview } from '@/frontend/attachments/attachment-preview';
import { cn } from '@/shared/core/utils';

type ContentChipProps =
  | {
      kind: 'quote';
      text: string;
      onRemove?: () => void;
      class?: string;
    }
  | {
      kind: 'attachment';
      name: string;
      size: number;
      mimeType: string;
      url: string;
      uploading?: boolean;
      onRemove?: () => void;
      class?: string;
    };

export function ContentChip(props: ContentChipProps) {
  const isQuote = props.kind === 'quote';

  return (
    <span
      data-content-chip={props.kind}
      class={cn(
        'inline-flex h-8 min-w-0 max-w-64 items-center gap-1.5 rounded-lg border bg-background/80 py-1 pl-1.5 pr-1 text-xs align-middle shadow-sm',
        props.class,
      )}
    >
      {isQuote ? (
        <Quote class='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
      ) : props.url ? (
        <ImagePreview
          url={props.url}
          name={props.name}
          size={props.size}
          uploading={props.uploading}
          class='!h-6 !w-6 !rounded'
        />
      ) : props.mimeType.startsWith('image/') ? (
        <Image class='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
      ) : (
        <FileText class='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
      )}
      <span class='truncate'>{isQuote ? props.text : props.name}</span>
      {props.onRemove ? (
        <button
          type='button'
          aria-label={isQuote ? '删除引用' : '删除图片'}
          onClick={props.onRemove}
          class='grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-hover hover:text-foreground'
        >
          <X class='h-3 w-3' />
        </button>
      ) : null}
    </span>
  );
}
