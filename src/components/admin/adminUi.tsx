/**
 * The handful of idioms the two admin sections share.
 *
 * Same reasoning as `settings/SettingsSection.tsx`: the repo has no component library, so the
 * button and the failure line would otherwise be re-derived from memory in each file and drift.
 * Anything used by only one section stays in that section.
 */

import type { ReactNode } from "react";
import type { Tournament } from "../../lib/api";
import { teamGradient } from "../../lib/teamStyle";
import { fmtDay } from "../../lib/utils";
import { TeamStyleHeader } from "../TeamBadge";

const ACTION_BASE =
  "inline-flex items-center gap-2 rounded-md border px-4 py-2 bg-transparent font-heading font-medium text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

/** A secondary action — cancel, page, deselect. */
export const ACTION = `${ACTION_BASE} border-border text-text-bright`;

/** The one action a panel is for: save, create, grant. */
export const ACTION_PRIMARY = `${ACTION_BASE} border-brand text-text-bright`;

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
 * Split in two because the color is the part a caller overrides — a copy button goes green for a
 * moment when it lands. Appending `text-ccs-green` to a class string that already carries
 * `text-text-dim` is a coin flip: both are the same property at the same specificity, so the winner
 * is whichever Tailwind emitted last, not whichever came last in the attribute.
 */
export const ACTION_QUIET_BASE =
  "inline-flex items-center gap-1.5 bg-transparent border-none p-0 font-heading font-medium text-[10px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

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
      className={`inline-block rounded-full border px-2.5 py-0.5 font-heading text-[10px] ${
        muted ? "border-border text-text-dim" : "border-brand/50 text-text-bright"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * A team color: the native swatch, with its hex beside it as a caption.
 *
 * Shared rather than local because two forms set the same two columns — the applicant's team
 * details and League Admin → Teams — and a swatch that looked different depending on which side of
 * publication you were on would read as two different fields.
 *
 * Controlled on a `#rrggbb` string, which is what `<input type="color">` speaks. The integer the
 * column holds is `intFromHex`'s job, including the pure-black nudge; nothing here knows about it.
 */
export function ColorField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        id={id}
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-14 shrink-0 cursor-pointer rounded border border-border bg-bg2"
      />
      <span className="font-mono text-xs text-text-secondary">{value}</span>
    </div>
  );
}

/**
 * What the two colors will look like on the site, drawn while they are being chosen.
 *
 * It is the header of a team card on the Teams tab, drawn by `TeamStyleHeader`: the gradient from
 * `lib/teamStyle.ts`, the logo (or the initial, when there is none) on its translucent well inside
 * the gradient, and the name and tag in white beside it. That card is the largest thing the pair is
 * ever painted on, so it is where a bad pairing shows first. A preview that shows something other
 * than what ships is worse than none, which is why the markup is shared rather than copied.
 *
 * Takes hex strings because it sits beside two `ColorField`s, which speak hex; it never sees the
 * integer column. Shared for the same reason `ColorField` is: two forms set the same pair.
 */
export function TeamStylePreview({
  name,
  code,
  logo,
  primary,
  secondary,
}: {
  name: string;
  code: string;
  logo: string;
  primary: string;
  secondary: string;
}) {
  const shownName = name.trim() === "" ? "Your team" : name.trim();
  const shownCode = code.trim() === "" ? "TAG" : code.trim();
  const logoUrl = logo.trim();
  return (
    <div className="overflow-hidden rounded-lg">
      <TeamStyleHeader
        name={shownName}
        code={shownCode}
        logo={logoUrl === "" ? null : logoUrl}
        background={teamGradient(primary, secondary)}
        label="Team style preview"
      />
    </div>
  );
}

/**
 * A one-line summary of where a league is in its lifecycle, for the admin pickers.
 *
 * Worth spelling out rather than leaving to three flags: "hidden" and "live" are the two states an
 * admin is actually looking for, and a hidden league with intake open is the state the whole
 * upcoming-season workflow exists to support. Absent flags contribute nothing — an older deployment
 * omits them, and inventing "hidden" from a missing `listed` would relabel every existing season.
 *
 * Shared by League Admin's own picker and the grant picker under Roles, which both list leagues from
 * `GET /admin/leagues` and both have to say which of them the public cannot see yet. Two spellings of
 * "hidden" across two pickers over the same rows is the drift this module exists to prevent.
 */
export function stateNote(t: Tournament): string {
  const notes: string[] = [];
  if (t.listed === false) notes.push("hidden");
  if (t.applicationsOpen === true) notes.push("intake open");
  if (t.active === true) notes.push("live");
  if (t.teamsPublishedAt) notes.push(`published ${fmtDay(t.teamsPublishedAt)}`);
  return notes.length === 0 ? "" : ` · ${notes.join(" · ")}`;
}
