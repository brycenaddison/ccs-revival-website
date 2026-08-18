/**
 * The Stats page.
 *
 * Replaces two overlapping surfaces: the old three-table `StatsSection` and the short-lived
 * `/analysis` page. One destination, four tabs, and a cumulative totals bar across the top.
 *
 * The rule this page is built to: **one endpoint load per view, plus trivial reductions.** Nothing
 * here fans out across teams or re-aggregates a season in the browser. Records held a placeholder for
 * a long time under that rule — it genuinely needs per-game rows, and faking them would have meant
 * fetching every team's matchlist — and it is now served by an endpoint of its own.
 *
 * There was a fifth tab, Scouting: one player's season, with a champion pool, a game log and lane
 * matchups. `/players/:profileId` does all of that across every season a player has played, so the
 * tab and `/stats/scout/:conf` went with it. Players are reached through `PlayerLink` from the
 * leaderboard, rosters, box scores and match pages instead.
 *
 * Leaderboard, Teams and Champions each offer *Table* and *Bars* over one filtered pool: the table
 * answers "what are this row's numbers?", bars answer "who leads this, and by how much?". View mode is
 * owned by each panel rather than by this page, which is what makes filters survive the switch.
 */

import { useEffect, useMemo, useState } from "react";
import { useWindowSize } from "../hooks/useWindowSize";
import { PageShell } from "../components/layout/PageShell";
import { ScoreboardTicker } from "../components/home/ScoreboardTicker";
import { TotalsBar } from "../components/stats/TotalsBar";
import { PlayerLeaderboard } from "../components/stats/PlayerLeaderboard";
import { COMPARE_DOCK_MAX } from "../components/stats/CompareDock";
import { TeamPanel } from "../components/stats/TeamPanel";
import { ChampionPanel } from "../components/stats/ChampionPanel";
import { RecordsPanel } from "../components/stats/RecordsPanel";
import { groupLabels } from "../lib/leagueAdapters";
import { useLeague } from "../lib/leagueContext";

const TAB_LIST = ["Leaderboard", "Teams", "Champions", "Records"] as const;
type Tab = (typeof TAB_LIST)[number];

export default function Stats() {
  const w = useWindowSize();
  const isMobile = w < 768;
  const { tournaments, selectedConfs, loading } = useLeague();

  const [tab, setTab] = useState<Tab>("Leaderboard");
  const [confIndex, setConfIndex] = useState(0);
  // How many players the Leaderboard has selected for comparison, so the page can reserve room for the
  // dock pinned over the bottom of the content. Owned here rather than in the panel because it is the
  // page's padding; the panel still owns the selection itself.
  const [compareCount, setCompareCount] = useState(0);

  // Statistics are per-conf and never merge across them, so a selection spanning several divisions
  // gets a picker rather than a union. Reset it whenever the season selection changes.
  const confKey = selectedConfs.join(",");
  useEffect(() => setConfIndex(0), [confKey]);

  // Leaving the Leaderboard unmounts the dock without it reporting an empty selection, so the padding
  // has to be released here.
  useEffect(() => setCompareCount(0), [tab]);

  const labels = useMemo(() => groupLabels(tournaments, selectedConfs), [tournaments, selectedConfs]);
  const conf = selectedConfs[Math.min(confIndex, Math.max(selectedConfs.length - 1, 0))] ?? null;

  return (
    // The dock is pinned over the content, so the page has to reserve room for it or the last table row
    // becomes unreachable.
    <PageShell
      ticker={<ScoreboardTicker />}
      extraBottom={compareCount > 0 ? COMPARE_DOCK_MAX : undefined}
    >
      <h2 className="font-display text-[22px] text-text-bright tracking-widest mb-4">STATS</h2>

      {selectedConfs.length > 1 && (
        <div className="flex gap-1 mb-4 flex-wrap">
          {selectedConfs.map((c, i) => (
            <button
              key={c}
              onClick={() => setConfIndex(i)}
              className={`py-1.5 px-3 text-[11px] font-heading uppercase tracking-wider rounded border ${
                i === confIndex ? "bg-accent text-white border-accent" : "bg-bg2 text-text-secondary border-border"
              }`}
            >
              {labels.get(c) ?? c}
            </button>
          ))}
        </div>
      )}

      {conf && <TotalsBar conf={conf} isMobile={isMobile} />}

      <div className="flex gap-1 border-b border-border mb-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {TAB_LIST.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`py-2.5 px-4 font-heading text-xs tracking-wider uppercase border-b-2 whitespace-nowrap ${
              tab === t ? "text-text-bright border-accent font-bold" : "text-text-secondary border-transparent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-text-subtle">Loading...</div>
      ) : !conf ? (
        <div className="py-10 text-center text-text-dim">No season selected.</div>
      ) : tab === "Leaderboard" ? (
        <PlayerLeaderboard conf={conf} isMobile={isMobile} onCompareCount={setCompareCount} />
      ) : tab === "Teams" ? (
        <TeamPanel conf={conf} isMobile={isMobile} />
      ) : tab === "Champions" ? (
        <ChampionPanel conf={conf} isMobile={isMobile} />
      ) : (
        <RecordsPanel conf={conf} isMobile={isMobile} />
      )}
    </PageShell>
  );
}
