import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronRight } from '@/frontend/design-system/icons';
import { cn } from '@/shared/core/utils';
import { Badge } from './badge';

const ChainOfThoughtContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

type ChainOfThoughtProps = ComponentProps<'div'> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function ChainOfThought({
  className,
  open: controlledOpen,
  defaultOpen = true,
  onOpenChange,
  ...props
}: ChainOfThoughtProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const toggle = () => {
    const nextOpen = !open;
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  return (
    <ChainOfThoughtContext value={{ open, toggle }}>
      <div
        {...props}
        data-slot='chain-of-thought'
        className={cn('my-4 bg-transparent px-1 pt-0 pb-2', className)}
      />
    </ChainOfThoughtContext>
  );
}

function ChainOfThoughtHeader({ className, onClick, ...props }: ComponentProps<'button'>) {
  const context = useContext(ChainOfThoughtContext);
  if (!context) throw new Error('ChainOfThoughtHeader must be used inside ChainOfThought');
  return (
    <button
      {...props}
      type='button'
      data-slot='chain-of-thought-header'
      data-state={context.open ? 'open' : 'closed'}
      title='点击展开或收起'
      className={cn(
        'group sticky top-0 z-0 flex w-full cursor-pointer items-center gap-1.5 py-0 text-xs font-medium text-muted-foreground bg-background -mx-1 px-1 hover:text-foreground transition-colors duration-150',
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.toggle();
      }}
    >
      <ChevronRight
        aria-hidden='true'
        className='h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90 group-hover:text-foreground'
      />
      <span>{props.children ?? '思考过程'}</span>
    </button>
  );
}

function ChainOfThoughtContent({ className, ...props }: ComponentProps<'div'>) {
  const context = useContext(ChainOfThoughtContext);
  if (!context) throw new Error('ChainOfThoughtContent must be used inside ChainOfThought');
  return (
    <>
      {context.open && (
        <div
          {...props}
          data-slot='chain-of-thought-content'
          data-state='open'
          className={cn('overflow-hidden animate-in fade-in-0 slide-in-from-top-2', className)}
        />
      )}
    </>
  );
}

type StepStatus = 'complete' | 'active' | 'pending';
type ChainOfThoughtStepProps = ComponentProps<'div'> & {
  icon?: ReactNode;
  label?: string;
  description?: string;
  status?: StepStatus;
  hideConnector?: boolean;
};

function ChainOfThoughtStep({
  className,
  icon,
  label: _label,
  description,
  status = 'complete',
  hideConnector,
  children,
  ...props
}: ChainOfThoughtStepProps) {
  void _label;
  return (
    <div
      {...props}
      data-slot='chain-of-thought-step'
      className={cn('flex gap-4 py-2 first:pt-4 animate-in fade-in duration-200', className)}
    >
      <div className='flex flex-col items-center pt-0.5'>
        <div
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-secondary',
            icon && status === 'pending' && 'text-muted-foreground',
          )}
        >
          {icon ?? (
            <div
              className={cn(
                'h-1.5 w-1.5 rounded-full bg-current transition-opacity',
                status === 'active' && 'ring-1 ring-accent',
                status === 'pending' && 'text-muted-foreground',
              )}
            />
          )}
        </div>
        {!hideConnector && <div className='w-px flex-1 min-h-4 mt-0.5 bg-border' />}
      </div>
      <div className='flex-1 min-w-0 pb-4'>
        {description && <div className='text-xs text-secondary leading-relaxed'>{description}</div>}
        {children && <div className={description ? 'mt-2' : ''}>{children}</div>}
      </div>
    </div>
  );
}

function ChainOfThoughtSearchResults({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot='chain-of-thought-search-results'
      className={cn('flex flex-wrap gap-2', className)}
    />
  );
}

function ChainOfThoughtSearchResult(props: {
  href?: string;
  icon?: ReactNode;
  url?: string;
  children?: ReactNode;
  className?: string;
}) {
  const content = (
    <Badge
      variant='outline'
      className={cn(
        'gap-1.5 px-2 py-0.5 text-[11px] max-w-full font-normal border-0 hover:bg-hover cursor-pointer transition-colors',
        props.className,
      )}
    >
      {props.icon && <span className='shrink-0'>{props.icon}</span>}
      <span className='truncate min-w-0'>{props.children}</span>
      {props.url && (
        <span className='shrink-0 text-muted-foreground'>
          {URL.canParse(props.url) ? new URL(props.url).host : props.url}
        </span>
      )}
    </Badge>
  );
  return props.href ? (
    <a
      href={props.href}
      target='_blank'
      rel='noopener noreferrer'
      className='no-underline max-w-full'
    >
      {content}
    </a>
  ) : (
    content
  );
}

type ChainOfThoughtImageProps = ComponentProps<'img'> & { caption?: string };
function ChainOfThoughtImage({ className, caption, ...props }: ChainOfThoughtImageProps) {
  return (
    <div data-slot='chain-of-thought-image' className='space-y-2'>
      <img {...props} className={cn('max-w-full rounded-lg border border-border', className)} />
      {caption && <div className='text-xs text-secondary'>{caption}</div>}
    </div>
  );
}

export {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtImage,
};
export type { StepStatus, ChainOfThoughtStepProps };
