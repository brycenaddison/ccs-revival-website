/**
 * The Champions tab — draft summary, pick/ban highlights, and the full stat surface.
 *
 * The old dashboard's champion page could show games, win rate, KDA, K/D/A, pick rate and a ban count.
 * `championstats` carries all of that plus presence, average ban turn, the per-minute suite, lane
 * diffs at 8 and 14, and a best-player-on-this-champion join — so the table is group-switched rather
 * than fixed, with four anchor columns always visible so switching groups never loses your place.
 *
 * The two summary tiles are counts, not superlatives. There were "Best Win%" and "Best KDA" tiles here
 * and they were removed on purpose: both are dominated by small samples, and even with a games floor
 * they measure the team and the pilot at least as much as the champion. A count of unique picks says
 * something about the season that nothing else on the page does.
 *
 * One load (`championStats`, keyed by role so toggling back to a seen role is free). Every tile, chip
 * and bar is a reduction over the rows already in hand, not an extra request.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtPct,
  fmtRatio,
  roleLabel,
  type ChampionStats,
  type Role,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import {
  CHAMPION_STAT_GROUPS,
  flattenGroups,
  sortByCell,
  type StatCell,
} from "../../lib/statGroups";
import { int, pct } from "../../lib/statFormat";
import { MIN_PICKS_OPTIONS, ROLE_FILTERS } from "../../lib/statUi";
import { StatGroupSwitcher } from "./StatGroupSwitcher";
import { StatTile } from "./StatTile";
import { HighlightChip, HighlightPanel } from "./HighlightPanel";
import { StatGroupDetail, StatTable } from "./StatTable";
import { StatBars, type BarDirection } from "./StatBars";
import { STAT_VIEW_OPTIONS, ViewToggle, type StatView } from "./ViewToggle";
import { CONTROL_CLASS, Field, FilterBar, PillGroup } from "./FilterBar";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
  isMobile: boolean;
}

/** Always-visible columns, so the table stays legible across group switches. */
const ANCHOR_CELLS: readonly StatCell<ChampionStats>[] = [
  { key: "games", label: "Picks", value: c => c.games, format: int },
  { key: "bans", label: "Bans", value: c => c.bans, format: int },
  { key: "presence", label: "Presence", value: c => c.presence, format: pct },
  { key: "winPercent", label: "Win%", value: c => c.winPercent, format: pct },
];

const ROLE_OPTIONS = ROLE_FILTERS.map(r => ({ value: r, label: roleLabel(r) }));

/** Highlight chips per panel. Six large chips read; eight small ones are a wall. */
const HIGHLIGHT_COUNT = 6;

export function ChampionPanel({ conf, isMobile }: Props) {
  const [view, setView] = useState<StatView>("table");
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [minGames, setMinGames] = useState(0);
  const [groupId, setGroupId] = useState(CHAMPION_STAT_GROUPS[0].id);
  const [sortKey, setSortKey] = useState("presence");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [barStat, setBarStat] = useState("presence");
  const [barDir, setBarDir] = useState<BarDirection>("highest");

  const { data, isPending, error } = useQuery(queries.championStats(conf, role === "ALL" ? null : role));
  const champs = data ?? [];

  const group = CHAMPION_STAT_GROUPS.find(g => g.id === groupId) ?? CHAMPION_STAT_GROUPS[0];
  const catalogue = useMemo(() => flattenGroups([group]), [group]);

  /**
   * Rows passing the champion-name and minimum-picks filters. Feeds the table and the bars only — the
   * summary above them reads the whole season.
   *
   * This used to admit anything with a ban, on the theory that a ban-only champion (`games: 0` from the
   * FULL JOIN) should never be filtered away. That made the floor meaningless: a one-pick champion with
   * a single ban passed a 10+ filter. Ban-only champions are covered properly by the floor defaulting to
   * 0 instead, which the Min Games options carry a 0 for.
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return champs.filter(c => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return c.games >= minGames;
    });
  }, [champs, search, minGames]);

  /**
   * The summary reads the whole season, not the filtered rows.
   *
   * "Unique picks" is a fact about the split; narrowing it to whatever is typed in the champion box
   * turns it into a count of search results, which is both useless and easy to misread as the real
   * figure. The filters sit below the summary for the same reason — so it is clear they act on the
   * table, not on the numbers above them.
   *
   * Both counts still filter the FULL JOIN artefact: `championstats` returns ban-only champions with
   * `games: 0`, so an unfiltered "unique picks" would include champions nobody played.
   */
  const summary = useMemo(
    () => ({
      picks: champs.filter(c => c.games > 0).length,
      banned: champs.filter(c => c.bans > 0).length,
    }),
    [champs],
  );

  const topPicked = useMemo(
    () => champs.filter(c => c.games > 0).sort((a, b) => b.games - a.games).slice(0, HIGHLIGHT_COUNT),
    [champs],
  );
  const topBanned = useMemo(
    () => champs.filter(c => c.bans > 0).sort((a, b) => b.bans - a.bans).slice(0, HIGHLIGHT_COUNT),
    [champs],
  );

  // Anchors first, then whatever the group adds that isn't already an anchor.
  const columns = useMemo<StatCell<ChampionStats>[]>(() => {
    const anchorKeys = new Set(ANCHOR_CELLS.map(c => c.key));
    return [...ANCHOR_CELLS, ...group.cells.filter(c => !anchorKeys.has(c.key))];
  }, [group]);

  const sorted = useMemo(() => {
    if (sortKey === "name") {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name) * sortDir);
    }
    return sortByCell(filtered, columns.find(c => c.key === sortKey), sortDir);
  }, [filtered, columns, sortKey, sortDir]);

  const onSort = (key: string) => {
    if (key === sortKey) { setSortDir(d => (d === -1 ? 1 : -1)); return; }
    setSortKey(key);
    // Names read best A→Z on first click; every statistic reads best highest-first.
    setSortDir(key === "name" ? 1 : -1);
  };

  /**
   * Switching group has to rescue both the sort key and the bar stat.
   *
   * Only the four anchors survive every group. Sorting by, say, Ban Rate and then switching to Vision
   * used to leave the table sorted by nothing at all — the lookup missed and the rows fell back to API
   * order while the header still claimed a sort. The bar picker only offers the active group's stats, so
   * its selection needs the same rescue.
   */
  const onGroup = (id: string) => {
    setGroupId(id);
    const next = CHAMPION_STAT_GROUPS.find(g => g.id === id);
    if (!next) return;
    const sortSurvives =
      sortKey === "name" ||
      ANCHOR_CELLS.some(c => c.key === sortKey) ||
      next.cells.some(c => c.key === sortKey);
    if (!sortSurvives) {
      setSortKey("presence");
      setSortDir(-1);
    }
    if (!next.cells.some(c => c.key === barStat)) {
      const first = next.cells.find(c => c.value);
      if (first) {
        setBarStat(first.key);
        setBarDir(first.lowerIsBetter ? "lowest" : "highest");
      }
    }
  };

  // Only blank the panel when there is genuinely nothing to show. `keepPreviousData` means a role
  // change keeps the previous rows, but this also stops any future cache miss from wiping the page.
  if (isPending && champs.length === 0) {
    return <div className="text-center py-10 text-text-subtle">Loading champions...</div>;
  }
  if (error) return <div className="text-center py-10 text-ccs-red">{errorMessage(error)}</div>;
  if (champs.length === 0) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  return (
    <div>
      {/* Summary tiles */}
      <div className="grid gap-3 mb-5 grid-cols-2">
        <StatTile value={String(summary.picks)} label="Unique Picks" color="var(--accent)" />
        <StatTile
          value={summary.banned > 0 ? String(summary.banned) : "—"}
          label={summary.banned > 0 ? "Champions Banned" : "No Ban Data"}
          color="var(--red)"
        />
      </div>

      {/* Pick / ban highlights */}
      <div className={`grid gap-3 mb-5 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
        <HighlightPanel
          title="Most Picked"
          isMobile={isMobile}
          empty={topPicked.length === 0}
          emptyMessage="No games played yet this season."
        >
          {topPicked.map(c => (
            <HighlightChip
              key={c.champid}
              img={c.img}
              name={c.name}
              value={String(c.games)}
              unit="picks"
              valueColor="var(--accent)"
            />
          ))}
        </HighlightPanel>

        <HighlightPanel
          title="Most Banned"
          titleColor="var(--red)"
          isMobile={isMobile}
          empty={topBanned.length === 0}
          emptyMessage="No ban data for this season."
        >
          {topBanned.map(c => (
            <HighlightChip
              key={c.champid}
              img={c.img}
              name={c.name}
              dim
              value={String(c.bans)}
              unit="bans"
              valueColor="var(--red)"
            />
          ))}
        </HighlightPanel>
      </div>

      {/* Filters sit below the summary, because they narrow the table and not the numbers above. */}
      <FilterBar isMobile={isMobile} columns={4}>
        <Field label="Champion">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Champion..."
            className={CONTROL_CLASS}
          />
        </Field>

        <Field label="Min Games">
          <select value={minGames} onChange={e => setMinGames(Number(e.target.value))} className={CONTROL_CLASS}>
            {MIN_PICKS_OPTIONS.map(n => <option key={n} value={n}>{n}+</option>)}
          </select>
        </Field>
      </FilterBar>

      {/* Group pills and the role filter share one row, and the group pills stay put across views, so
          nothing below them shifts when the view changes. */}
      <StatGroupSwitcher
        groups={CHAMPION_STAT_GROUPS}
        activeId={groupId}
        onChange={onGroup}
        inline={
          <PillGroup
            options={ROLE_OPTIONS}
            isActive={v => v === role}
            onSelect={v => { setRole(v as Role | "ALL"); setExpanded(null); }}
          />
        }
      >
        <ViewToggle options={STAT_VIEW_OPTIONS} value={view} onChange={setView} />
      </StatGroupSwitcher>

      {view === "bars" ? (
        <StatBars
          subject="CHAMPIONS"
          rows={filtered}
          catalogue={catalogue}
          statKey={barStat}
          onStatKey={(k, suggested) => { setBarStat(k); setBarDir(suggested); }}
          direction={barDir}
          onDirection={setBarDir}
          isMobile={isMobile}
          // Champions have no colour of their own, so the value places them on the ramp. Teams and
          // players use their branding instead.
          colorBy="value"
          rowMeta={c => ({
            key: String(c.champid),
            name: c.name,
            sub: `${c.games}g · ${fmtPct(c.winPercent)}`,
            logo: c.img,
          })}
        />
      ) : (
        <StatTable
          rows={sorted}
          rowKey={c => c.champid}
          columns={columns}
          nameHeader="Champion"
          isMobile={isMobile}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          expandedKey={expanded}
          onExpand={setExpanded}
          caption={<>
            {sorted.length} champions{role !== "ALL" && ` · ${roleLabel(role)} only`} · click a row for the full stat line
          </>}
          renderName={c => (
            <div className="flex items-center gap-2">
              {c.img && <img src={c.img} alt="" loading="lazy" className="w-7 h-7 rounded shrink-0" />}
              <span className="font-heading font-bold text-text-bright">{c.name}</span>
            </div>
          )}
          renderExpanded={c => (
            <>
              {c.bestPlayerName && (
                <div className="mb-3 text-[11px]">
                  <span className="font-heading tracking-wider uppercase text-[10px] text-text-muted mr-2">
                    Best on champion
                  </span>
                  <TeamLink conf={conf} code={c.bestPlayerTeam} className="inline-flex items-center gap-1.5 no-underline group align-middle">
                    {c.bestPlayerLogo && <img src={c.bestPlayerLogo} alt="" loading="lazy" decoding="async" className="w-4 h-4 rounded object-contain" />}
                    <span className="text-text-bright group-hover:text-accent font-bold">{c.bestPlayerName}</span>
                    <span className="text-text-secondary">
                      {c.bestPlayerGames ?? 0}g · {c.bestPlayerKda === null ? "—" : fmtRatio(c.bestPlayerKda)} KDA · {fmtPct(c.bestPlayerWinrate)}
                    </span>
                  </TeamLink>
                </div>
              )}
              <StatGroupDetail groups={CHAMPION_STAT_GROUPS} row={c} isMobile={isMobile} />
            </>
          )}
        />
      )}
    </div>
  );
}
