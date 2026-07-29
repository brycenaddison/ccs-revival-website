/**
 * The Teams tab — one rich card per team, ranked.
 *
 * Rebuilds the old dashboard's team grid on top of `teamstats`, which carries roughly five times what
 * the old Supabase schema did. The visible difference is the Objectives group: the old cards could
 * only show what a team *took* (dragons/game, towers/game), which flatters a team that trades badly.
 * `avgDragonsGiven` / `avgTowersGiven` exist here, so a card can show both sides of the trade.
 *
 * Four single loads, no aggregation:
 *   - `teamStats`      — the statistics themselves
 *   - `standings`      — rank, place and streak, which `teamstats` deliberately omits
 *   - `teamsForConf`   — roster slots and branding
 *   - `playerStats`    — stat lines for the roster, shared with the Leaderboard tab's own query
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, fmtPct, lighten, roleLabel, type PlayerStats, type StandingRow, type TeamRecord, type TeamStats } from "../../lib/api";
import { queries } from "../../lib/queries";
import { joinRoster } from "../../lib/roster";
import { cellText, TEAM_STAT_GROUPS } from "../../lib/statGroups";
import { StatGroupSwitcher } from "./StatGroupSwitcher";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
  isMobile: boolean;
  /** Rendered in the switcher's trailing slot — the page owns the Cards/Table toggle. */
  toggle?: React.ReactNode;
}

const PLACE_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

interface Row {
  stats: TeamStats;
  standing: StandingRow | undefined;
  record: TeamRecord | undefined;
  players: PlayerStats[];
}

export function TeamCards({ conf, isMobile, toggle }: Props) {
  const [groupId, setGroupId] = useState(TEAM_STAT_GROUPS[0].id);
  const group = TEAM_STAT_GROUPS.find(g => g.id === groupId) ?? TEAM_STAT_GROUPS[0];

  // Four fixed `useQuery` calls rather than one `useQueries`: the set never varies, so there is no
  // dynamic-length problem to solve, and each result keeps its own precise type.
  const teamStatsQ = useQuery(queries.teamStats(conf));
  const standingsQ = useQuery(queries.standings(conf));
  const teamsQ = useQuery(queries.teamsForConf(conf));
  const playersQ = useQuery(queries.playerStats(conf));

  const rows = useMemo<Row[]>(() => {
    const stats = teamStatsQ.data ?? [];
    const standings = standingsQ.data ?? [];
    const records = teamsQ.data ?? [];
    const players = playersQ.data ?? [];

    const byCode = new Map(stats.map(s => [s.code, s]));
    const playersByTeam = new Map<string, PlayerStats[]>();
    for (const p of players) {
      const list = playersByTeam.get(p.team);
      if (list) list.push(p);
      else playersByTeam.set(p.team, [p]);
    }

    const build = (s: TeamStats): Row => ({
      stats: s,
      standing: standings.find(r => r.code === s.code),
      record: records.find(r => r.code === s.code),
      players: playersByTeam.get(s.code) ?? [],
    });

    // Standings order is authoritative — the API resolves series record, game win percentage and
    // head-to-head, the last of which cannot be reconstructed here. Teams with stats but no standings
    // row (shouldn't happen, but a forfeit-only team could) are appended rather than dropped.
    const ordered = standings.flatMap(r => {
      const s = byCode.get(r.code);
      return s ? [build(s)] : [];
    });
    const seen = new Set(ordered.map(r => r.stats.code));
    return [...ordered, ...stats.filter(s => !seen.has(s.code)).map(build)];
  }, [teamStatsQ.data, standingsQ.data, teamsQ.data, playersQ.data]);

  if (teamStatsQ.isPending) return <div className="text-center py-10 text-text-subtle">Loading teams...</div>;
  if (teamStatsQ.error) return <div className="text-center py-10 text-ccs-red">{errorMessage(teamStatsQ.error)}</div>;
  if (rows.length === 0) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  return (
    <div>
      <StatGroupSwitcher groups={TEAM_STAT_GROUPS} activeId={groupId} onChange={setGroupId}>
        {toggle}
      </StatGroupSwitcher>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(330px, 1fr))" }}
      >
        {rows.map(({ stats: t, standing, record, players }, i) => {
          const roster = joinRoster(record ?? null, players);
          const starters = roster.entries.filter(e => e.starter && e.stats !== null);
          const accent = lighten(t.colorHex, 0.35);

          return (
            <div key={t.id || t.code} className="bg-bg2 border border-border rounded-lg relative overflow-hidden">
              <span
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ background: `linear-gradient(90deg, ${t.colorHex}, ${accent})` }}
              />

              {i < 3 && (
                <span
                  className="absolute top-3 right-3.5 font-display tracking-wider"
                  style={{ fontSize: i === 0 ? 22 : 18, color: PLACE_COLORS[i], opacity: 0.45 }}
                >
                  {standing?.place ?? i + 1}
                </span>
              )}

              <div className="p-4 pt-5">
                <TeamLink conf={conf} code={t.code} className="flex items-center gap-2.5 no-underline group mb-1.5">
                  {t.logo
                    ? <img src={t.logo} alt="" loading="lazy" decoding="async" className="w-9 h-9 rounded object-contain shrink-0" style={{ background: t.colorHex }} />
                    : <span className="w-9 h-9 rounded shrink-0 flex items-center justify-center text-white font-bold" style={{ background: t.colorHex }}>{t.code.charAt(0)}</span>}
                  <div className="min-w-0">
                    <div className="font-display text-[17px] tracking-wide truncate group-hover:text-accent" style={{ color: t.colorHex }}>
                      {t.name}
                    </div>
                    <div className="text-[10px] text-text-dim font-mono">{t.code}</div>
                  </div>
                </TeamLink>

                {/* Series and games are different units — a 2-1 series win is one series win and
                    three games — so both are labelled rather than shown as a bare W-L. */}
                <div className="text-[11px] text-text-secondary mb-3 flex flex-wrap gap-x-2 gap-y-0.5">
                  {standing && (
                    <span>
                      <span className="text-ccs-green">{standing.seriesWins}</span>-
                      <span className="text-ccs-red">{standing.seriesLosses}</span> series
                    </span>
                  )}
                  <span>
                    <span className="text-ccs-green">{t.wins}</span>-
                    <span className="text-ccs-red">{t.losses}</span> games
                  </span>
                  <span className="text-text-bright font-mono">{fmtPct(t.winrate)}</span>
                  {t.avgTime && <span className="font-mono text-text-dim">{t.avgTime}</span>}
                  {standing?.streak && (
                    <span
                      className="font-heading font-bold"
                      style={{ color: standing.streak.startsWith("W") ? "var(--green)" : "var(--red)" }}
                    >
                      {standing.streak}
                    </span>
                  )}
                </div>

                <div
                  className="grid gap-2 mb-3 py-2.5 px-2 bg-bg3 rounded"
                  style={{ gridTemplateColumns: `repeat(${isMobile ? 3 : 4}, minmax(0, 1fr))` }}
                >
                  {group.cells.map(cell => (
                    <div key={cell.key} className="text-center min-w-0">
                      <div className="font-display text-[16px] leading-none truncate" style={{ color: t.colorHex }}>
                        {cellText(cell, t)}
                      </div>
                      <div className="text-[8px] text-text-muted font-heading tracking-wider uppercase mt-1 truncate" title={cell.label}>
                        {cell.label}
                      </div>
                    </div>
                  ))}
                </div>

                {starters.length > 0 && (
                  <div className="text-[10px] text-text-dim leading-relaxed">
                    {starters.map((e, j) => (
                      <span key={e.key}>
                        {j > 0 && <span className="text-text-subtle"> · </span>}
                        <span className="text-text-secondary">{e.name}</span>
                        {e.role && <span className="text-text-subtle"> {roleLabel(e.role).slice(0, 3)}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
