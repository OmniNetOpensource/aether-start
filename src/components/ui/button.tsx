import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-(--interactive-primary) focus-visible:ring-(--interactive-primary)/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-(--interactive-primary) text-(--surface-primary) hover:bg-(--interactive-primary-hover)",
        destructive:
          "bg-(--status-destructive) text-(--status-destructive-foreground) hover:bg-(--status-destructive)/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-(--status-destructive)/60",
        outline:
          "border bg-(--surface-primary) shadow-xs hover:bg-(--surface-hover) hover:text-(--text-primary) dark:bg-(--surface-muted)/30 dark:border-(--border-primary) dark:hover:bg-(--surface-muted)/50",
        secondary:
          "bg-(--surface-muted) text-(--text-primary) hover:bg-(--surface-hover)",
        ghost:
          "hover:bg-(--surface-hover) hover:text-(--text-primary) dark:hover:bg-(--surface-hover)/50",
        link:
          "text-(--interactive-primary) underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
