/**
 * The old dashboard's leaderboard, rebuilt on `/stats/players/:conf`.
 *
 * The filter set is deliberately the same one it had — minimum games, roles, team, search — because
 * that combination is what made it a tool rather than a table: "best CS/min among junglers with 5+
 * games" is one selection, not a sort you scroll through. Those filters sit *above* the view switch and
 * are shared by both presentations, so moving between table and bars keeps them.
 *
 * Two presentations of the same filtered pool:
 *   - Table — the same sortable, row-expandable table the Teams and Champions tabs use
 *   - Bars  — the pool ranked on a single stat, which is the question a table cannot answer at a glance
 *
 * Rows are selectable for comparison in both, via the trailing dot in the table or a row click in bars.
 * Expanding a row and comparing it are separate affordances on purpose — they are separate questions.
 *
 * One load. The percentile radar is computed here rather than served because it ranks each player
 * against *the current filter selection* — it is a function of UI state, so no endpoint could
 * precompute it.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  ROLE_ORDER,
  roleLabel,
  type PlayerStats,
  type Role,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { radarPoints, shortName } from "../../lib/statViews";
import { flattenGroups, PLAYER_STAT_GROUPS, sortByCell, type StatCell } from "../../lib/statGroups";
import { int } from "../../lib/statFormat";
import { COMPARE_COLORS, MIN_GAMES_OPTIONS } from "../../lib/statUi";
import { type RadarSeries } from "./CompareRadar";
import { CompareDock } from "./CompareDock";
import { StatGroupSwitcher } from "./StatGroupSwitcher";
import { StatGroupDetail, StatTable } from "./StatTable";
import { StatBars, type BarDirection } from "./StatBars";
import { STAT_VIEW_OPTIONS, ViewToggle, type StatView } from "./ViewToggle";
import { CONTROL_CLASS, Field, FilterBar, PillGroup } from "./FilterBar";

interface Props {
  conf: string;
  isMobile: boolean;
  /** Lets the page reserve bottom padding while the compare dock is pinned over the content. */
  onCompareCount?: (n: number) => void;
}

/**
 * The one column worth keeping on screen in every group: sample size.
 *
 * It used to also pin Win%, KDA and CS/min. Win% and KDA are core stats and CS/min is an economy one, so
 * three of the four followed you into Vision and Laning views where they had nothing to do with what you
 * were reading, and they occupied a third of the table's width to do it. Games is different — it is the
 * denominator behind every other number here, so a rate is unreadable without it.
 */
const ANCHOR_CELLS: readonly StatCell<PlayerStats>[] = [
  { key: "games", label: "Games", value: p => p.games, format: int },
];

const ANCHOR_KEYS: ReadonlySet<string> = new Set(ANCHOR_CELLS.map(c => c.key));

/**
 * Opening sort for a stat group — the column a reader arriving at that view most likely came for.
 *
 * Core is called out by name: its leading cell is KDA, but "who got the most kills" is the question a
 * leaderboard is for, and KDA is one click away. Every other group opens on its own first real column,
 * which by construction is the stat the group is named after.
 */
function defaultSort(groupId: string): string {
  if (groupId === "core") return "kills";
  const group = PLAYER_STAT_GROUPS.find(g => g.id === groupId);
  return group?.cells.find(c => c.value && !ANCHOR_KEYS.has(c.key))?.key ?? "games";
}

const ROLE_OPTIONS = ROLE_ORDER.map(r => ({ value: r as string, label: roleLabel(r) }));

const MAX_COMPARE = 3;

export function PlayerLeaderboard({ conf, isMobile, onCompareCount }: Props) {
  const [view, setView] = useState<StatView>("table");
  const [minGames, setMinGames] = useState(5);
  const [roles, setRoles] = useState<Set<Role>>(() => new Set(ROLE_ORDER));
  const [team, setTeam] = useState("ALL");
  const [search, setSearch] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [groupId, setGroupId] = useState(PLAYER_STAT_GROUPS[0].id);
  const [sortKey, setSortKey] = useState(() => defaultSort(PLAYER_STAT_GROUPS[0].id));
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [barStat, setBarStat] = useState("kda");
  const [barDir, setBarDir] = useState<BarDirection>("highest");

  const statsQuery = useQuery(queries.playerStats(conf));
  const teamsQuery = useQuery(queries.teamsForConf(conf));
  const players = statsQuery.data ?? [];

  const group = PLAYER_STAT_GROUPS.find(g => g.id === groupId) ?? PLAYER_STAT_GROUPS[0];
  const catalogue = useMemo(() => flattenGroups([group]), [group]);

  // Selections that name a conf's teams or players stop meaning anything in another conf.
  useEffect(() => {
    setTeam("ALL");
    setCompare([]);
    setExpanded(null);
  }, [conf]);

  useEffect(() => {
    onCompareCount?.(compare.length);
  }, [compare.length, onCompareCount]);

  /**
   * Branding per team code.
   *
   * `hex` is only set when the team actually has a colour: `hexFromInt` substitutes a dark grey for the
   * roughly half of teams with none, and a bar painted that grey is invisible. Leaving it undefined lets
   * the bar fall back to a neutral that works in both themes.
   */
  const branding = useMemo(
    () =>
      new Map(
        (teamsQuery.data ?? []).map(t => [
          t.code,
          { name: t.name, logo: t.logo, hex: t.color ? t.colorHex : undefined },
        ]),
      ),
    [teamsQuery.data],
  );

  /** Codes that actually appear in the stat rows, labelled with the full team name. */
  const teamOptions = useMemo(
    () =>
      [...new Set(players.map(p => p.team))]
        .map(code => ({ code, name: branding.get(code)?.name ?? code }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [players, branding],
  );

  /**
   * Rows passing every filter.
   *
   * Also the radar's comparison pool: a percentile has to be measured against the same population the
   * leaderboard is drawn from, or the shape says something different from the numbers next to it.
   */
  const eligible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter(p => {
      if (p.games < minGames) return false;
      if (p.role !== null && !roles.has(p.role)) return false;
      if (p.role === null && roles.size !== ROLE_ORDER.length) return false;
      if (team !== "ALL" && p.team !== team) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, minGames, roles, team, search]);

  // Anchors first, then whatever the group adds that isn't already an anchor.
  const columns = useMemo<StatCell<PlayerStats>[]>(
    () => [...ANCHOR_CELLS, ...group.cells.filter(c => !ANCHOR_KEYS.has(c.key))],
    [group],
  );

  const sorted = useMemo(() => {
    if (sortKey === "name") {
      return [...eligible].sort((a, b) => a.name.localeCompare(b.name) * sortDir);
    }
    return sortByCell(eligible, columns.find(c => c.key === sortKey), sortDir);
  }, [eligible, columns, sortKey, sortDir]);

  const onSort = (key: string) => {
    if (key === sortKey) { setSortDir(d => (d === -1 ? 1 : -1)); return; }
    setSortKey(key);
    // Names read best A→Z on first click; every statistic reads best highest-first.
    setSortDir(key === "name" ? 1 : -1);
  };

  /**
   * Each group opens on its own default sort, rather than carrying the previous group's over.
   *
   * A group is a different question, so the column worth leading with is a different column — and with
   * only Games pinned, most sort keys don't even exist in the group you switch to.
   */
  const onGroup = (id: string) => {
    setGroupId(id);
    const next = PLAYER_STAT_GROUPS.find(g => g.id === id);
    if (!next) return;
    setSortKey(defaultSort(id));
    setSortDir(-1);
    // The bar picker only offers the active group's stats, so a selection from the group you just left
    // has to be replaced rather than silently ignored.
    if (!next.cells.some(c => c.key === barStat)) {
      const first = next.cells.find(c => c.value);
      if (first) {
        setBarStat(first.key);
        setBarDir(first.lowerIsBetter ? "lowest" : "highest");
      }
    }
  };

  const toggleRole = (r: string) =>
    setRoles(prev => {
      const next = new Set(prev);
      const role = r as Role;
      // Never let the set empty out — an empty role filter shows nothing, which reads as broken.
      if (next.has(role)) { if (next.size > 1) next.delete(role); }
      else next.add(role);
      return next;
    });

  const toggleCompare = (rowKey: string) =>
    setCompare(prev =>
      prev.includes(rowKey) ? prev.filter(k => k !== rowKey) : prev.length >= MAX_COMPARE ? prev : [...prev, rowKey],
    );

  const comparing = useMemo(
    () => compare.flatMap(k => {
      const p = players.find(x => x.rowKey === k);
      return p ? [p] : [];
    }),
    [compare, players],
  );

  /**
   * Radar series, each scaled against its *own* role's pool.
   *
   * Comparing a support's CS/min percentile against mid laners measures the position, not the
   * player. So each shape is ranked within its role even when the leaderboard shows several.
   */
  const series = useMemo<RadarSeries[]>(
    () => comparing.map((p, i) => ({
      key: p.rowKey,
      label: shortName(p.name),
      color: COMPARE_COLORS[i] ?? "#888",
      points: radarPoints(p, eligible.filter(x => x.role === p.role)),
    })),
    [comparing, eligible],
  );

  if (statsQuery.isPending) return <div className="text-center py-10 text-text-subtle">Loading players...</div>;
  if (statsQuery.error) return <div className="text-center py-10 text-ccs-red">{errorMessage(statsQuery.error)}</div>;
  if (players.length === 0) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  return (
    <div>
      {/* Filters — shared by both views, so switching between them keeps the selection. */}
      <FilterBar isMobile={isMobile} columns={4}>
        <Field label="Min Games">
          <select value={minGames} onChange={e => setMinGames(Number(e.target.value))} className={CONTROL_CLASS}>
            {MIN_GAMES_OPTIONS.map(n => <option key={n} value={n}>{n}+</option>)}
          </select>
        </Field>

        <Field label="Team">
          <select value={team} onChange={e => setTeam(e.target.value)} className={CONTROL_CLASS}>
            <option value="ALL">All Teams</option>
            {teamOptions.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </Field>

        <Field label="Search" span={2}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Player or team..."
            className={CONTROL_CLASS}
          />
        </Field>
      </FilterBar>

      {/* Group pills and the role filter share one row, and the group pills stay put across views, so
          nothing below them shifts when the view changes. */}
      <StatGroupSwitcher
        groups={PLAYER_STAT_GROUPS}
        activeId={groupId}
        onChange={onGroup}
        inline={<PillGroup options={ROLE_OPTIONS} isActive={v => roles.has(v as Role)} onSelect={toggleRole} />}
      >
        <ViewToggle options={STAT_VIEW_OPTIONS} value={view} onChange={setView} />
      </StatGroupSwitcher>

      {view === "bars" ? (
        <StatBars
          subject="PLAYERS"
          rows={eligible}
          catalogue={catalogue}
          statKey={barStat}
          onStatKey={(k, suggested) => { setBarStat(k); setBarDir(suggested); }}
          direction={barDir}
          onDirection={setBarDir}
          isMobile={isMobile}
          note={`Click a row to compare — up to ${MAX_COMPARE}.`}
          selectedKeys={compare}
          selectColors={COMPARE_COLORS}
          onSelect={toggleCompare}
          rowMeta={p => ({
            key: p.rowKey,
            name: shortName(p.name),
            sub: isMobile ? p.team : `${p.team} · ${roleLabel(p.role)} · ${p.games}G`,
            logo: branding.get(p.team)?.logo,
            color: branding.get(p.team)?.hex,
          })}
        />
      ) : (
        <StatTable
          rows={sorted}
          rowKey={p => p.rowKey}
          columns={columns}
          nameHeader="Player"
          isMobile={isMobile}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          expandedKey={expanded}
          onExpand={setExpanded}
          leadingHeader="Compare"
          caption={<>
            {sorted.length} of {players.length} players · click a row for the full stat line, or the dot to compare
          </>}
          renderName={p => {
            const brand = branding.get(p.team);
            return (
              <div className="flex items-center gap-2.5">
                {brand?.logo
                  ? <img src={brand.logo} alt="" loading="lazy" decoding="async" className="w-7 h-7 rounded object-contain shrink-0" />
                  : <span className="w-7 h-7 rounded shrink-0" style={{ background: brand?.hex ?? "var(--bar-unset)" }} />}
                <div className="min-w-0">
                  <div className="font-heading font-bold text-text-bright truncate">{shortName(p.name)}</div>
                  <div className="text-[10px] text-text-secondary font-heading tracking-wide truncate">
                    {p.team} · {roleLabel(p.role)}
                  </div>
                </div>
              </div>
            );
          }}
          renderLeading={p => {
            const slot = compare.indexOf(p.rowKey);
            const selected = slot >= 0;
            const atLimit = !selected && compare.length >= MAX_COMPARE;
            return (
              <button
                // Stops the row's expand handler, so the two affordances stay independent.
                onClick={e => { e.stopPropagation(); toggleCompare(p.rowKey); }}
                aria-pressed={selected}
                disabled={atLimit}
                title={
                  atLimit
                    ? `Already comparing ${MAX_COMPARE} players`
                    : selected
                      ? "Remove from comparison"
                      : "Add to comparison"
                }
                className={`w-5 h-5 rounded border-2 block mx-auto ${
                  atLimit ? "opacity-25 cursor-not-allowed border-border" : selected ? "border-transparent" : "border-text-dim hover:border-accent"
                }`}
                style={{ background: selected ? COMPARE_COLORS[slot] : "transparent" }}
              />
            );
          }}
          renderExpanded={p => <StatGroupDetail groups={PLAYER_STAT_GROUPS} row={p} isMobile={isMobile} />}
        />
      )}

      <CompareDock
        players={comparing}
        series={series}
        poolSize={eligible.length}
        onClear={() => setCompare([])}
        isMobile={isMobile}
      />
    </div>
  );
}
