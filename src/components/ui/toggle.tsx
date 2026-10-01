/**
 * shadcn's Toggle, on the CCS palette: one pressed state, announced with `aria-pressed`.
 *
 * Three looks. `default` is chromeless. `outline` is the bordered admin switch, where the pressed
 * item takes the brand border. `pill` is the stats filter pill, filled brand red when pressed; its
 * text is bold in both states so pressing one does not change its width and shift the row.
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { Toggle as TogglePrimitive } from "radix-ui"

const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-heading text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-text-secondary hover:bg-accent hover:text-text-bright data-[state=on]:bg-accent data-[state=on]:text-text-bright",
        outline:
          "border border-border bg-transparent text-text-bright hover:bg-accent data-[state=on]:border-brand",
        pill:
          "border border-border bg-bg2 font-bold text-text-secondary hover:text-text-bright data-[state=on]:border-brand data-[state=on]:bg-brand data-[state=on]:text-white",
      },
      size: {
        default: "h-9 min-w-9 px-3",
        sm: "h-8 min-w-8 px-3 text-xs",
        xs: "h-7 min-w-7 px-3 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
