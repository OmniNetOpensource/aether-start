import { FileText, Image, Quote, X } from '@/frontend/design-system/icons';
import { ImagePreview } from '@/frontend/attachments/attachment-preview';
import { cn } from '@/shared/core/utils';

type ContentChipProps =
  | {
      kind: 'quote';
      text: string;
      onRemove?: () => void;
      className?: string;
    }
  | {
      kind: 'attachment';
      name: string;
      size: number;
      mimeType: string;
      url: string;
      uploading?: boolean;
      onRemove?: () => void;
      className?: string;
    };

export function ContentChip(props: ContentChipProps) {
  if (props.kind === 'attachment' && props.url) {
    return (
      <span
        data-content-chip='attachment'
        className={cn('group/chip relative inline-block align-middle', props.className)}
      >
        <ImagePreview
          url={props.url}
          name={props.name}
          size={props.size}
          uploading={props.uploading}
          className='!h-7 !w-7 !rounded-md ring-1 ring-border'
        />
        {props.onRemove ? (
          <button
            type='button'
            aria-label='删除图片'
            onClick={props.onRemove}
            className='absolute -right-1.5 -top-1.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-foreground text-background opacity-0 shadow-sm transition-opacity group-hover/chip:opacity-100'
          >
            <X className='h-3 w-3' />
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <span
      data-content-chip={props.kind}
      className={cn(
        'group/chip inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs align-middle',
        props.className,
      )}
    >
      {props.kind === 'quote' ? (
        <Quote className='h-3 w-3 shrink-0 text-muted-foreground' />
      ) : props.mimeType.startsWith('image/') ? (
        <Image className='h-3 w-3 shrink-0 text-muted-foreground' />
      ) : (
        <FileText className='h-3 w-3 shrink-0 text-muted-foreground' />
      )}
      <span className='truncate'>{props.kind === 'quote' ? props.text : props.name}</span>
      {props.onRemove ? (
        <button
          type='button'
          aria-label={props.kind === 'quote' ? '删除引用' : '删除附件'}
          onClick={props.onRemove}
          className='-mr-1 grid h-4 w-4 shrink-0 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground'
        >
          <X className='h-3 w-3' />
        </button>
      ) : null}
    </span>
  );
}
