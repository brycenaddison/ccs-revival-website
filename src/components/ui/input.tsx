/**
 * shadcn's Input, on the CCS palette.
 *
 * The field surface every form shares: `bg-bg2` with a border that turns brand red on focus. Text is
 * 16px below `md` so iOS does not zoom the page when the field takes focus. `inputVariants` is the
 * same class list for an input a library renders itself, such as the color picker's hex field.
 */

import * as React from "react"
import { cn } from "@/lib/cn"

function inputVariants(className?: string) {
  return cn(
    "h-9 w-full min-w-0 rounded-md border border-input bg-bg2 px-3 py-1 font-body text-base text-text transition-colors outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 md:text-sm",
    "focus-visible:border-ring",
    "aria-invalid:border-destructive",
    className
  )
}

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={inputVariants(className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
