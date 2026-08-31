import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { Search } from '@/frontend/design-system/icons';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/design-system/dialog';
import { cn } from '@/shared/core/utils';

const CommandContext = createContext<{
  value: string;
  onValueChange?: (value: string) => void;
}>({ value: '' });

type CommandProps = ComponentProps<'div'> & {
  shouldFilter?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
};

function Command({
  className,
  shouldFilter: _shouldFilter,
  value = '',
  onValueChange,
  ...props
}: CommandProps) {
  void _shouldFilter;
  return (
    <CommandContext value={{ value, onValueChange }}>
      <div
        {...props}
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded-md bg-background text-foreground',
          className,
        )}
      />
    </CommandContext>
  );
}

function CommandDialog(props: {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
  contentClassName?: string;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className={cn(
          'fixed top-[50%] left-[50%] w-full max-w-[calc(100vw-2rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2',
          'overflow-hidden p-0 gap-0 rounded-lg border bg-background shadow-lg sm:max-w-md',
          props.contentClassName,
        )}
        showCloseButton={false}
        animated={false}
      >
        <DialogTitle className='sr-only'>{props.label ?? 'Command menu'}</DialogTitle>
        {props.children}
      </DialogContent>
    </Dialog>
  );
}

type CommandInputProps = ComponentProps<'input'> & {
  onValueChange?: (value: string) => void;
};

function CommandInput({ className, onInput, onValueChange, ...props }: CommandInputProps) {
  return (
    <div className='flex items-center border-b border-border px-3' cmdk-input-wrapper=''>
      <Search className='mr-2 h-4 w-4 shrink-0 text-secondary' />
      <input
        {...props}
        className={cn(
          'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
          className,
        )}
        onInput={(event) => {
          onInput?.(event);
          onValueChange?.(event.currentTarget.value);
        }}
      />
    </div>
  );
}

function CommandList({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('max-h-72 overflow-y-auto overflow-x-hidden', className)} />;
}

function CommandEmpty({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props} className={cn('py-6 text-center text-sm text-muted-foreground', className)} />
  );
}

function CommandGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('overflow-hidden p-1 text-foreground', className)} />;
}

function CommandSeparator({ className, ...props }: ComponentProps<'hr'>) {
  return <hr {...props} className={cn('-mx-1 h-px bg-border', className)} />;
}

type CommandItemProps = Omit<ComponentProps<'button'>, 'onSelect' | 'value'> & {
  value: string;
  onSelect?: () => void;
};

function CommandItem({ className, value, onSelect, ...props }: CommandItemProps) {
  const command = useContext(CommandContext);
  return (
    <button
      {...props}
      type='button'
      data-selected={command.value === value}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-hover data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      onPointerMove={() => command.onValueChange?.(value)}
      onClick={onSelect}
    />
  );
}

function CommandShortcut({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      {...props}
      className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
