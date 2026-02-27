"use client"

import * as React from "react"
import {
  Command as CommandRoot,
  CommandDialog as CmdkCommandDialog,
  CommandEmpty as CmdkCommandEmpty,
  CommandGroup as CmdkCommandGroup,
  CommandInput as CmdkCommandInput,
  CommandItem as CmdkCommandItem,
  CommandList as CmdkCommandList,
  CommandSeparator as CmdkCommandSeparator,
} from "cmdk"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

const Command = React.forwardRef<
  React.ElementRef<typeof CommandRoot>,
  React.ComponentPropsWithoutRef<typeof CommandRoot>
>(({ className, ...props }, ref) => (
  <CommandRoot
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-md bg-(--surface-primary) text-(--text-primary)",
      className
    )}
    {...props}
  />
))
Command.displayName = "Command"

const CommandDialog = ({
  children,
  ...props
}: React.ComponentProps<typeof CmdkCommandDialog>) => (
  <CmdkCommandDialog
    contentClassName={cn(
      "fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100vw-2rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2",
      "overflow-hidden p-0 gap-0 rounded-lg border bg-(--surface-primary) shadow-lg",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-md"
    )}
    overlayClassName="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    {...props}
  >
    {children}
  </CmdkCommandDialog>
)

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CmdkCommandInput>,
  React.ComponentPropsWithoutRef<typeof CmdkCommandInput>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-(--border-primary) px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CmdkCommandInput
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-(--text-tertiary) disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  </div>
))
CommandInput.displayName = "CommandInput"

const CommandList = React.forwardRef<
  React.ElementRef<typeof CmdkCommandList>,
  React.ComponentPropsWithoutRef<typeof CmdkCommandList>
>(({ className, ...props }, ref) => (
  <CmdkCommandList
    ref={ref}
    className={cn("max-h-72 overflow-y-auto overflow-x-hidden", className)}
    {...props}
  />
))
CommandList.displayName = "CommandList"

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CmdkCommandEmpty>,
  React.ComponentPropsWithoutRef<typeof CmdkCommandEmpty>
>((props, ref) => (
  <CmdkCommandEmpty
    ref={ref}
    className="py-6 text-center text-sm text-(--text-tertiary)"
    {...props}
  />
))
CommandEmpty.displayName = "CommandEmpty"

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CmdkCommandGroup>,
  React.ComponentPropsWithoutRef<typeof CmdkCommandGroup>
>(({ className, ...props }, ref) => (
  <CmdkCommandGroup
    ref={ref}
    className={cn(
      "overflow-hidden p-1 text-(--text-primary) [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-(--text-tertiary)",
      className
    )}
    {...props}
  />
))
CommandGroup.displayName = "CommandGroup"

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CmdkCommandSeparator>,
  React.ComponentPropsWithoutRef<typeof CmdkCommandSeparator>
>(({ className, ...props }, ref) => (
  <CmdkCommandSeparator
    ref={ref}
    className={cn("-mx-1 h-px bg-(--border-primary)", className)}
    {...props}
  />
))
CommandSeparator.displayName = "CommandSeparator"

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CmdkCommandItem>,
  React.ComponentPropsWithoutRef<typeof CmdkCommandItem>
>(({ className, ...props }, ref) => (
  <CmdkCommandItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-(--surface-hover) data-[selected=true]:text-(--text-primary) [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      className
    )}
    {...props}
  />
))
CommandItem.displayName = "CommandItem"

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "ml-auto text-xs tracking-widest text-(--text-tertiary)",
      className
    )}
    {...props}
  />
)
CommandShortcut.displayName = "CommandShortcut"

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
}
