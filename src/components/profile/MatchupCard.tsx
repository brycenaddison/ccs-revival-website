/**
 * Lane opponents, compact, in the rail beneath the champion pool.
 *
 * **Rows are merged across leagues here, and that is a reversal worth explaining.** The API serves
 * `career.laneMatchups` per conference and never merges them, so a rival met in three seasons is
 * three rows. Showing that as-is without a league column would look like duplicated rows; showing
 * it *with* one costs width the rail does not have.
 *
 * Merging is safe because these are **counts, not rates**. Each conference's games are disjoint, so
 * summing games, wins and losses is exact, and the win rate is then derived from the summed counts
 * rather than averaged from per-league percentages — which is the operation that would have been
 * wrong. Upstream declining to merge is a serving decision, not a statement that the sum is
 * meaningless.
 *
 * The league filter in the header is still how a reader scopes this: pick a league and the payload
 * itself narrows, so these rows become that league's alone with no client arithmetic at all.
 *
 * The opponent's team is deliberately dropped. Across three seasons it is often three different
 * teams, so there is no single right answer — and their own profile, one click away, has it.
 */

import { useMemo, useState } from "react";
import type { ProfileLaneMatchup } from "../../lib/api";
import { pct0 } from "../../lib/statFormat";
import { shortName } from "../../lib/statViews";
import { ACTION_QUIET } from "../admin/adminUi";
import { PlayerLink } from "./PlayerLink";
import { metricText, RailCard, winRateTone } from "./profileUi";

const PREVIEW = 8;

interface Merged {
  profileId: number;
  name: string | null;
  games: number;
  wins: number;
  losses: number;
}

export function MatchupCard({ matchups }: { matchups: readonly ProfileLaneMatchup[] }) {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => mergeByOpponent(matchups), [matchups]);

  if (rows.length === 0) {
    return (
      <RailCard title="LANE MATCHUPS">
        <p className="px-3 py-4 text-xs text-text-dim">No lane opponents recorded.</p>
      </RailCard>
    );
  }

  const shown = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <RailCard title="LANE MATCHUPS">
      <ul className="divide-y divide-border/60">
        {shown.map(row => {
          const winRate = row.games > 0 ? row.wins / row.games : null;
          return (
            <li key={row.profileId} className="flex items-baseline gap-2 px-3 py-2">
              <PlayerLink
                profileId={row.profileId}
                className="min-w-0 flex-1 truncate font-heading text-xs text-text-bright no-underline hover:text-accent"
              >
                {shortName(row.name ?? "Unknown")}
              </PlayerLink>
              <span className="shrink-0 font-mono text-[10px] text-text-dim">
                {row.games}G {row.wins}-{row.losses}
              </span>
              <span className={`w-9 shrink-0 text-right font-mono text-[10px] ${winRateTone(winRate)}`}>
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
    } else {
      merged.set(row.profileId, {
        profileId: row.profileId,
        name: row.name,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
      });
    }
  }

  return [...merged.values()].sort(
    (a, b) => b.games - a.games || (a.name ?? "").localeCompare(b.name ?? ""),
  );
}
