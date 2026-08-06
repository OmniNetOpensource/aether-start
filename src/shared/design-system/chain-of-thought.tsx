import { createContext, createSignal, omit, useContext, type Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { ChevronRight } from '@/shared/design-system/icons';
import { cn } from '@/shared/core/utils';
import { Badge } from './badge';

const ChainOfThoughtContext = createContext<{ open: Accessor<boolean>; toggle: () => void }>();

type ChainOfThoughtProps = JSX.HTMLAttributes<HTMLDivElement> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function ChainOfThought(props: ChainOfThoughtProps) {
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? true);
  const open = () => props.open ?? internalOpen();
  const toggle = () => {
    const nextOpen = !open();
    if (props.open === undefined) setInternalOpen(nextOpen);
    props.onOpenChange?.(nextOpen);
  };
  return (
    <ChainOfThoughtContext value={{ open, toggle }}>
      <div
        {...omit(props, 'class', 'open', 'defaultOpen', 'onOpenChange', 'children')}
        data-slot='chain-of-thought'
        class={cn('my-4 bg-transparent px-1 pt-0 pb-2', props.class)}
      >
        {props.children}
      </div>
    </ChainOfThoughtContext>
  );
}

function ChainOfThoughtHeader(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = useContext(ChainOfThoughtContext);
  if (!context) throw new Error('ChainOfThoughtHeader must be used inside ChainOfThought');
  return (
    <button
      {...omit(props, 'class', 'onClick')}
      type='button'
      data-slot='chain-of-thought-header'
      data-state={context.open() ? 'open' : 'closed'}
      title='点击展开或收起'
      class={cn(
        'group sticky top-0 z-0 flex w-full cursor-pointer items-center gap-1.5 py-0 text-xs font-medium text-muted-foreground bg-background -mx-1 px-1 hover:text-foreground transition-colors duration-150',
        props.class,
      )}
      onClick={context.toggle}
    >
      <ChevronRight
        aria-hidden='true'
        class='h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90 group-hover:text-foreground'
      />
      <span>{props.children ?? '思考过程'}</span>
    </button>
  );
}

function ChainOfThoughtContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const context = useContext(ChainOfThoughtContext);
  if (!context) throw new Error('ChainOfThoughtContent must be used inside ChainOfThought');
  return (
    <>
      {context.open() && (
        <div
          {...omit(props, 'class', 'children')}
          data-slot='chain-of-thought-content'
          data-state='open'
          class={cn('overflow-hidden animate-in fade-in-0 slide-in-from-top-2', props.class)}
        >
          {props.children}
        </div>
      )}
    </>
  );
}

type StepStatus = 'complete' | 'active' | 'pending';
type ChainOfThoughtStepProps = JSX.HTMLAttributes<HTMLDivElement> & {
  icon?: JSX.Element;
  label?: string;
  description?: string;
  status?: StepStatus;
  hideConnector?: boolean;
};

function ChainOfThoughtStep(props: ChainOfThoughtStepProps) {
  const status = () => props.status ?? 'complete';
  return (
    <div
      {...omit(props, 'class', 'icon', 'label', 'description', 'status', 'hideConnector')}
      data-slot='chain-of-thought-step'
      class={cn('flex gap-4 py-2 first:pt-4 animate-in fade-in duration-200', props.class)}
    >
      <div class='flex flex-col items-center pt-0.5'>
        <div
          class={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-secondary',
            props.icon && status() === 'pending' && 'text-muted-foreground',
          )}
        >
          {props.icon ?? (
            <div
              class={cn(
                'h-1.5 w-1.5 rounded-full bg-current transition-opacity',
                status() === 'active' && 'ring-1 ring-accent',
                status() === 'pending' && 'text-muted-foreground',
              )}
            />
          )}
        </div>
        {!props.hideConnector && <div class='w-px flex-1 min-h-4 mt-0.5 bg-border' />}
      </div>
      <div class='flex-1 min-w-0 pb-4'>
        {props.description && (
          <div class='text-xs text-secondary leading-relaxed'>{props.description}</div>
        )}
        {props.children && <div class={props.description ? 'mt-2' : ''}>{props.children}</div>}
      </div>
    </div>
  );
}

function ChainOfThoughtSearchResults(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...omit(props, 'class', 'children')}
      data-slot='chain-of-thought-search-results'
      class={cn('flex flex-wrap gap-2', props.class)}
    >
      {props.children}
    </div>
  );
}

function ChainOfThoughtSearchResult(props: {
  href?: string;
  icon?: JSX.Element;
  url?: string;
  children?: JSX.Element;
  class?: string;
}) {
  const content = (
    <Badge
      variant='outline'
      class={cn(
        'gap-1.5 px-2 py-0.5 text-[11px] max-w-full font-normal border-0 hover:bg-hover cursor-pointer transition-colors',
        props.class,
      )}
    >
      {props.icon && <span class='shrink-0'>{props.icon}</span>}
      <span class='truncate min-w-0'>{props.children}</span>
      {props.url && (
        <span class='shrink-0 text-muted-foreground'>
          {URL.canParse(props.url) ? new URL(props.url).host : props.url}
        </span>
      )}
    </Badge>
  );
  return props.href ? (
    <a href={props.href} target='_blank' rel='noopener noreferrer' class='no-underline max-w-full'>
      {content}
    </a>
  ) : (
    content
  );
}

type ChainOfThoughtImageProps = JSX.ImgHTMLAttributes<HTMLImageElement> & { caption?: string };
function ChainOfThoughtImage(props: ChainOfThoughtImageProps) {
  return (
    <div data-slot='chain-of-thought-image' class='space-y-2'>
      <img
        {...omit(props, 'class', 'caption')}
        class={cn('max-w-full rounded-lg border border-border', props.class)}
      />
      {props.caption && <div class='text-xs text-secondary'>{props.caption}</div>}
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
