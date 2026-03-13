import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-ring selection:text-foreground dark:bg-(--surface-muted) border-border h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed md:text-sm",
        "focus-visible:border-ring focus-visible:ring-(--interactive-primary) focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive dark:aria-invalid:ring-destructive aria-invalid:border-(--status-destructive)",
        className
      )}
      {...props}
    />
  )
}

export { Input }
