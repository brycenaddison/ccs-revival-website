/**
 * The frame a settings section renders inside, plus the handful of pieces sections are built from.
 *
 * Kept small on purpose: these compose the shared `ui/` primitives (Card, Field) into the shapes
 * every settings, admin and applicant form repeats, so a section never re-derives them.
 */

import { useId, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "../../lib/cn";
import type { SettingsSection as Section } from "../../lib/settingsAreas";

/**
 * The card a section's content sits in: heading, one-line description, then the content.
 *
 * `min-w-0` (from Card, and on the shell's column around it) is load-bearing. A flex or grid item
 * otherwise sizes from its **min-content** width: with `overflow: visible`, a wide descendant
 * propagates its width up here, widens the column past the page and puts the whole layout into
 * horizontal overflow. Any section that scrolls something sideways depends on it.
 */
export function SectionFrame({ section, children }: { section: Section; children: ReactNode }) {
  return (
    <Card className="gap-5 py-5">
      <CardHeader className="px-5">
        <h2 className="font-display text-[22px] text-text-bright">{section.label}</h2>
        {section.description && (
          <CardDescription className="text-sm text-text-secondary">{section.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

/** The props a row hands its one control, so the label, hint and error are wired to it. */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * One labeled setting. `hint` explains a constraint (why a value is read-only, most often); `error`
 * is a validation message for this field.
 *
 * Give a single control a real label by passing a function: it receives the `id`,
 * `aria-describedby` and `aria-invalid` to spread onto the control. Other content (a checkbox
 * group, a read-only value, an upload) is passed as ordinary children, and the label names the row
 * as a group instead.
 */
export function SettingsRow({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const labelId = `${id}-label`;
  const isControl = typeof children === "function";

  return (
    <Field
      data-invalid={error ? true : undefined}
      aria-labelledby={isControl ? undefined : labelId}
      className={cn("mb-5 last:mb-0", className)}
    >
      {isControl ? (
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
      ) : (
        <FieldLabel asChild>
          <span id={labelId}>{label}</span>
        </FieldLabel>
      )}
      {/* A wrapper, so Field's full-width rule applies to it rather than to a button or chip. */}
      <div className="min-w-0">
        {isControl
          ? children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })
          : children}
      </div>
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}

/**
 * A value the API exposes but offers no way to change.
 *
 * Deliberately not a disabled `<input>`: a grayed-out text box reads as "editable, but not right
 * now" and invites the user to look for the thing that unlocks it. This reads as information.
 */
export function ReadOnlyValue({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <div
      className={`bg-bg3 border border-border rounded-md px-3 py-2 text-text ${
        mono ? "font-mono text-xs break-all" : "text-sm"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * A section whose UI is waiting on an endpoint.
 *
 * `needs` is required rather than optional: a placeholder that doesn't say what unblocks it is
 * indistinguishable from a page that's broken.
 */
export function ComingSoon({ needs }: { needs: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Not built yet.</EmptyTitle>
        <EmptyDescription>
          Needs <span className="font-mono text-text-secondary">{needs}</span>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
