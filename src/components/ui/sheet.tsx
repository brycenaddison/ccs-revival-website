/**
 * shadcn's Sheet, on the CCS palette: a dialog that slides in from an edge.
 *
 * Built on Radix Dialog, so it is modal, focus-trapped, dismissable with `Escape` and a click on the
 * scrim, portalled, and announced with its title. The one departure from shadcn's template is the
 * scrim, which is `--overlay` for the reason `alert-dialog.tsx` gives.
 */

import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

export function SheetOverlay({ className, ...props }: ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-[300] bg-[var(--overlay)] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
        className,
      )}
      {...props}
    />
  );
}

type Side = "left" | "right";

const SIDE_CLASS: Record<Side, string> = {
  right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right",
  left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-[state=open]:animate-sheet-in-left data-[state=closed]:animate-sheet-out-left",
};

export function SheetContent({
  side = "right",
  className,
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & { side?: Side }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-[301] flex flex-col gap-4 overflow-y-auto border-border bg-card p-5 shadow-dialog",
          SIDE_CLASS[side],
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-3 top-3 rounded-sm text-text-muted opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn("font-display text-[22px] text-text-bright", className)}
      {...props}
    />
  );
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-sm text-text-secondary", className)} {...props} />;
}
