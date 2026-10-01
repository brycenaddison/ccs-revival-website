/**
 * A centered dialog that holds a short form: a title, what the action does, fields, then actions.
 *
 * `ConfirmButton` covers a yes/no question; this is for confirmations that need input first (an
 * audit reason, a preview to review). Built on the shared `ui/dialog` wrapper, which leaves geometry
 * to callers, with the same centered card, heading face and layer as the alert dialog so the two
 * read as one family. Controlled, because the caller decides when it opens (a menu item) and when a
 * finished request closes it.
 */

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function FormDialog({ open, onOpenChange, title, description, children, footer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** The actions, Cancel first in the DOM so it takes focus before a destructive button. */
  footer: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-5 data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out">
        <DialogTitle className="font-display text-[22px] font-normal leading-tight text-text-bright">{title}</DialogTitle>
        {description && <DialogDescription className="mt-2 text-sm text-text-secondary">{description}</DialogDescription>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
      </DialogContent>
    </Dialog>
  );
}
