/**
 * shadcn's AlertDialog, on the CCS palette.
 *
 * An *alert* dialog rather than a plain one, and the distinction is the whole reason this replaced
 * `window.confirm`: it is modal by construction, it has no close button and no click-outside dismiss,
 * and it moves focus to the safe action. That is what a destructive confirmation needs — a dialog you
 * can dismiss by clicking the page is a dialog somebody dismisses by accident.
 *
 * Radix carries the parts that are genuinely hard: focus trap and restore, `Escape`, scroll lock,
 * `aria-modal` with the title and description wired to it, and rendering into a portal so a dialog
 * opened from inside an `overflow: hidden` card is not clipped by it. Hand-rolling those is how you end
 * up with a modal that a screen reader reads the page behind.
 *
 * Copy-paste from shadcn's docs works against this file: the parts are named and composed exactly as
 * theirs are, and the classes reference the token aliases in `index.css`. The two deliberate
 * departures are noted where they occur — the overlay tint, and `Cancel` carrying focus.
 */

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
import { buttonVariants } from "./button";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export function AlertDialogOverlay({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        // `--overlay` rather than shadcn's `bg-black/50`: this app already defines the scrim per theme
        // (near-opaque on the near-black page, 50% on the light one), and a flat black would wash out
        // in light mode.
        "fixed inset-0 z-[300] bg-[var(--overlay)] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogContent({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[301] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-lg border border-border bg-card p-5 shadow-[0_16px_48px_rgba(0,0,0,0.6)]",
          "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      // The site's section-heading treatment, so a dialog reads as part of the page rather than as a
      // component from somewhere else. Callers pass sentence-case text; nothing here uppercases it,
      // because a name inside the sentence ("Remove Gl4cial?") must not be shouted.
      className={cn("font-display text-[22px] tracking-widest text-text-bright", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-sm text-text-secondary", className)}
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return <AlertDialogPrimitive.Action className={cn(buttonVariants(), className)} {...props} />;
}

export function AlertDialogCancel({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}
