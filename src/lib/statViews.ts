/**
 * Derivations for the Stats page that are genuinely presentational.
 *
 * The bar is deliberately low: anything needing more than one endpoint load and a trivial reduction
 * belongs in the API. This file used to hold a per-game engine — records, scouting profiles,
 * head-to-head — assembled by fetching every team's matchlist and unioning them in the browser.
 * That was ~24 requests and the whole season's games to render a dozen five-row boards, and it is
 * now served by `GET /stats/records/:conf` and `GET /profiles/:profileId` instead.
 *
 * What remains is the comparison radar, which stays client-side on purpose: it ranks a player
 * against *whatever filter set the user has selected*, so it is a function of UI state, not of the
 * season. No endpoint can precompute it.
 *
 * A `shortName` used to live here too, stripping `#tagLine` off a displayed name. It went when the
 * rows it was applied to stopped being Riot IDs: those names are nicknames now, and a nickname's
 * tag — if it has something that looks like one — is part of the name the player chose. The one
 * place a real `gameName#tagLine` is still rendered splits it locally, in `RiotAccountCards`.
 */

import type { PlayerStats } from "./api";
import { int } from "./statFormat";

/**
 * Axes for the comparison radar.
 *
 * Deliberately one axis per area of the game rather than per available column, because a radar with
 * two axes measuring the same thing (gold/min and gold share) reads as a shape that means nothing.
 * Deaths are inverted so that "further out" is unambiguously better on every axis.
 */
export const RADAR_AXES: readonly { key: keyof PlayerStats; label: string; invert?: boolean }[] = [
  { key: "kda", label: "KDA" },
  { key: "csMin", label: "CS/m" },
  { key: "damageMin", label: "DMG/m" },
  { key: "goldMin", label: "Gold/m" },
  { key: "killParticipation", label: "KP" },
  { key: "visionScoreMin", label: "Vision" },
  // Labeled with the arrow because the axis is inverted but the number shown is still raw deaths:
  // further from the center means *fewer*, and "Survival 2.10" would read as the opposite.
  { key: "avgDeaths", label: "Deaths ↓", invert: true },
];

export interface RadarPoint {
  label: string;
  /** 0..1 position along the axis — a percentile within the pool, not a raw value. */
  scaled: number;
  /** Raw value, pre-formatted for the legend. */
  display: string;
}

const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Percentile of `value` within `pool`, as a 0..1 fraction.
 *
 * A percentile rather than value/max: raw ratios put every player in the same tenth of a KDA axis
 * that one outlier stretched to 12, so the shapes become indistinguishable. Rank spreads them out,
 * which is the only thing a comparison radar is for.
 */
function percentile(value: number, pool: readonly number[], invert: boolean): number {
  if (pool.length <= 1) return 0.5;
  const better = pool.filter(v => (invert ? v > value : v < value)).length;
  return better / (pool.length - 1);
}

/**
 * One player's radar shape, scaled against `pool`.
 *
 * `pool` should be the players this one is fairly compared to — same role, and past the minimum
 * games filter — because a support's CS/min percentile against mid laners is noise.
 */
export function radarPoints(player: PlayerStats, pool: readonly PlayerStats[]): RadarPoint[] {
  return RADAR_AXES.map(axis => {
    const raw = axis.key === "kda" ? player.kda : asNumber(player[axis.key]);
    const values = pool
      .map(p => (axis.key === "kda" ? p.kda : asNumber(p[axis.key])))
      .filter((v): v is number => v !== null && Number.isFinite(v));

    if (raw === null || !Number.isFinite(raw) || values.length === 0) {
      // A deathless KDA has no percentile among finite values; pin it to the top rather than drop
      // the axis, which would change the polygon's shape and misrepresent the other axes.
      const top = raw !== null && !Number.isFinite(raw);
      return { label: axis.label, scaled: top ? 1 : 0, display: top ? "∞" : "—" };
    }

    return {
      label: axis.label,
      scaled: percentile(raw, values, axis.invert === true),
      display:
        axis.key === "damageMin" || axis.key === "goldMin"
          ? int(raw)
          : axis.key === "killParticipation"
            ? `${(raw * 100).toFixed(0)}%`
            : raw.toFixed(2),
    };
  });
}
