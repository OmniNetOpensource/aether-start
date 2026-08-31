import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/core/utils';

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-end';
type Positioning = { placement?: Placement; gutter?: number };
type PopoverContextValue = {
  contentId: string;
  dismiss: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger: HTMLElement | null;
  setTrigger: (element: HTMLElement | null) => void;
  positioning: Positioning;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopover() {
  const context = useContext(PopoverContext);
  if (!context) throw new Error('Popover components must be used inside Popover');
  return context;
}

function Popover({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  positioning = {},
}: {
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  positioning?: Positioning;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const focusRestoreTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentId = useId();
  const open = controlledOpen ?? internalOpen;
  const cancelFocusRestore = () => {
    if (focusRestoreTimeout.current === null) return;
    clearTimeout(focusRestoreTimeout.current);
    focusRestoreTimeout.current = null;
  };
  const updateOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const setOpen = (nextOpen: boolean) => {
    cancelFocusRestore();
    updateOpen(nextOpen);
    if (!nextOpen) {
      focusRestoreTimeout.current = setTimeout(() => {
        focusRestoreTimeout.current = null;
        trigger?.focus();
      });
    }
  };
  const dismiss = () => {
    cancelFocusRestore();
    updateOpen(false);
  };

  useEffect(() => {
    if (!open || focusRestoreTimeout.current === null) return;
    clearTimeout(focusRestoreTimeout.current);
    focusRestoreTimeout.current = null;
  }, [open]);

  useEffect(
    () => () => {
      if (focusRestoreTimeout.current !== null) clearTimeout(focusRestoreTimeout.current);
    },
    [],
  );

  return (
    <PopoverContext value={{ contentId, dismiss, open, setOpen, trigger, setTrigger, positioning }}>
      {children}
    </PopoverContext>
  );
}

type PopoverTriggerAttributes = ComponentPropsWithRef<'button'> & {
  'data-state': 'open' | 'closed';
};

type PopoverTriggerProps = {
  children?: ReactNode;
  asChild?: (props: PopoverTriggerAttributes) => ReactNode;
  ariaHasPopup?: 'dialog' | 'menu';
};

function PopoverTrigger({ children, asChild, ariaHasPopup }: PopoverTriggerProps) {
  const popover = usePopover();
  const triggerProps: PopoverTriggerAttributes = {
    ref: popover.setTrigger,
    'aria-controls': popover.contentId,
    'aria-expanded': popover.open,
    'aria-haspopup': ariaHasPopup ?? 'dialog',
    'data-state': popover.open ? 'open' : 'closed',
    onClick: () => popover.setOpen(!popover.open),
  };
  if (asChild) return asChild(triggerProps);
  return <button {...triggerProps}>{children}</button>;
}

function PopoverClose({ onClick, ...props }: ComponentPropsWithRef<'button'>) {
  const popover = usePopover();
  return (
    <button
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) popover.setOpen(false);
      }}
    />
  );
}

type PopoverStyle = CSSProperties & { '--available-height'?: string };

function getPosition(trigger: DOMRect, content: DOMRect, positioning: Positioning): PopoverStyle {
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

type PopoverContentProps = Omit<ComponentPropsWithRef<'div'>, 'style'> & {
  initialFocus?: boolean;
  style?: PopoverStyle;
};

function PopoverContent(props: PopoverContentProps) {
  const popover = usePopover();
  if (!popover.open) return null;
  return <OpenPopoverContent {...props} popoverState={popover} />;
}

function OpenPopoverContent({
  initialFocus,
  className,
  style,
  ref,
  popoverState,
  ...props
}: PopoverContentProps & { popoverState: PopoverContextValue }) {
  const [position, setPosition] = useState<PopoverStyle>({ visibility: 'hidden' });
  const content = useRef<HTMLDivElement>(null);
  const placement = popoverState.positioning.placement;
  const gutter = popoverState.positioning.gutter;
  const trigger = popoverState.trigger;
  const close = useEffectEvent(() => popoverState.setOpen(false));
  const dismiss = useEffectEvent(() => popoverState.dismiss());

  useEffect(() => {
    if (!trigger || !content.current) return;
    const element = content.current;
    let active = true;
    const updatePosition = () => {
      setPosition(
        getPosition(trigger.getBoundingClientRect(), element.getBoundingClientRect(), {
          placement,
          gutter,
        }),
      );
    };
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!element.contains(event.target) && !trigger.contains(event.target)) {
        dismiss();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const resizeObserver = new ResizeObserver(updatePosition);

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    resizeObserver.observe(trigger);
    resizeObserver.observe(element);
    queueMicrotask(() => {
      if (!active) return;
      updatePosition();
      if (initialFocus) {
        element.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
      }
    });

    return () => {
      active = false;
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      resizeObserver.disconnect();
    };
  }, [gutter, initialFocus, placement, trigger]);

  return createPortal(
    <div
      {...props}
      ref={(element) => {
        content.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
      id={popoverState.contentId}
      role={props.role ?? 'dialog'}
      className={cn(
        'bg-surface text-foreground fixed z-(--z-popover) w-72 p-4 outline-hidden',
        className,
      )}
      style={{
        borderRadius: '8px 2px 12px 4px / 4px 12px 2px 8px',
        ...style,
        ...position,
      }}
    />,
    document.body,
  );
}

export { Popover, PopoverTrigger, PopoverClose, PopoverContent, usePopover };
export type { PopoverTriggerAttributes, PopoverTriggerProps };
