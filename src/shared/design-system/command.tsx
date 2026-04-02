'use client';

import * as React from 'react';
import {
  Command as CommandRoot,
  CommandDialog as CmdkCommandDialog,
  CommandEmpty as CmdkCommandEmpty,
  CommandGroup as CmdkCommandGroup,
  CommandInput as CmdkCommandInput,
  CommandItem as CmdkCommandItem,
  CommandList as CmdkCommandList,
  CommandSeparator as CmdkCommandSeparator,
} from 'cmdk';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Search } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/shared/design-system/dialog';
import { cn } from '@/shared/core/utils';

function Command({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof CommandRoot>) {
  return (
    <CommandRoot
      ref={ref}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md bg-background text-foreground',
        className,
      )}
      {...props}
    />
  );
}

/* Command is keyboard-initiated (100+ times/day) - no animation per Emil Design Engineering */
function CommandDialog({
  children,
  label = 'Command menu',
  contentClassName,
  ...props
}: React.ComponentProps<typeof CmdkCommandDialog>) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className={cn(
          'fixed top-[50%] left-[50%] w-full max-w-[calc(100vw-2rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2',
          'overflow-hidden p-0 gap-0 rounded-lg border bg-background shadow-lg sm:max-w-md',
          contentClassName,
        )}
        showCloseButton={false}
        animated={false}
      >
        <VisuallyHidden>
          <DialogTitle>{label}</DialogTitle>
        </VisuallyHidden>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof CmdkCommandInput>) {
  return (
    <div className='flex items-center border-b border-border px-3' cmdk-input-wrapper=''>
      <Search className='mr-2 h-4 w-4 shrink-0 text-secondary' />
      <CmdkCommandInput
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof CmdkCommandList>) {
  return (
    <CmdkCommandList
      ref={ref}
      className={cn('max-h-72 overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  );
}

function CommandEmpty({
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof CmdkCommandEmpty>) {
  return (
    <CmdkCommandEmpty
      ref={ref}
      className='py-6 text-center text-sm text-muted-foreground'
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof CmdkCommandGroup>) {
  return (
    <CmdkCommandGroup
      ref={ref}
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof CmdkCommandSeparator>) {
  return (
    <CmdkCommandSeparator
      ref={ref}
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof CmdkCommandItem>) {
  return (
    <CmdkCommandItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-hover data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
      {...props}
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
