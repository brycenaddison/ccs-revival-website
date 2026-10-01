/**
 * A hover-and-focus hint on one control, in place of a `title` attribute.
 *
 * The Radix tooltip opens on keyboard focus as well as hover, closes on Escape and is announced
 * through `aria-describedby`, none of which a `title` does. The child must be a single focusable
 * element (a Button, a link) because the trigger renders through `asChild`. An icon-only control
 * still needs its own `aria-label`; the hint describes it, it does not name it.
 */

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TooltipHint({
  content,
  side,
  children,
}: {
  content: ReactNode;
  side?: ComponentProps<typeof TooltipContent>["side"];
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}
