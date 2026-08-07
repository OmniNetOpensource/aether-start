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
  if (props.kind === 'attachment' && props.url) {
    return (
      <span
        data-content-chip='attachment'
        class={cn('group/chip relative inline-block align-middle', props.class)}
      >
        <ImagePreview
          url={props.url}
          name={props.name}
          size={props.size}
          uploading={props.uploading}
          class='!h-12 !w-12 !rounded-lg ring-1 ring-border'
        />
        {props.onRemove ? (
          <button
            type='button'
            aria-label='删除图片'
            onClick={props.onRemove}
            class='absolute -right-1.5 -top-1.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-foreground text-background opacity-0 shadow-sm transition-opacity group-hover/chip:opacity-100'
          >
            <X class='h-3 w-3' />
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <span
      data-content-chip={props.kind}
      class={cn(
        'group/chip inline-flex h-7 min-w-0 max-w-64 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs align-middle',
        props.class,
      )}
    >
      {props.kind === 'quote' ? (
        <Quote class='h-3 w-3 shrink-0 text-muted-foreground' />
      ) : props.mimeType.startsWith('image/') ? (
        <Image class='h-3 w-3 shrink-0 text-muted-foreground' />
      ) : (
        <FileText class='h-3 w-3 shrink-0 text-muted-foreground' />
      )}
      <span class='truncate'>{props.kind === 'quote' ? props.text : props.name}</span>
      {props.onRemove ? (
        <button
          type='button'
          aria-label={props.kind === 'quote' ? '删除引用' : '删除附件'}
          onClick={props.onRemove}
          class='-mr-1 grid h-4 w-4 shrink-0 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground'
        >
          <X class='h-3 w-3' />
        </button>
      ) : null}
    </span>
  );
}
