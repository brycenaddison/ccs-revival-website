/**
 * shadcn's Textarea, on the CCS palette. The same surface as `input.tsx`.
 *
 * Markdown bodies use `content/MarkdownEditor.tsx`; this is for plain multi-line text.
 */

import * as React from "react"
import { cn } from "@/lib/cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-bg2 px-3 py-2 font-body text-base text-text transition-colors outline-none placeholder:text-text-muted focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
