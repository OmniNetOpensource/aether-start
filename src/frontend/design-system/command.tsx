import { createContext, omit, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Search } from '@/frontend/design-system/icons';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/design-system/dialog';
import { cn } from '@/shared/core/utils';

const CommandContext = createContext<{
  value: Accessor<string>;
  onValueChange?: (value: string) => void;
}>({ value: () => '' });

type CommandProps = JSX.HTMLAttributes<HTMLDivElement> & {
  shouldFilter?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
};

function Command(props: CommandProps) {
  return (
    <CommandContext value={{ value: () => props.value ?? '', onValueChange: props.onValueChange }}>
      <div
        {...omit(props, 'class', 'shouldFilter', 'value', 'onValueChange', 'children')}
        class={cn(
          'flex h-full w-full flex-col overflow-hidden rounded-md bg-background text-foreground',
          props.class,
        )}
      >
        {props.children}
      </div>
    </CommandContext>
  );
}

function CommandDialog(props: {
  children?: JSX.Element;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
  contentClassName?: string;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        class={cn(
          'fixed top-[50%] left-[50%] w-full max-w-[calc(100vw-2rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2',
          'overflow-hidden p-0 gap-0 rounded-lg border bg-background shadow-lg sm:max-w-md',
          props.contentClassName,
        )}
        showCloseButton={false}
        animated={false}
      >
        <DialogTitle class='sr-only'>{props.label ?? 'Command menu'}</DialogTitle>
        {props.children}
      </DialogContent>
    </Dialog>
  );
}

type CommandInputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'onInput'> & {
  onValueChange?: (value: string) => void;
};

function CommandInput(props: CommandInputProps) {
  return (
    <div class='flex items-center border-b border-border px-3' cmdk-input-wrapper=''>
      <Search class='mr-2 h-4 w-4 shrink-0 text-secondary' />
      <input
        {...omit(props, 'class', 'onValueChange')}
        class={cn(
          'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
          props.class,
        )}
        onInput={(event) => props.onValueChange?.(event.currentTarget.value)}
      />
    </div>
  );
}

function CommandList(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...omit(props, 'class', 'children')}
      class={cn('max-h-72 overflow-y-auto overflow-x-hidden', props.class)}
    >
      {props.children}
    </div>
  );
}

function CommandEmpty(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...omit(props, 'class', 'children')}
      class={cn('py-6 text-center text-sm text-muted-foreground', props.class)}
    >
      {props.children}
    </div>
  );
}

function CommandGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...omit(props, 'class', 'children')}
      class={cn('overflow-hidden p-1 text-foreground', props.class)}
    >
      {props.children}
    </div>
  );
}

function CommandSeparator(props: JSX.HTMLAttributes<HTMLHRElement>) {
  return <hr {...props} class={cn('-mx-1 h-px bg-border', props.class)} />;
}

type CommandItemProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
  onSelect?: () => void;
};

function CommandItem(props: CommandItemProps) {
  const command = useContext(CommandContext);
  return (
    <button
      {...omit(props, 'class', 'value', 'onSelect', 'children')}
      type='button'
      data-selected={command.value() === props.value}
      class={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-hover data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
      onPointerMove={() => command.onValueChange?.(props.value)}
      onClick={props.onSelect}
    >
      {props.children}
    </button>
  );
}

function CommandShortcut(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...omit(props, 'class', 'children')}
      class={cn('ml-auto text-xs tracking-widest text-muted-foreground', props.class)}
    >
      {props.children}
    </span>
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
