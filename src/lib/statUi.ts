/**
 * Constants shared by every stats surface.
 *
 * Each of these was declared two or three times across the stats components, and they had already
 * started to drift: the medal palette existed as both `PLACE_COLORS` and `RANK_COLORS`, and the role
 * filter list was rebuilt in three files. One home means one answer.
 */

import { ROLE_ORDER, type Role } from "./api";

/** Gold, silver, bronze — the top three of any ranked list. */
export const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

/** Distinct colors for the compare slots, so a radar shape maps to a card without a legend lookup. */
export const COMPARE_COLORS = ["#d20708", "#d7a52a", "#4c9aff"];

/**
 * Minimum-games floors for the player leaderboard.
 *
 * No zero option: a `playerstats` row cannot have zero games, so it would never remove anything. The
 * leaderboard defaults to 5 rather than to the floor, because a one-game player at the top of a
 * leaderboard is noise — the same small-sample problem that retired the champion "best" tiles.
 */
export const MIN_GAMES_OPTIONS = [1, 3, 5, 8, 10];

/**
 * Minimum-picks floors for the champion table, which *does* need a zero.
 *
 * `championstats` comes from a FULL JOIN, so a champion banned every game and never picked arrives
 * with `games: 0` — one of the more interesting rows in a split. A floor of 1 would hide exactly the
 * champions the split respected most, so the default is 0 and the filter starts out inert.
 */
export const MIN_PICKS_OPTIONS = [0, 1, 3, 5, 8, 10];

/** Single-select role filter options, "ALL" first. `roleLabel` passes "ALL" through unchanged. */
export const ROLE_FILTERS: readonly (Role | "ALL")[] = ["ALL", ...ROLE_ORDER];

/**
 * Bar fill ramp, worst to best.
 *
 * The old site's bars looked colorful because `public/stats.html` carried a hardcoded per-team
 * palette; since bars sort by value, each consecutive bar was a different team. That palette was
 * replaced by a color column on the team record, and the color left with it — every team in the
 * current season returns `color: null`, which `hexFromInt` maps to `#3a3a3a`. So the color comes from
 * the value now instead of from identity, and team logos carry the identity.
 *
 * Hex literals rather than the `--red`/`--gold`/`--green` vars because the bar gradient appends a hex
 * alpha suffix (`${color}88`), which `var()` cannot carry. These are the CCS semantic hues, so the ramp
 * still reads as part of the palette, and they are theme-independent.
 */
export const BAR_RAMP = ["#d20708", "#f97316", "#d7a52a", "#22c55e", "#10b981"];

const channels = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/**
 * Interpolate the ramp at `t`, clamped to 0..1.
 *
 * Callers pass a *goodness*, not a magnitude: the value's position between the lowest and highest on
 * screen, inverted for a `lowerIsBetter` stat. Normalizing across the range rather than dividing by the
 * maximum is what makes signed stats work — by magnitude alone a −400 gold diff scores the same as
 * +400 and would come out green.
 */
export function rampColor(t: number): string {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 1;
  const scaled = clamped * (BAR_RAMP.length - 1);
  const i = Math.min(BAR_RAMP.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const from = channels(BAR_RAMP[i]);
  const to = channels(BAR_RAMP[i + 1]);
  const hex = from
    .map((c, k) => Math.round(c + (to[k] - c) * f).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}
