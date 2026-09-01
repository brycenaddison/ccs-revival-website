/**
 * A button that asks before it acts.
 *
 * `window.confirm` was doing this job in three places. Replacing it with the raw `AlertDialog` parts
 * would have turned each of those one-line buttons into a dozen lines of composition, and three
 * hand-assembled dialogs drift — so the composition lives here once and the call sites stay a button
 * with a question attached.
 *
 * Deliberately **not** a `useConfirm()` hook returning a promise. That shape reads nicely
 * (`if (await confirm(…))`) and is the wrong model for React: the dialog has to live in the tree to be
 * portalled, focus-trapped and unmounted with its owner, and a promise-based API needs a provider at
 * the root plus imperative state that outlives the component that opened it. Rendering the trigger and
 * the dialog together is what keeps `open` owned by the thing being confirmed.
 *
 * Uses the `ui/alert-dialog` primitive rather than reimplementing it: focus trap, `Escape`, scroll
 * lock, `aria-modal` and the portal all come from Radix. See that file for why an *alert* dialog
 * specifically — no click-outside dismiss, because a destructive confirmation that closes when you
 * click the page is one somebody dismisses by accident.
 */

import type { ComponentProps, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

interface Props {
  /** The question, as a heading. Sentence case — it usually contains a name. */
  title: string;
  /** What actually happens, and anything that cannot be undone. */
  description: ReactNode;
  /** The confirming button's label. Name the action ("Remove", "Revoke"), never "OK". */
  confirmLabel: string;
  onConfirm: () => void;
  /** `destructive` for anything that removes; `default` otherwise. */
  confirmVariant?: ComponentProps<typeof Button>["variant"];
  cancelLabel?: string;
  disabled?: boolean;
  /** The trigger's own appearance. Rendered through `asChild`, so this is the button you see. */
  trigger: ReactNode;
}

export function ConfirmButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmVariant = "destructive",
  cancelLabel = "Cancel",
  disabled,
  trigger,
}: Props) {
  return (
    <AlertDialog>
      {/* `asChild` so the caller's button *is* the trigger — otherwise this would nest a button inside
          a button, which is invalid and swallows the click in some browsers. */}
      <AlertDialogTrigger asChild disabled={disabled}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Cancel first in the DOM, so it takes initial focus and `Enter` on an accidentally-opened
              dialog backs out rather than confirming. It is also what Radix's `AlertDialog` expects to
              focus by default. Visually it sits left of the action on desktop and *below* it on mobile
              — `flex-col-reverse` in the footer — which keeps the destructive button furthest from a
              thumb resting at the bottom of the screen. */}
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              confirmVariant === "destructive"
                ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
