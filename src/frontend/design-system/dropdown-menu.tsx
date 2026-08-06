import { createContext, omit, useContext } from 'solid-js';
import type { JSX } from '@solidjs/web';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  usePopover,
  type PopoverTriggerProps,
} from '@/frontend/design-system/popover';
import { cn } from '@/shared/core/utils';

const DropdownMenuContext = createContext<{ close: () => void }>();

function DropdownMenuProvider(props: { children: JSX.Element }) {
  const popover = usePopover();
  return (
    <DropdownMenuContext value={{ close: () => popover.setOpen(false) }}>
      {props.children}
    </DropdownMenuContext>
  );
}

function DropdownMenu(props: {
  children: JSX.Element;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  positioning?: {
    placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-end';
    gutter?: number;
  };
}) {
  return (
    <Popover
      open={props.open}
      defaultOpen={props.defaultOpen}
      onOpenChange={props.onOpenChange}
      positioning={props.positioning}
    >
      <DropdownMenuProvider>{props.children}</DropdownMenuProvider>
    </Popover>
  );
}

function DropdownMenuTrigger(props: PopoverTriggerProps) {
  return <PopoverTrigger {...props} ariaHasPopup='menu' />;
}

function DropdownMenuContent(
  props: Omit<JSX.HTMLAttributes<HTMLDivElement>, 'style'> & {
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    style?: JSX.CSSProperties;
  },
) {
  return (
    <PopoverContent
      {...omit(props, 'class', 'side', 'align')}
      initialFocus
      role='menu'
      data-slot='dropdown-menu-content'
      class={cn(
        'bg-surface text-foreground max-h-[var(--available-height)] min-w-32 overflow-x-hidden overflow-y-auto rounded-md p-1 outline-hidden',
        props.class,
      )}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not([disabled])',
          ),
        );
        if (items.length === 0) return;

        event.preventDefault();
        const currentIndex = items.indexOf(
          document.activeElement instanceof HTMLButtonElement ? document.activeElement : items[0],
        );
        if (event.key === 'Home') {
          items[0]?.focus();
          return;
        }
        if (event.key === 'End') {
          items[items.length - 1]?.focus();
          return;
        }

        const direction = event.key === 'ArrowDown' ? 1 : -1;
        items[(currentIndex + direction + items.length) % items.length]?.focus();
      }}
    />
  );
}

type DropdownMenuItemProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> & {
  value?: string;
  inset?: boolean;
  variant?: 'default' | 'destructive';
  onSelect?: (event: Event) => void;
};

function DropdownMenuItem(props: DropdownMenuItemProps) {
  const menu = useContext(DropdownMenuContext);
  return (
    <button
      {...omit(props, 'class', 'inset', 'variant', 'onSelect', 'value')}
      type='button'
      role='menuitem'
      data-slot='dropdown-menu-item'
      data-inset={props.inset ? '' : undefined}
      data-variant={props.variant ?? 'default'}
      class={cn(
        "hover:bg-hover focus:bg-hover data-[variant=destructive]:text-destructive data-[variant=destructive]:hover:bg-destructive-muted data-[variant=destructive]:focus:bg-destructive-muted data-[variant=destructive]:[&_svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none disabled:pointer-events-none disabled:text-muted-foreground data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
      onClick={(event) => {
        props.onSelect?.(event);
        if (!event.defaultPrevented) menu?.close();
      }}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
