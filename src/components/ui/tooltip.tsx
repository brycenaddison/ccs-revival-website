/**
 * shadcn's Tooltip, on the CCS palette.
 *
 * Radix carries the parts a hover title cannot: it opens on focus as well as hover, so a keyboard user
 * reaches it; it closes on `Escape`; it is portalled, so a tooltip on an item icon inside an
 * `overflow-hidden` scoreboard row is not clipped by the row; and it is announced through
 * `aria-describedby`. The `title` attribute does none of that and cannot hold formatted text.
 *
 * One `TooltipProvider` wraps the page that uses these (the match viewer), so the open delay is shared
 * and moving between two icons does not re-wait it. Copy-paste from shadcn's docs works against this
 * file; the parts are named as theirs are.
 */

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          // `z-[310]`: above the alert dialog's content (`z-[301]`), because a tooltip can open on a
          // control inside one. `bg-popover` is `--bg2`, so on the near-black page a border is what
          // separates it from the content behind.
          "z-[310] max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-popover",
          "data-[state=delayed-open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
