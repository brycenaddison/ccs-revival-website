/**
 * shadcn's Badge, on the CCS palette: a read-only tag such as a site role, a grant's scope or a
 * record's state.
 *
 * CCS badges are outlined rather than filled, at caption size in the heading role. `default` carries
 * a brand edge for something held or active; `muted` is for an absent, inherited or secondary state.
 * Data-derived colors (scenario tones, team colors) stay with their own components.
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 font-heading text-[10px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-brand/50 text-text-bright [a&]:hover:bg-accent",
        muted: "border-border text-text-dim [a&]:hover:bg-accent",
        secondary: "border-transparent bg-bg3 text-text-secondary [a&]:hover:bg-accent",
        destructive: "border-ccs-red/40 text-ccs-red [a&]:hover:bg-ccs-red/10",
        outline: "border-border text-text [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "border-transparent [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "border-transparent text-brand underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
