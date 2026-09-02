/**
 * Lane opponents, compact, in the rail beneath the champion pool.
 *
 * **Rows are merged across leagues here, and that is a departure from the payload.** The API serves
 * `career.laneMatchups` per conference and never merges them, so a rival met in three seasons is
 * three rows. Showing that as-is without a league column would look like duplicated rows; showing
 * it *with* one costs width the rail does not have. The league filter in the header is still the
 * exact answer: pick a league and the payload itself narrows, so the rows become that league's
 * alone with no client arithmetic at all.
 *
 * Merging **counts** is safe. Each conference's games are disjoint, so games, wins and losses sum
 * exactly, and the win rate is derived from the summed counts rather than averaged from per-league
 * percentages — which is the operation that would have been wrong.
 *
 * **`gd14` is a games-weighted mean over the leagues that reported one.** It is an average, so it
 * cannot simply be added — and its true denominator is games *with a 14-minute snapshot*, which is
 * not served, so `games` stands in for it. That substitution is exact whenever every counted game
 * has a snapshot, which is every season since they began being recorded; it is approximate only for
 * a season straddling that boundary, where it leans slightly toward the league with more games.
 *
 * The first attempt blanked the cell whenever more than one row contributed, which was far too
 * conservative — it hid a real number from anyone who had met a rival in two seasons, and from
 * everyone at all while the API still split a matchup per role. An approximation accurate to within
 * a rounding error beats an em-dash.
 *
 * The opponent's team is deliberately dropped. Across three seasons it is often three different
 * teams, so there is no single right answer — and their own profile, one click away, has it.
 */

import { useMemo, useState } from "react";
import type { ProfileLaneMatchup } from "../../lib/api";
import { pct0, signed } from "../../lib/statFormat";
import { ACTION_QUIET } from "../admin/adminUi";
import { PlayerLink } from "./PlayerLink";
import { metricText, RailCard, winRateTone } from "./profileUi";

const PREVIEW = 8;

/**
 * Fixed tracks, so every value sits in a real column down the card.
 *
 * A flex row with content-sized spans put each number wherever the name beside it happened to end,
 * which is unreadable in a list — nothing lines up and nothing can be compared vertically.
 *
 * The GD track is wider than its content needs. Everything is end-justified, so the slack falls on
 * its left as breathing room: `6G` and `+427` are both bare numbers and, evenly spaced, read as
 * one value split across two columns.
 */
const GRID = "grid grid-cols-[minmax(0,1fr)_26px_70px_34px] items-baseline gap-x-2";

interface Merged {
  profileId: number;
  name: string | null;
  games: number;
  wins: number;
  losses: number;
  /** Weighted-mean numerator: `Σ gd14 × games` over rows that reported one. */
  gd14Total: number;
  /** Its denominator: `Σ games` over the same rows only — never the row's whole game count. */
  gd14Games: number;
}

export function MatchupCard({ matchups }: { matchups: readonly ProfileLaneMatchup[] }) {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => mergeByOpponent(matchups), [matchups]);

  if (rows.length === 0) {
    return (
      <RailCard title="Lane matchups">
        <p className="px-3 py-4 text-xs text-text-dim">No lane opponents recorded.</p>
      </RailCard>
    );
  }

  const shown = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <RailCard title="Lane matchups">
      <ul className="divide-y divide-border/60">
        {shown.map(row => {
          const winRate = row.games > 0 ? row.wins / row.games : null;
          // Null only when no league reported one at all — every game predates the snapshot.
          const gd14 = row.gd14Games > 0 ? row.gd14Total / row.gd14Games : null;

          return (
            <li key={row.profileId} className={`${GRID} px-3 py-2`}>
              <PlayerLink
                profileId={row.profileId}
                className="min-w-0 truncate font-heading text-xs text-text-bright no-underline hover:text-brand"
              >
                {row.name ?? "Unknown"}
              </PlayerLink>

              <span className="justify-self-end whitespace-nowrap font-mono text-[10px] text-text-muted">
                {row.games}<span className="text-text-dim">G</span>
              </span>

              <span className="justify-self-end whitespace-nowrap font-mono text-[10px] text-text-muted">
                {metricText(gd14, signed)}
                <span className="text-text-dim"> GD@14</span>
              </span>

              <span className={`justify-self-end font-mono text-[10px] ${winRateTone(winRate, "text-text-secondary")}`}>
                {metricText(winRate, pct0)}
              </span>
            </li>
          );
        })}
      </ul>

      {rows.length > PREVIEW && (
        <div className="border-t border-border px-3 py-2">
          <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll} className={ACTION_QUIET}>
            {showAll ? "Show top 8" : `Show all ${rows.length}`}
          </button>
        </div>
      )}
    </RailCard>
  );
}

/**
 * One row per opponent, summed over however many leagues they were met in.
 *
 * Re-sorted by total games because the served order is conference-first, which stops meaning
 * anything once the conferences are folded together. Ties break on name so the order is stable
 * across renders rather than depending on which league happened to come first.
 */
function mergeByOpponent(matchups: readonly ProfileLaneMatchup[]): Merged[] {
  const merged = new Map<number, Merged>();

  for (const row of matchups) {
    const found = merged.get(row.profileId);
    if (found) {
      found.games += row.games;
      found.wins += row.wins;
      found.losses += row.losses;
      // A banned account resolves to null in one league and a name in another; keep the name.
      found.name = found.name ?? row.name;
      if (row.gd14 !== null) {
        found.gd14Total += row.gd14 * row.games;
        found.gd14Games += row.games;
      }
    } else {
      merged.set(row.profileId, {
        profileId: row.profileId,
        name: row.name,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        gd14Total: row.gd14 === null ? 0 : row.gd14 * row.games,
        gd14Games: row.gd14 === null ? 0 : row.games,
      });
    }
  }

  return [...merged.values()].sort(
    (a, b) => b.games - a.games || (a.name ?? "").localeCompare(b.name ?? ""),
  );
}
