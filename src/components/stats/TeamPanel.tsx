/**
 * The Teams tab — standings summary and the full team stat surface.
 *
 * Rebuilds the old dashboard's team grid on top of `teamstats`, which carries roughly five times what
 * the old Supabase schema did. The visible difference is the Objectives group: the old cards could
 * only show what a team *took* (dragons/game, towers/game), which flatters a team that trades badly.
 * `avgDragonsGiven` / `avgTowersGiven` exist here, so both sides of the trade are on screen.
 *
 * Structured like the Champions tab rather than as the flat card grid it used to be. The grid looked
 * good and did little: it could not sort, could not show more than one group at a time, and had no way
 * to see a team's whole stat line.
 *
 * There were Standings Leaders and Hot Streaks highlight panels here; they are gone because every row
 * already carries its place, series record and streak, so the panels restated the top of the table in a
 * denser, less readable form.
 *
 * Four single loads, no aggregation:
 *   - `teamStats`      — the statistics themselves
 *   - `standings`      — rank, place and streak, which `teamstats` deliberately omits
 *   - `teamsForConf`   — roster slots and branding
 *   - `playerStats`    — stat lines for the roster, shared with the Leaderboard tab's own query
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtPct,
  roleLabel,
  sortValue,
  type PlayerStats,
  type StandingRow,
  type TeamRecord,
  type TeamStats,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { joinRoster } from "../../lib/roster";
import { PlayerLink } from "../profile/PlayerLink";
import { flattenGroups, sortByCell, TEAM_STAT_GROUPS, type StatCell } from "../../lib/statGroups";
import { int, pct } from "../../lib/statFormat";
import { StatGroupSwitcher } from "./StatGroupSwitcher";
import { StatTile } from "./StatTile";
import { StatGroupDetail, StatTable } from "./StatTable";
import { StatBars, type BarDirection } from "./StatBars";
import { STAT_VIEW_OPTIONS, ViewToggle, type StatView } from "./ViewToggle";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
  isMobile: boolean;
}

/**
 * Keys of the always-visible columns.
 *
 * Held separately from the cells because the cells close over the standings lookup and so have to be
 * built inside the component, while the group-dedupe and sort-rescue checks need the keys at module
 * scope.
 */
const ANCHOR_KEYS: ReadonlySet<string> = new Set([
  "series",
  "record",
  "winrate",
  "killDeathRatio",
  "streak",
  "form",
]);

/** Opening sort: best win rate first. */
const DEFAULT_SORT = "winrate";

/** Longest win streak first, longest losing streak last; no streak sits between them. */
const streakRank = (streak: string | null | undefined) =>
  streak ? (streak.startsWith("W") ? 1 : -1) * (Number(streak.slice(1)) || 0) : 0;

export function TeamPanel({ conf, isMobile }: Props) {
  const [view, setView] = useState<StatView>("table");
  const [groupId, setGroupId] = useState(TEAM_STAT_GROUPS[0].id);
  const [sortKey, setSortKey] = useState(DEFAULT_SORT);
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [barStat, setBarStat] = useState("winrate");
  const [barDir, setBarDir] = useState<BarDirection>("highest");

  const group = TEAM_STAT_GROUPS.find(g => g.id === groupId) ?? TEAM_STAT_GROUPS[0];
  const catalogue = useMemo(() => flattenGroups([group]), [group]);

  // Four fixed `useQuery` calls rather than one `useQueries`: the set never varies, so there is no
  // dynamic-length problem to solve, and each result keeps its own precise type.
  const teamStatsQ = useQuery(queries.teamStats(conf));
  const standingsQ = useQuery(queries.standings(conf));
  const teamsQ = useQuery(queries.teamsForConf(conf));
  const playersQ = useQuery(queries.playerStats(conf));

  const { ordered, standingOf, recordOf, playersOf } = useMemo(() => {
    const stats = teamStatsQ.data ?? [];
    const standings = standingsQ.data ?? [];
    const records = teamsQ.data ?? [];
    const players = playersQ.data ?? [];

    const standingOf = new Map<string, StandingRow>(standings.map(r => [r.code, r]));
    const recordOf = new Map<string, TeamRecord>(records.map(r => [r.code, r]));
    const playersOf = new Map<string, PlayerStats[]>();
    for (const p of players) {
      const list = playersOf.get(p.team);
      if (list) list.push(p);
      else playersOf.set(p.team, [p]);
    }

    // Standings order is authoritative — the API resolves series record, game win percentage and
    // head-to-head, the last of which cannot be reconstructed here. Teams with stats but no standings
    // row (shouldn't happen, but a forfeit-only team could) are appended rather than dropped.
    const byCode = new Map(stats.map(s => [s.code, s]));
    const ranked = standings.flatMap(r => {
      const s = byCode.get(r.code);
      return s ? [s] : [];
    });
    const seen = new Set(ranked.map(s => s.code));
    const ordered = [...ranked, ...stats.filter(s => !seen.has(s.code))];

    return { ordered, standingOf, recordOf, playersOf };
  }, [teamStatsQ.data, standingsQ.data, teamsQ.data, playersQ.data]);

  const summary = useMemo(() => {
    const played = ordered.filter(t => t.games > 0);
    const best = <K extends keyof TeamStats>(key: K) =>
      played.length === 0
        ? null
        : played.reduce((a, b) => (sortValue(b[key]) > sortValue(a[key]) ? b : a));
    return {
      teams: ordered.length,
      bestWr: best("winrate"),
      bestKd: best("killDeathRatio"),
      bestGold: best("goldMin"),
    };
  }, [ordered]);

  /**
   * Always-visible columns.
   *
   * Series record, game record and streak used to be a text line under the team name, where none of
   * them could be sorted. They are columns now, which is also where anything else at that level belongs
   * later — conference, for one.
   *
   * Each carries both a `text` for display and a `value` for sorting: `cellText` prefers the text, so
   * "4-1" shows while the sort runs on series wins. A record is two numbers and reads wrong as one.
   */
  const anchors = useMemo<StatCell<TeamStats>[]>(
    () => [
      {
        key: "series",
        label: "Series",
        text: t => {
          const s = standingOf.get(t.code);
          return s ? `${s.seriesWins}-${s.seriesLosses}` : null;
        },
        value: t => standingOf.get(t.code)?.seriesWins ?? null,
      },
      {
        key: "record",
        label: "Games",
        text: t => `${t.wins}-${t.losses}`,
        value: t => t.wins,
      },
      { key: "winrate", label: "Win%", value: t => t.winrate, format: pct },
      { key: "killDeathRatio", label: "K:D", value: t => t.killDeathRatio },
      {
        key: "streak",
        label: "Streak",
        text: t => standingOf.get(t.code)?.streak ?? null,
        value: t => streakRank(standingOf.get(t.code)?.streak),
      },
      {
        // Last five, most recent last. Sorts on wins in the window, which is the thing `streak` can't
        // tell you: "W1" after four losses and "L1" after four wins are opposite seasons.
        key: "form",
        label: "Form",
        text: t => (standingOf.get(t.code)?.form ?? []).join("") || null,
        value: t => {
          const form = standingOf.get(t.code)?.form;
          return form && form.length > 0 ? form.filter(r => r === "W").length : null;
        },
      },
    ],
    [standingOf],
  );

  // Anchors first, then whatever the group adds that isn't already an anchor.
  const columns = useMemo<StatCell<TeamStats>[]>(
    () => [...anchors, ...group.cells.filter(c => !ANCHOR_KEYS.has(c.key))],
    [anchors, group],
  );

  const sorted = useMemo(() => {
    if (sortKey === "name") {
      return [...ordered].sort((a, b) => a.name.localeCompare(b.name) * sortDir);
    }
    return sortByCell(ordered, columns.find(c => c.key === sortKey), sortDir);
  }, [ordered, columns, sortKey, sortDir]);

  const onSort = (key: string) => {
    if (key === sortKey) { setSortDir(d => (d === -1 ? 1 : -1)); return; }
    setSortKey(key);
    // Names read best A→Z on first click; every statistic reads best highest-first.
    setSortDir(key === "name" ? 1 : -1);
  };

  /** Only the anchors survive every group switch, and the bar picker only offers the active group. */
  const onGroup = (id: string) => {
    setGroupId(id);
    const next = TEAM_STAT_GROUPS.find(g => g.id === id);
    if (!next) return;
    const sortSurvives =
      sortKey === "name" || ANCHOR_KEYS.has(sortKey) || next.cells.some(c => c.key === sortKey);
    if (!sortSurvives) {
      setSortKey(DEFAULT_SORT);
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

  // Standings are guarded alongside the statistics: the series record and streak columns both come from
  // that query, and rendering the table without them shows two columns of em-dashes.
  if (teamStatsQ.isPending || standingsQ.isPending) {
    return <div className="text-center py-10 text-text-subtle">Loading teams...</div>;
  }
  if (teamStatsQ.error) return <div className="text-center py-10 text-ccs-red">{errorMessage(teamStatsQ.error)}</div>;
  if (ordered.length === 0) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  return (
    <div>
      {/* Summary tiles. Each superlative names the team that holds it, with its logo — the point of the
          tile is the team, so it gets a line of its own rather than a truncated caption suffix. */}
      <div className={`grid gap-3 mb-5 ${isMobile ? "grid-cols-2" : "grid-cols-4"}`}>
        <StatTile value={String(summary.teams)} label="Teams" color="var(--accent)" />
        <StatTile
          value={summary.bestWr ? fmtPct(summary.bestWr.winrate) : "—"}
          label="Best Win%"
          color="var(--green)"
          subject={summary.bestWr?.name}
          subjectLogo={summary.bestWr?.logo}
          subjectColor={summary.bestWr?.color ? summary.bestWr.colorHex : undefined}
        />
        <StatTile
          value={summary.bestKd?.killDeathRatio != null ? summary.bestKd.killDeathRatio.toFixed(2) : "—"}
          label="Best K:D"
          color="var(--gold)"
          subject={summary.bestKd?.name}
          subjectLogo={summary.bestKd?.logo}
          subjectColor={summary.bestKd?.color ? summary.bestKd.colorHex : undefined}
        />
        <StatTile
          value={summary.bestGold?.goldMin != null ? int(summary.bestGold.goldMin) : "—"}
          label="Best Gold/min"
          color="var(--blue)"
          subject={summary.bestGold?.name}
          subjectLogo={summary.bestGold?.logo}
          subjectColor={summary.bestGold?.color ? summary.bestGold.colorHex : undefined}
        />
      </div>

      {/* The group pills stay put across views, so nothing below them shifts when the view changes. */}
      <StatGroupSwitcher groups={TEAM_STAT_GROUPS} activeId={groupId} onChange={onGroup}>
        <ViewToggle options={STAT_VIEW_OPTIONS} value={view} onChange={setView} />
      </StatGroupSwitcher>

      {view === "bars" ? (
        <StatBars
          subject="TEAMS"
          rows={ordered}
          catalogue={catalogue}
          statKey={barStat}
          onStatKey={(k, suggested) => { setBarStat(k); setBarDir(suggested); }}
          direction={barDir}
          onDirection={setBarDir}
          isMobile={isMobile}
          rowMeta={t => ({
            key: t.code,
            name: t.name,
            sub: `${t.wins}-${t.losses} · ${fmtPct(t.winrate)}`,
            logo: t.logo,
            // Only when the team really has one: `colorHex` substitutes a dark grey for the many teams
            // with no colour set, and a bar in that grey is invisible on the dark page.
            color: t.color ? t.colorHex : undefined,
          })}
        />
      ) : (
        <StatTable
          rows={sorted}
          rowKey={t => t.code}
          columns={columns}
          nameHeader="Team"
          isMobile={isMobile}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          expandedKey={expanded}
          onExpand={setExpanded}
          caption={<>{sorted.length} teams · click a row for the full stat line and roster</>}
          /**
           * Logo and name only — no placing.
           *
           * A standings position next to these numbers would be misleading: `teamstats` counts playoff
           * games, which is not the population the standings algorithm ranks on, so the two disagree by
           * construction. The series column carries the record that is actually comparable.
           */
          renderName={t => (
            <TeamLink
              conf={conf}
              code={t.code}
              stopPropagation
              className="flex items-center gap-2.5 no-underline group min-w-0"
            >
              {t.logo
                ? <img src={t.logo} alt="" loading="lazy" decoding="async" className="w-7 h-7 rounded object-contain shrink-0" />
                : <span className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-white font-bold text-xs" style={{ background: t.color ? t.colorHex : "var(--bar-unset)" }}>{t.code.charAt(0)}</span>}
              <div className="min-w-0">
                {/* Not the team's own colour: it is unset for many teams and resolves to a dark grey
                    that is unreadable on this background. The logo carries the identity. */}
                <div className="font-display text-[15px] tracking-wide truncate text-text-bright group-hover:text-accent">
                  {t.name}
                </div>
                <div className="text-[10px] text-text-secondary font-mono">{t.code}</div>
              </div>
            </TeamLink>
          )}
          renderExpanded={t => {
            const roster = joinRoster(recordOf.get(t.code) ?? null, playersOf.get(t.code) ?? []);
            const starters = roster.entries.filter(e => e.starter && e.stats !== null);
            return (
              <>
                {starters.length > 0 && (
                  <div className="mb-3 text-[11px]">
                    <span className="font-heading tracking-wider uppercase text-[10px] text-text-muted mr-2">
                      Starters
                    </span>
                    {starters.map((e, j) => (
                      <span key={e.key}>
                        {j > 0 && <span className="text-text-subtle"> · </span>}
                        <PlayerLink profileId={e.profileId} stopPropagation className="text-text-secondary no-underline hover:text-accent">{e.name}</PlayerLink>
                        {e.role && <span className="text-text-subtle"> {roleLabel(e.role).slice(0, 3)}</span>}
                      </span>
                    ))}
                  </div>
                )}
                <StatGroupDetail groups={TEAM_STAT_GROUPS} row={t} isMobile={isMobile} />
              </>
            );
          }}
        />
      )}
    </div>
  );
}
