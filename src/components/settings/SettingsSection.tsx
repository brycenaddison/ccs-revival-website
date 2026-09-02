/**
 * The frame a settings section renders inside, plus the handful of pieces sections are built from.
 *
 * Kept small on purpose. The repo has no component library — panels are `bg-bg2 border border-border
 * rounded-lg`, headings are `font-display`, labels are `LABEL_CLASS` — and every section
 * would otherwise re-derive all three from memory. These are those idioms named once.
 */

import type { ReactNode } from "react";
import { LABEL_CLASS } from "../stats/FilterBar";
import type { SettingsSection as Section } from "../../lib/settingsAreas";

/**
 * The card a section's content sits in: heading, one-line description, then the content.
 *
 * `min-w-0` is load-bearing. This is the `1fr` item of the shell's `[220px_1fr]` grid, and `1fr` means
 * `minmax(auto, 1fr)` — that `auto` floor sizes the track from the item's **min-content** width. With
 * `overflow: visible`, a wide descendant propagates its width all the way up here, widens the track past
 * the page and puts the whole layout into horizontal overflow. Any section that scrolls something
 * sideways depends on this: a child's `overflow-x-auto` can only clip against a width, and without
 * `min-w-0` the column has no definite one to give it.
 */
export function SectionFrame({ section, children }: { section: Section; children: ReactNode }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg p-5 min-w-0">
      <h2 className="font-display text-[22px] text-text-bright ">{section.label}</h2>
      {section.description && (
        <p className="text-text-secondary text-sm mt-1">{section.description}</p>
      )}
      <div className="mt-5">{children}</div>
    </div>
  );
}

/** One labeled setting. `hint` explains a constraint — why a value is read-only, most often. */
export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <label className={LABEL_CLASS}>{label}</label>
      {children}
      {hint && <p className="text-text-dim text-xs mt-1.5">{hint}</p>}
    </div>
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
 * indistinguishable from a page that's broken, and this shell ships with more of these than real
 * sections. See `API-GAP-ANALYSIS.md` for the full surface.
 */
export function ComingSoon({ needs }: { needs: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-text-dim">Not built yet.</p>
      <p className="text-text-subtle text-xs mt-2">
        Needs <span className="font-mono text-text-secondary">{needs}</span>
      </p>
    </div>
  );
}
