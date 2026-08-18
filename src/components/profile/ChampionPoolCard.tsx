/**
 * The player's champion pool, compact enough for the rail.
 *
 * This was a sortable eight-column table in the wide column, which was the wrong instrument. A pool
 * is a *ranking a reader skims* — who do they play, and are they good at it — not a dataset to
 * reorder. Two lines per champion in the rail answers that faster than a table did, and it gives the
 * wide column back to match history, which genuinely needs the width.
 *
 * Served order is games descending, which is the order the question is asked in, so nothing is
 * re-sorted here. Win rate and KDA are colour-coded because that is what replaces the ability to
 * sort: the strong and weak champions stand out without the reader doing anything.
 *
 * Kills, deaths and assists are served as career totals and shown per game — see `avgKdaText`.
 */

import { useState } from "react";
import type { ProfileChampionBreakdown } from "../../lib/api";
import { dec, pct0 } from "../../lib/statFormat";
import { ChampionIcon } from "../ChampionIcon";
import { ACTION_QUIET } from "../admin/adminUi";
import { avgKdaText, kdaText, kdaTone, metricText, RailCard, winRateTone } from "./profileUi";

/** Deep enough to cover a season's real pool; the rest is one click away. */
const PREVIEW = 8;

/**
 * Shared by the legend and every row, so the columns line up. The KDA track is wide enough for
 * "Perfect", which is the longest thing that can land in it.
 */
const GRID = "grid grid-cols-[34px_minmax(0,1fr)_50px_36px] items-baseline gap-x-1.5";

export function ChampionPoolCard({ champions }: { champions: readonly ProfileChampionBreakdown[] }) {
  const [showAll, setShowAll] = useState(false);

  if (champions.length === 0) {
    return (
      <RailCard title="CHAMPION POOL">
        <p className="px-3 py-4 text-xs text-text-dim">No champions played.</p>
      </RailCard>
    );
  }

  const shown = showAll ? champions : champions.slice(0, PREVIEW);

  return (
    <RailCard title="CHAMPION POOL">
      <div className={`${GRID} border-b border-border px-3 py-1.5 font-heading text-[8px] uppercase tracking-wider text-text-dim`}>
        <span>Win%</span>
        <span>Avg K/D/A</span>
        <span className="text-right">KDA</span>
        <span className="text-right">CS/m</span>
      </div>

      <ul className="divide-y divide-border/60">
        {shown.map((champion, index) => (
          <li key={champion.champId ?? `unknown-${index}`} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <ChampionIcon
                champion={champion.champId}
                src={champion.img}
                name={champion.champ}
                size={22}
                decorative
                className="flex shrink-0"
              />
              <span className="min-w-0 flex-1 truncate font-heading text-xs text-text-bright">
                {champion.champ ?? "Unknown"}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-text-dim">
                {champion.games}G {champion.wins}-{champion.losses}
              </span>
            </div>

            <div className={`${GRID} mt-1 font-mono text-[10px]`}>
              <span className={winRateTone(champion.winPercent)}>
                {metricText(champion.winPercent, pct0)}
              </span>
              <span className="truncate text-text-secondary">{avgKdaText(champion)}</span>
              <span className={`truncate text-right ${kdaTone(champion.kda)}`}>
                {kdaText(champion.kda)}
              </span>
              <span className="text-right text-text-secondary">
                {metricText(champion.csMin, dec(1))}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {champions.length > PREVIEW && (
        <div className="border-t border-border px-3 py-2">
          <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll} className={ACTION_QUIET}>
            {showAll ? "Show top 8" : `Show all ${champions.length}`}
          </button>
        </div>
      )}
    </RailCard>
  );
}
