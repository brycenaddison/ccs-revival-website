/**
 * shadcn's Spinner: an indeterminate wait, announced as a status. Pass `aria-label` when the wait has
 * a more useful name than "Loading".
 */

import { cn } from "@/lib/cn"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin text-text-muted", className)}
      {...props}
    />
  )
}

export { Spinner }
