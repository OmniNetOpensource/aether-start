import * as React from "react"

import { cn } from "@/lib/utils"

const supportsFieldSizing =
  typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight}px`
}

function Textarea({ className, onChange, ref, ...props }: React.ComponentProps<"textarea">) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    if (!supportsFieldSizing && innerRef.current) {
      autoResize(innerRef.current)
    }
  })

  return (
    <textarea
      ref={(el) => {
        innerRef.current = el
        if (typeof ref === "function") ref(el)
        else if (ref) ref.current = el
      }}
      data-slot="textarea"
      className={cn(
        "border-border placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-(--interactive-primary)/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-md border bg-(--surface-muted) px-3 py-2 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      onChange={(e) => {
        if (!supportsFieldSizing) autoResize(e.currentTarget)
        onChange?.(e)
      }}
      {...props}
    />
  )
}

export { Textarea }
