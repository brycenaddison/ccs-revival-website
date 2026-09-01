/**
 * How a team's two colors become CSS.
 *
 * Every team surface on the site — the badge, a team card's header, a leader's avatar, the team page
 * banner — is one 135° gradient. Until `colorSecondary` existed its second stop was invented: the
 * primary lightened toward white (`lighten`), a little less when the team had no color at all so the
 * neutral fallback still had some depth. Teams now choose that stop themselves through the
 * application form, so this module is the one place that decides which of the two the site draws.
 *
 * Three rules, and they are why this is not a template string in each component:
 *
 *  - **The secondary is used only when the primary is set.** A team with no primary renders the
 *    neutral gray fallback, and grading that gray into a chosen secondary would make the fallback
 *    look like a decision the team made.
 *  - **An unset secondary keeps the old derivation.** `colorSecondary` is absent on the reads that
 *    predate the column and `null` on every team that has never set one, and both have to look
 *    exactly as they did before the column existed — the derived stop is what kept a badge legible
 *    with no data at all. `0` is unset here for the same reason it is on `color`: `intFromHex`
 *    nudges a genuine black to `#010101`, so a stored `0` was never chosen.
 *  - **Same recipe everywhere.** The primary holds through the first part of the run so whatever is
 *    written over it — the initial in a badge, the name on a team card — sits on the color the team
 *    chose rather than on the blend, and the secondary owns the far corner. `TeamBadge` and the form
 *    preview both draw this, which is how an applicant sees what the site will render.
 *
 * Inline `style` rather than a utility, for the reason `TeamBadge` always gave: these are values off
 * the wire, so there is no `@theme` token for them and Tailwind cannot express them.
 */

import { hexFromInt, lighten } from "./api";

/** The color columns every team-shaped read carries — `colorSecondary` optionally, see above. */
export interface TeamColors {
  color: number | null;
  colorHex: string;
  colorSecondary?: number | null;
}

/**
 * The secondary the team actually chose, as CSS hex, or `undefined` when it has none to show.
 *
 * For the surfaces that have their own fallback and should keep it: the stat bars fade the primary
 * out to transparent when there is no second color, which is a different look from the lightened
 * stop a badge derives, and it should stay that way for a team that never picked one.
 */
export function secondaryHex(team: TeamColors): string | undefined {
  const unset = team.color === null || team.color === 0;
  const secondary = team.colorSecondary ?? null;
  return !unset && secondary !== null && secondary !== 0 ? hexFromInt(secondary) : undefined;
}

/** The gradient's second stop as CSS hex: the chosen secondary, or the derived one. */
export function accentHex(team: TeamColors): string {
  const unset = team.color === null || team.color === 0;
  return secondaryHex(team) ?? lighten(team.colorHex, unset ? 0.25 : 0.35);
}

/**
 * The gradient two resolved hex colors make, as a CSS `background` value.
 *
 * Takes hex rather than a team so the color forms can draw the pair being chosen before it is saved
 * anywhere. Everything already on the wire goes through `teamGradientFor`.
 */
export function teamGradient(primaryHex: string, accentHex: string): string {
  return `linear-gradient(135deg, ${primaryHex} 0%, ${primaryHex} 40%, ${accentHex} 100%)`;
}

export function teamGradientFor(team: TeamColors): string {
  return teamGradient(team.colorHex, accentHex(team));
}
