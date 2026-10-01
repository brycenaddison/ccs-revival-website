/**
 * The handful of idioms the two admin sections share.
 *
 * Same reasoning as `settings/SettingsSection.tsx`: the back button and the failure line would
 * otherwise be re-derived in each file and drift.
 * Anything used by only one section stays in that section.
 */

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { Tournament } from "../../lib/api";
import { teamGradient } from "../../lib/teamStyle";
import { fmtDay } from "../../lib/utils";
import { TeamStyleHeader } from "../TeamBadge";
import { Button } from "@/components/ui/button";

/**
 * Back out of a drilled-in view inside a panel (an article editor, one phase of a season).
 *
 * A small outlined Button rather than the page-level `BackLink`: it closes local state within the
 * section instead of leaving the page, and it sits in a heading row beside what it closes.
 */
export function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <ArrowLeft size={13} aria-hidden="true" />
      {children}
    </Button>
  );
}

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

/**
 * One color control for team creation/editing, applications, and admin imports.
 *
 * The shadcn popover emits `#rrggbb`. The integer conversion and pure-black nudge remain the
 * API layer's `intFromHex` responsibility.
 */
export { ColorPicker as ColorField } from "@/components/ui/color-picker";

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
