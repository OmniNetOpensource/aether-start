import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/shared/core/utils';

function TooltipProvider({
  delayDuration = 400,
  skipDelayDuration = 500,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot='tooltip-provider'
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipPortal = TooltipPrimitive.Portal;

function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Content
      sideOffset={sideOffset}
      data-slot='tooltip-content'
      className={cn(
        'z-(--z-tooltip) max-w-sm rounded-md border bg-(--surface-secondary) px-3 py-2 text-xs text-(--text-primary) shadow-md',
        'transition-[transform,opacity] duration-[125ms] ease-[var(--ease-out)] origin-[var(--radix-tooltip-content-transform-origin)]',
        'data-[state=delayed-open]:opacity-100 data-[state=delayed-open]:scale-100',
        'data-[state=closed]:opacity-0 data-[state=closed]:scale-[0.97]',
        className,
      )}
      {...props}
    />
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipPortal, TooltipContent };
