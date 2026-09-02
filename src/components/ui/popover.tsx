/**
 * shadcn's Popover, on the CCS palette.
 *
 * A non-modal floating panel anchored to its trigger: Radix positions it, flips it at the viewport
 * edge, closes it on `Escape` and on a click outside, returns focus to the trigger, and portals it so a
 * panel opened inside an `overflow-hidden` card is not clipped.
 */

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-[305] w-72 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-popover outline-none",
          "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
