/**
 * The player's champion pool, compact enough for the rail.
 *
 * This was a sortable eight-column table in the wide column, which was the wrong instrument. A pool
 * is a *ranking a reader skims* — who do they play, and are they good at it — not a dataset to
 * reorder. Two lines per champion in the rail answers that faster than a table did, and it gives the
 * wide column back to match history, which genuinely needs the width.
 *
 * Served order is games descending, which is the order the question is asked in, so nothing is
 * re-sorted here. Win rate and KDA are color-coded because that is what replaces the ability to
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
 * Two rows to the right of a full-height icon, three columns each.
 *
 * There are no column headings: at this size a legend cost a whole row of the card to caption six
 * values that already carry their own units (`3.92 KDA`, `8.42 CS/M`, `24 games`).
 *
 * The flanking tracks are equal `1fr`s and the middle one is `auto`, which is what actually centers
 * the middle column in the row. With the right-hand track sized to its content instead, the middle
 * pair sat aligned with each other but pushed well right of center — correct by the grid's rules
 * and wrong to look at.
 */
const GRID = "grid grid-cols-[30px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2";

export function ChampionPoolCard({ champions }: { champions: readonly ProfileChampionBreakdown[] }) {
  const [showAll, setShowAll] = useState(false);

  if (champions.length === 0) {
    return (
      <RailCard title="Champion pool">
        <p className="px-3 py-4 text-xs text-text-dim">No champions played.</p>
      </RailCard>
    );
  }

  const shown = showAll ? champions : champions.slice(0, PREVIEW);

  return (
    <RailCard title="Champion pool">
      <ul className="divide-y divide-border/60">
        {shown.map((champion, index) => (
          <li key={champion.champId ?? `unknown-${index}`} className={`${GRID} px-3 py-2`}>
            <ChampionIcon
              champion={champion.champId}
              src={champion.img}
              name={champion.champ}
              size={30}
              tile
              decorative
              className="row-span-2 flex shrink-0"
            />

            <span className="truncate font-heading text-xs text-text-bright">
              {champion.champ ?? "Unknown"}
            </span>
            <span className="justify-self-center whitespace-nowrap font-mono text-[11px]">
              <span className={kdaTone(champion.kda, "text-text-secondary")}>{kdaText(champion.kda)}</span>
              <span className="text-text-dim"> KDA</span>
            </span>
            <span
              className={`justify-self-end font-mono text-[11px] ${winRateTone(champion.winPercent, "text-text-secondary")}`}
            >
              {metricText(champion.winPercent, pct0)}
            </span>

            {/* Second row: the supporting numbers, muted and unbolded so the row above stays the
                one a reader scans. */}
            <span className="truncate font-mono text-[10px] text-text-muted">
              {metricText(champion.csMin, dec(2))} CS/M
            </span>
            <span className="justify-self-center whitespace-nowrap font-mono text-[10px] text-text-muted">
              {avgKdaText(champion)}
            </span>
            <span className="justify-self-end whitespace-nowrap font-mono text-[10px] text-text-muted">
              {champion.games} {champion.games === 1 ? "game" : "games"}
            </span>
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
