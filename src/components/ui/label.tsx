/**
 * shadcn's Label, on the CCS palette.
 *
 * The site's field caption: small heading-role text in the secondary color. A label beside a
 * checkbox, radio or switch reads as body text instead; `ui/field.tsx` applies that inside a
 * horizontal Field.
 */

import * as React from "react"
import { cn } from "@/lib/cn"
import { Label as LabelPrimitive } from "radix-ui"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 font-heading text-[10px] leading-none font-medium text-text-secondary select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-40 peer-disabled:cursor-not-allowed peer-disabled:opacity-40",
        className
      )}
      {...props}
    />
  )
}

export { Label }
