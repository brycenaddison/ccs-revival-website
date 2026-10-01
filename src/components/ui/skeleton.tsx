/**
 * shadcn's Skeleton: the shape of content that is still loading. Use it where the loaded layout is
 * known, so the page does not jump when the data lands; a short wait in a small area is a Spinner.
 */

import { cn } from "@/lib/cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-bg3", className)}
      {...props}
    />
  )
}

export { Skeleton }
