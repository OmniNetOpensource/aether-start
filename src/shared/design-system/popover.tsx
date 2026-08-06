import {
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  omit,
  useContext,
  type Accessor,
} from 'solid-js';
import { Portal, type JSX } from '@solidjs/web';
import { cn } from '@/shared/core/utils';

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-end';
type Positioning = { placement?: Placement; gutter?: number };
type PopoverContextValue = {
  contentId: string;
  open: Accessor<boolean>;
  setOpen: (open: boolean) => void;
  trigger: Accessor<HTMLElement | undefined>;
  setTrigger: (element: HTMLElement) => void;
  positioning: Positioning;
};

const PopoverContext = createContext<PopoverContextValue>();

function usePopover() {
  const context = useContext(PopoverContext);
  if (!context) throw new Error('Popover components must be used inside Popover');
  return context;
}

function Popover(props: {
  children: JSX.Element;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  positioning?: Positioning;
}) {
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const open = () => props.open ?? internalOpen();
  const setOpen = (nextOpen: boolean) => {
    if (props.open === undefined) setInternalOpen(nextOpen);
    props.onOpenChange?.(nextOpen);
    if (!nextOpen) setTimeout(() => trigger()?.focus());
  };
  return (
    <PopoverContext
      value={{
        contentId: createUniqueId(),
        open,
        setOpen,
        trigger,
        setTrigger,
        positioning: props.positioning ?? {},
      }}
    >
      {props.children}
    </PopoverContext>
  );
}

type PopoverTriggerProps = {
  children?: JSX.Element;
  asChild?: (props: PopoverTriggerAttributes) => JSX.Element;
  ariaHasPopup?: 'dialog' | 'menu';
};

function PopoverTrigger(props: PopoverTriggerProps) {
  const popover = usePopover();
  const triggerProps: PopoverTriggerAttributes = {
    ref: popover.setTrigger,
    'aria-controls': popover.contentId,
    get 'aria-expanded'() {
      return popover.open() ? 'true' : 'false';
    },
    'aria-haspopup': props.ariaHasPopup ?? 'dialog',
    get 'data-state'() {
      return popover.open() ? 'open' : 'closed';
    },
    onClick: () => popover.setOpen(!popover.open()),
  };
  if (typeof props.asChild === 'function') return props.asChild(triggerProps);
  return <button {...triggerProps}>{props.children}</button>;
}

type PopoverTriggerAttributes = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  'data-state': 'open' | 'closed';
};

function PopoverClose(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const popover = usePopover();
  return (
    <button {...omit(props, 'children')} onClick={() => popover.setOpen(false)}>
      {props.children}
    </button>
  );
}

function getPosition(
  trigger: DOMRect,
  content: DOMRect,
  positioning: Positioning,
): JSX.CSSProperties {
  const gutter = positioning.gutter ?? 4;
  const viewportPadding = 8;
  const placement = positioning.placement ?? 'bottom-start';
  let top: number;
  let left: number;

  switch (placement) {
    case 'bottom-end':
      top = trigger.bottom + gutter;
      left = trigger.right - content.width;
      break;
    case 'top-start':
      top = trigger.top - content.height - gutter;
      left = trigger.left;
      break;
    case 'top-end':
      top = trigger.top - content.height - gutter;
      left = trigger.right - content.width;
      break;
    case 'right-end':
      top = trigger.bottom - content.height;
      left = trigger.right + gutter;
      if (left + content.width > window.innerWidth - viewportPadding) {
        left = trigger.left - content.width - gutter;
      }
      break;
    default:
      top = trigger.bottom + gutter;
      left = trigger.left;
  }

  if (
    placement.startsWith('bottom') &&
    top + content.height > window.innerHeight - viewportPadding
  ) {
    const topPosition = trigger.top - content.height - gutter;
    if (topPosition >= viewportPadding) top = topPosition;
  } else if (placement.startsWith('top') && top < viewportPadding) {
    const bottomPosition = trigger.bottom + gutter;
    if (bottomPosition + content.height <= window.innerHeight - viewportPadding) {
      top = bottomPosition;
    }
  }

  top = Math.max(
    viewportPadding,
    Math.min(top, window.innerHeight - content.height - viewportPadding),
  );
  left = Math.max(
    viewportPadding,
    Math.min(left, window.innerWidth - content.width - viewportPadding),
  );

  return {
    top: `${top}px`,
    left: `${left}px`,
    '--available-height': `${Math.max(0, window.innerHeight - top - viewportPadding)}px`,
  };
}

function PopoverContent(
  props: Omit<JSX.HTMLAttributes<HTMLDivElement>, 'style'> & {
    initialFocus?: boolean;
    style?: JSX.CSSProperties;
  },
) {
  const popover = usePopover();
  const [position, setPosition] = createSignal<JSX.CSSProperties>({ visibility: 'hidden' });
  let content: HTMLDivElement | undefined;

  createEffect(
    () => ({ open: popover.open(), trigger: popover.trigger() }),
    ({ open, trigger }) => {
      if (!open) return;
      if (!trigger) return;
      const updatePosition = () => {
        if (!content) return;
        setPosition(
          getPosition(
            trigger.getBoundingClientRect(),
            content.getBoundingClientRect(),
            popover.positioning,
          ),
        );
      };
      const closeOutside = (event: PointerEvent) => {
        if (!(event.target instanceof Node)) return;
        if (!content?.contains(event.target) && !trigger.contains(event.target))
          popover.setOpen(false);
      };
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') popover.setOpen(false);
      };
      document.addEventListener('pointerdown', closeOutside);
      document.addEventListener('keydown', closeOnEscape);
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      queueMicrotask(() => {
        updatePosition();
        if (props.initialFocus) {
          content?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
        }
      });
      return () => {
        document.removeEventListener('pointerdown', closeOutside);
        document.removeEventListener('keydown', closeOnEscape);
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    },
  );

  return (
    <>
      {popover.open() && (
        <Portal>
          <div
            {...omit(props, 'class', 'style', 'initialFocus')}
            ref={(element) => {
              content = element;
            }}
            id={popover.contentId}
            role={props.role ?? 'dialog'}
            class={cn(
              'bg-surface text-foreground fixed z-(--z-popover) w-72 p-4 outline-hidden',
              props.class,
            )}
            style={{
              'border-radius': '8px 2px 12px 4px / 4px 12px 2px 8px',
              ...props.style,
              ...position(),
            }}
          />
        </Portal>
      )}
    </>
  );
}

export { Popover, PopoverTrigger, PopoverClose, PopoverContent, usePopover };
export type { PopoverTriggerAttributes, PopoverTriggerProps };
