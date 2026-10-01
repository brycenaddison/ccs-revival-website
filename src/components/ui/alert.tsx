/**
 * shadcn's Alert, on the CCS palette.
 *
 * A persistent notice inside the page: a warning that stays until its cause changes, or a failure
 * that leaves the page unusable. A failed write stays an `ErrorLine` beside the action that failed.
 * `role="alert"` is the default for the destructive variant only; an informational notice should
 * not interrupt a screen reader, so the other variants announce nothing unless the caller asks.
 *
 * `warning` is a CCS addition, in gold, for states that need attention but are not failures.
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-text",
        warning:
          "border-ccs-gold/40 bg-card text-ccs-gold *:data-[slot=alert-description]:text-text",
        destructive:
          "border-ccs-red/40 bg-card text-ccs-red *:data-[slot=alert-description]:text-ccs-red/90 [&>svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  role,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={role ?? (variant === "destructive" ? "alert" : undefined)}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 min-h-4 font-heading font-medium text-text-bright",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-text-secondary [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
