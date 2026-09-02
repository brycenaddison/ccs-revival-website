/**
 * shadcn's Checkbox, on the CCS palette.
 *
 * Radix gives it the keyboard interaction (space toggles, focus ring), `role="checkbox"` with
 * `aria-checked`, and an indeterminate state a native input cannot style. The checked fill is the
 * brand red, which is what `ACTION_PRIMARY` already uses for "on".
 */

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-border2 bg-bg-input outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-40",
        "data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-white",
        "data-[state=indeterminate]:border-brand data-[state=indeterminate]:text-brand",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
