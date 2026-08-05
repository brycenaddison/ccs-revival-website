/**
 * The handful of idioms the two admin sections share.
 *
 * Same reasoning as `settings/SettingsSection.tsx`: the repo has no component library, so the
 * button and the failure line would otherwise be re-derived from memory in each file and drift.
 * Anything used by only one section stays in that section.
 */

import type { ReactNode } from "react";

const ACTION_BASE =
  "inline-flex items-center gap-2 rounded-md border px-4 py-2 bg-transparent font-heading text-sm tracking-wider uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

/** A secondary action — cancel, page, deselect. */
export const ACTION = `${ACTION_BASE} border-border text-text-bright`;

/** The one action a panel is for: save, create, grant. */
export const ACTION_PRIMARY = `${ACTION_BASE} border-accent text-text-bright`;

/** Destructive, and irreversible from this page: revoking a grant drops its `granted_at`. */
export const ACTION_DANGER = `${ACTION_BASE} border-ccs-red/40 text-ccs-red`;

/** Smaller variants, for actions that sit inside a row rather than under a form. */
export const ACTION_SM = `${ACTION} px-3 py-1.5 text-xs`;
export const ACTION_SM_PRIMARY = `${ACTION_PRIMARY} px-3 py-1.5 text-xs`;
export const ACTION_SM_DANGER = `${ACTION_DANGER} px-3 py-1.5 text-xs`;

/**
 * Chromeless, for the actions that sit beside a section label.
 *
 * A bordered button next to a `LABEL_CLASS` heading reads as the point of the section, and these are
 * not — they open a form or re-run a lookup. Same weight as the label they sit with, so the row is a
 * heading with affordances rather than a toolbar.
 *
 * Split in two because the colour is the part a caller overrides — a copy button goes green for a
 * moment when it lands. Appending `text-ccs-green` to a class string that already carries
 * `text-text-dim` is a coin flip: both are the same property at the same specificity, so the winner
 * is whichever Tailwind emitted last, not whichever came last in the attribute.
 */
export const ACTION_QUIET_BASE =
  "inline-flex items-center gap-1.5 bg-transparent border-none p-0 font-heading text-[10px] tracking-wider uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

export const ACTION_QUIET = `${ACTION_QUIET_BASE} text-text-dim hover:text-text-bright`;

/**
 * A failed write, shown where the action was rather than as a toast.
 *
 * The API's messages are written to be read (`conf must be 1-3 lowercase letters or digits`,
 * `A league with conf "ccs" already exists`), so they are surfaced verbatim instead of being
 * mapped to something vaguer.
 */
export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-ccs-red text-sm mt-3">
      {message}
    </p>
  );
}

/** A read-only tag: a site role, or a scope a grant carries. */
export function Pill({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 font-heading text-[10px] tracking-wider uppercase ${
        muted ? "border-border text-text-dim" : "border-accent/50 text-text-bright"
      }`}
    >
      {children}
    </span>
  );
}
