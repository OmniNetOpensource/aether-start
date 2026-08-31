import {
  createContext,
  useContext,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  usePopover,
  type PopoverTriggerProps,
} from '@/frontend/design-system/popover';
import { cn } from '@/shared/core/utils';

const DropdownMenuContext = createContext<{ close: () => void } | null>(null);

function DropdownMenuProvider({ children }: { children: ReactNode }) {
  const popover = usePopover();
  return (
    <DropdownMenuContext value={{ close: () => popover.setOpen(false) }}>
      {children}
    </DropdownMenuContext>
  );
}

function DropdownMenu({
  children,
  open,
  defaultOpen,
  onOpenChange,
  positioning,
}: {
  children: ReactNode;
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
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      positioning={positioning}
    >
      <DropdownMenuProvider>{children}</DropdownMenuProvider>
    </Popover>
  );
}

function DropdownMenuTrigger(props: PopoverTriggerProps) {
  return <PopoverTrigger {...props} ariaHasPopup='menu' />;
}

type DropdownMenuContentProps = ComponentProps<'div'> & {
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  style?: CSSProperties;
};

function DropdownMenuContent({
  className,
  side: _side,
  align: _align,
  onKeyDown,
  ...props
}: DropdownMenuContentProps) {
  void _side;
  void _align;
  return (
    <PopoverContent
      {...props}
      initialFocus
      role='menu'
      data-slot='dropdown-menu-content'
      className={cn(
        'bg-surface text-foreground max-h-[var(--available-height)] min-w-32 overflow-x-hidden overflow-y-auto rounded-md p-1 outline-hidden',
        className,
      )}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
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

type DropdownMenuItemProps = Omit<ComponentProps<'button'>, 'onSelect'> & {
  value?: string;
  inset?: boolean;
  variant?: 'default' | 'destructive';
  onSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

function DropdownMenuItem({
  className,
  value: _value,
  inset,
  variant = 'default',
  onSelect,
  onClick,
  ...props
}: DropdownMenuItemProps) {
  const menu = useContext(DropdownMenuContext);
  void _value;
  return (
    <button
      {...props}
      type='button'
      role='menuitem'
      data-slot='dropdown-menu-item'
      data-inset={inset ? '' : undefined}
      data-variant={variant}
      className={cn(
        "hover:bg-hover focus:bg-hover data-[variant=destructive]:text-destructive data-[variant=destructive]:hover:bg-destructive-muted data-[variant=destructive]:focus:bg-destructive-muted data-[variant=destructive]:[&_svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none disabled:pointer-events-none disabled:text-muted-foreground data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        onSelect?.(event);
        if (!event.defaultPrevented) menu?.close();
      }}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
