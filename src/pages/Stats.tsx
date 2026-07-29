/**
 * The Stats page.
 *
 * Replaces two overlapping surfaces: the old three-table `StatsSection` and the short-lived
 * `/analysis` page. One destination, five tabs, and a cumulative totals bar across the top.
 *
 * The rule this page is built to: **one endpoint load per view, plus trivial reductions.** Nothing
 * here fans out across teams or re-aggregates a season in the browser. Where that rule leaves a gap —
 * single-game records and per-player scouting, both of which genuinely need per-game rows — the tab
 * names the endpoint it is waiting for rather than fetching every team's matchlist to fake it.
 *
 * Every tab offers a *Table* view alongside its default. The dense sortable tables predate this page
 * and are better than cards at comparing twenty rows at once, so they are kept rather than replaced.
 */

import { useEffect, useMemo, useState } from "react";
import { useWindowSize } from "../hooks/useWindowSize";
import { NavBar } from "../components/home/NavBar";
import { MobileBottomBar } from "../components/home/MobileBottomBar";
import { SeasonPicker } from "../components/league/SeasonPicker";
import { TotalsBar } from "../components/stats/TotalsBar";
import { PlayerLeaderboard } from "../components/stats/PlayerLeaderboard";
import { PlayerStatsTable } from "../components/stats/PlayerStatsTable";
import { TeamCards } from "../components/stats/TeamCards";
import { TeamStatsTable } from "../components/stats/TeamStatsTable";
import { ChampionPanel } from "../components/stats/ChampionPanel";
import { ChampionStatsTable } from "../components/stats/ChampionStatsTable";
import { PendingEndpoint } from "../components/stats/PendingEndpoint";
import { groupLabels } from "../lib/leagueAdapters";
import { useLeague } from "../lib/leagueContext";

const TAB_LIST = ["Leaderboard", "Teams", "Champions", "Records", "Scouting"] as const;
type Tab = (typeof TAB_LIST)[number];

/** Tabs that have a second, denser presentation of the same data. */
const HAS_TABLE: ReadonlySet<Tab> = new Set<Tab>(["Leaderboard", "Teams", "Champions"]);

const SPEC = "analysis-endpoints-spec.md";

function ViewToggle({ table, onChange, altLabel }: { table: boolean; onChange: (v: boolean) => void; altLabel: string }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border overflow-hidden">
      {[
        { on: false, label: altLabel },
        { on: true, label: "Table" },
      ].map(o => (
        <button
          key={o.label}
          onClick={() => onChange(o.on)}
          aria-pressed={table === o.on}
          className={`py-1.5 px-3 font-heading text-[10px] tracking-wider uppercase ${
            table === o.on ? "bg-accent text-white font-bold" : "bg-bg2 text-text-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Stats() {
  const w = useWindowSize();
  const isMobile = w < 768;
  const { tournaments, activeConfs, selection, setSelection, selectedConfs, isCurrent, loading } = useLeague();

  const [tab, setTab] = useState<Tab>("Leaderboard");
  const [confIndex, setConfIndex] = useState(0);
  // Which tabs are in table mode, tracked per tab rather than as one shared flag: switching to
  // Champions shouldn't inherit the Teams tab's choice, and coming back should remember your own.
  const [tableTabs, setTableTabs] = useState<ReadonlySet<Tab>>(() => new Set<Tab>());

  // Statistics are per-conf and never merge across them, so a selection spanning several divisions
  // gets a picker rather than a union. Reset it whenever the season selection changes.
  const confKey = selectedConfs.join(",");
  useEffect(() => setConfIndex(0), [confKey]);

  const labels = useMemo(() => groupLabels(tournaments, selectedConfs), [tournaments, selectedConfs]);
  const conf = selectedConfs[Math.min(confIndex, Math.max(selectedConfs.length - 1, 0))] ?? null;

  const asTable = tableTabs.has(tab);
  const setAsTable = (v: boolean) =>
    setTableTabs(prev => {
      const next = new Set(prev);
      if (v) next.add(tab);
      else next.delete(tab);
      return next;
    });

  const toggle = HAS_TABLE.has(tab) ? (
    <ViewToggle table={asTable} onChange={setAsTable} altLabel={tab === "Leaderboard" ? "Bars" : "Cards"} />
  ) : undefined;

  return (
    <div className="bg-bg min-h-screen w-full text-text font-body" style={{ paddingBottom: isMobile ? 72 : 0 }}>
      <div className="bg-bg flex justify-between items-center border-b border-bg2" style={{ padding: isMobile ? "6px 12px" : "6px 20px" }}>
        <div className="flex items-center gap-2 min-w-0" style={{ fontSize: isMobile ? 9 : 10 }}>
          <SeasonPicker
            tournaments={tournaments}
            selection={selection}
            onChange={setSelection}
            activeConfs={activeConfs}
            compact
          />
          {!isCurrent && <span className="text-text-dim font-heading tracking-wider whitespace-nowrap">PAST SEASON</span>}
        </div>
      </div>

      <NavBar isMobile={isMobile} />

      <div className="max-w-[1280px] mx-auto" style={{ padding: isMobile ? 12 : "24px 32px" }}>
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
          asTable
            ? <><div className="flex justify-end mb-3">{toggle}</div><PlayerStatsTable conf={conf} /></>
            : <PlayerLeaderboard conf={conf} isMobile={isMobile} toggle={toggle} />
        ) : tab === "Teams" ? (
          asTable
            ? <><div className="flex justify-end mb-3">{toggle}</div><TeamStatsTable conf={conf} /></>
            : <TeamCards conf={conf} isMobile={isMobile} toggle={toggle} />
        ) : tab === "Champions" ? (
          asTable
            ? <><div className="flex justify-end mb-3">{toggle}</div><ChampionStatsTable conf={conf} /></>
            : <ChampionPanel conf={conf} isMobile={isMobile} toggle={toggle} />
        ) : tab === "Records" ? (
          <PendingEndpoint
            title="Single-Game Records"
            endpoint={`GET /stats/records/${conf}`}
            reason="Records need individual games, and the only per-game data the API serves is one team's matchlist at a time. Ranking a few thousand rows is a query, not a page load — and the server can reach vision, wards, damage taken and multi-kills, which a matchlist line does not carry."
            spec={SPEC}
          />
        ) : (
          <PendingEndpoint
            title="Player Scouting"
            endpoint={`GET /stats/scout/${conf}/:profileId`}
            reason="A scouting report needs a player's games in order, their champion pool with results, and who stood in the opposite lane. All three are per-game joins that belong in the database."
            spec={SPEC}
          />
        )}
      </div>

      <footer className="border-t border-bg3 text-center mt-10" style={{ padding: isMobile ? "20px 12px" : "24px 20px" }}>
        <span className="font-display text-lg text-text-subtle tracking-widest">CCS</span>
        <div className="text-[10px] text-text-subtle mt-2">Amateur Esports · Community Driven</div>
      </footer>
      {isMobile && <MobileBottomBar />}
    </div>
  );
}
