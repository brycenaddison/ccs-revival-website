/**
 * Maps CCS API responses onto the view-model shapes in `src/types/league.ts`.
 *
 * Series and standings are *not* derived here. Reconstructing them needs match results, and
 * the only endpoint carrying those is the single-team page, which must not be called in bulk.
 * `GET /matches/:conf` and `GET /standings/:conf` will supply them server-side.
 */

import { fmtRatio, hexFromInt, lighten, type PlayerStats, type TeamRecord, type TeamStats, type Tournament } from "./api";
import type { Player, Roster, Split, Team } from "../types/league";

/**
 * Stable team identity across the app.
 *
 * Team codes are unique per conf, not globally, so the conf has to be part of the key —
 * otherwise two concurrently-active divisions sharing a code would collide.
 */
export function teamKey(conf: string, code: string): string {
  return `${conf}:${code}`;
}

export interface ParsedTeamKey {
  conf: string;
  code: string;
}

/** Inverse of `teamKey`. Conf ids contain no colon, so split on the first one. */
export function parseTeamKey(id: string | null | undefined): ParsedTeamKey | null {
  if (!id) return null;
  const i = id.indexOf(":");
  if (i <= 0 || i === id.length - 1) return null;
  return { conf: id.slice(0, i), code: id.slice(i + 1) };
}

function toTeamBase(
  code: string,
  name: string,
  conf: string,
  color: number | null,
  colorHex: string,
  logo: string | undefined,
  groupName?: string,
): Team {
  return {
    id: teamKey(conf, code),
    name,
    abbreviation: code,
    color_primary: colorHex,
    color_accent: color === null || color === 0 ? lighten(colorHex, 0.25) : lighten(colorHex, 0.35),
    logo_url: logo,
    ...(groupName ? { divisions: { name: groupName } } : {}),
  };
}

export function toTeam(rec: TeamRecord, groupName?: string): Team {
  return toTeamBase(rec.code, rec.name, rec.conf ?? "", rec.color, rec.colorHex, rec.logo, groupName);
}

export function toTeamFromStats(s: TeamStats, groupName?: string): Team {
  return toTeamBase(s.code, s.name, s.conf, s.color, s.colorHex, s.logo, groupName);
}

// ------------------------------------------------------------------ series keys

/**
 * Series identity: the two teams that met, in a given week of a given conf.
 *
 * Doubles as the URL segment for `/match/:seriesId`, so `parseSeriesKey` can reconstruct
 * everything a series page needs without recomputing the whole league.
 */
export function seriesKey(conf: string, week: number, a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `${conf}:w${week}:${x}_vs_${y}`;
}

export interface ParsedSeriesKey {
  conf: string;
  week: number;
  codeA: string;
  codeB: string;
}

export function parseSeriesKey(key: string): ParsedSeriesKey | null {
  const m = /^(.+):w(\d+):(.+)_vs_(.+)$/.exec(key);
  if (!m) return null;
  const week = Number.parseInt(m[2], 10);
  if (!Number.isFinite(week)) return null;
  return { conf: m[1], week, codeA: m[3], codeB: m[4] };
}

/** Resolve the best-of for a week from the tournament's per-week layout. */
export function bestOfForWeek(t: Tournament | undefined, week: number): number | undefined {
  if (!t || t.layout.length === 0) return undefined;
  const applicable = t.layout.filter(l => l.startingWeek <= week).sort((p, q) => q.startingWeek - p.startingWeek);
  return (applicable[0] ?? t.layout[0]).bestOf;
}

// --------------------------------------------------------------------- players

export function toPlayers(stats: readonly PlayerStats[], teamsById: ReadonlyMap<string, Team>): Player[] {
  return stats.map((p): Player => ({
    id: p.rowKey,
    name: p.name,
    role: p.role ?? undefined,
    team: teamsById.get(teamKey(p.conf, p.team)),
    gp: p.games,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    kda: fmtRatio(p.kda, 1),
    csMin: p.csMin ?? 0,
    damageMin: p.damageMin ?? 0,
    goldMin: p.goldMin ?? 0,
    winRate: Math.round((p.winPercent ?? 0) * 100),
  }));
}

/**
 * Derive rosters from player statistics.
 *
 * This only sees players who have recorded games: `teams` stores roster slots as PUUIDs and
 * there is no public PUUID→name lookup, so benched players and anyone without a linked
 * profile are invisible. A rosters endpoint would fix it — see the gap analysis.
 */
export function toRosters(
  stats: readonly PlayerStats[],
  teamsById: ReadonlyMap<string, Team>,
  splitName?: string,
): Roster[] {
  return stats.map((p): Roster => ({
    id: p.rowKey,
    player_id: String(p.id),
    team_id: teamKey(p.conf, p.team),
    split_id: p.conf,
    role: p.role ?? undefined,
    is_captain: false,
    is_starter: true,
    players: { id: String(p.id), display_name: p.name },
    teams: teamsById.get(teamKey(p.conf, p.team)),
    ...(splitName ? { splits: { name: splitName } } : {}),
  }));
}

// ---------------------------------------------------------------------- splits

/** Present each active tournament as a "split" so the season bar keeps working. */
export function toSplits(tournaments: readonly Tournament[]): Split[] {
  return tournaments.map((t, i): Split => ({
    id: t.conf,
    name: t.shortname ?? t.name,
    split_number: i + 1,
    season_id: t.conf,
    is_active: true,
    seasons: { name: t.name },
  }));
}

/** Fallback colour for a team with no colour set, so badges aren't black-on-black. */
export const DEFAULT_TEAM_HEX = hexFromInt(null);

/**
 * Display label per conf, for grouping standings when several run at once.
 *
 * A conf *is* a tournament, so concurrent divisions are separate confs (e.g. `5a`, `5b`,
 * `5c`). Always use the full `name` here: `shortname` exists to tell a team which tournament
 * it played in — where there's no ambiguity, since a team only plays one division — so
 * sibling confs deliberately share it (`wed` and `thu` are both "Summer '22"). It can't
 * distinguish groups.
 */
export function groupLabels(
  tournaments: readonly Tournament[],
  confs: readonly string[],
): Map<string, string> {
  return new Map(
    confs.map(conf => {
      const name = tournaments.find(t => t.conf === conf)?.name;
      return [conf, name && name.trim() !== "" ? name : conf.toUpperCase()];
    }),
  );
}
