/**
 * Maps CCS API responses onto the view-model shapes in `src/types/league.ts`.
 *
 * Nothing here derives a record or a ranking. Both are served — `/standings/:conf` ranks and
 * resolves tiebreakers, and every `/teams` row carries its own record — and are only reshaped.
 * Counting series client-side would miss forfeits, which exist outside `matchlist`. Series come
 * from `GET /matches/:conf`, not yet loaded.
 */

import {
  fmtRatio,
  hexFromInt,
  type PlayerStats,
  type StandingRow,
  type TeamRecord,
  type TeamStats,
  type Tournament,
} from "./api";
import { rosterEntries } from "./roster";
import { accentHex, type TeamColors } from "./teamStyle";
import type { Player, Roster, Split, Standing, Team } from "../types/league";

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

/*
 * `color_accent` is the gradient's second stop, and `accentHex` in `lib/teamStyle.ts` is the only
 * thing that decides it — the team's own `colorSecondary` when it has set one, the lightened primary
 * the site always drew otherwise. Both adapters below go through it so a badge and a team card cannot
 * disagree about the same team.
 */
function toTeamBase(
  code: string,
  name: string,
  conf: string,
  colors: TeamColors,
  logo: string | undefined,
  groupName?: string,
): Team {
  return {
    id: teamKey(conf, code),
    name,
    abbreviation: code,
    color_primary: colors.colorHex,
    color_accent: accentHex(colors),
    logo_url: logo,
    ...(groupName ? { divisions: { name: groupName } } : {}),
  };
}

/**
 * The props `TeamBadge` wants, from anything carrying a name, a logo and a resolved color.
 *
 * The season document has no team ids and needs none — `TeamLink` takes conf and code directly — so
 * building a whole synthetic `Team` just to draw a badge would be inventing an identity nobody asked
 * for. Same `accentHex` as `toTeamBase`, so a badge looks the same whichever read it came from.
 */
export function toBadge(
  team: TeamColors & { name: string; logo?: string },
): { name: string; color_primary: string; color_accent: string; logo_url?: string } {
  return {
    name: team.name,
    color_primary: team.colorHex,
    color_accent: accentHex(team),
    logo_url: team.logo,
  };
}

export function toTeam(rec: TeamRecord, groupName?: string): Team {
  return toTeamBase(rec.code, rec.name, rec.conf ?? "", rec, rec.logo, groupName);
}

export function toTeamFromStats(s: TeamStats, groupName?: string): Team {
  return toTeamBase(s.code, s.name, s.conf, s, s.logo, groupName);
}

export function toTeamFromStanding(s: StandingRow, groupName?: string): Team {
  return toTeamBase(s.code, s.name, s.conf, s, s.logo, groupName);
}

// ------------------------------------------------------------------- standings

/**
 * Standings as the API ranks them.
 *
 * Order is preserved: `rank` and `place` come from the server, which resolves series record, game
 * win percentage and head-to-head — the last of which no other endpoint here can reconstruct.
 * Callers must render these in the order given and must not renumber rows by index, because ties
 * share a rank and a shared rank consumes the positions it covers.
 */
export function toStandings(
  rows: readonly StandingRow[],
  teamsById: ReadonlyMap<string, Team>,
  groupName?: string,
): Standing[] {
  return rows.map((r): Standing => {
    const id = teamKey(r.conf, r.code);
    return {
      id,
      team_id: id,
      split_id: r.conf,
      wins: r.seriesWins,
      losses: r.seriesLosses,
      gameWins: r.gameWins,
      gameLosses: r.gameLosses,
      gameWinPct: r.gameWinPct,
      rank: r.rank,
      place: r.place,
      ...(r.streak ? { streak: r.streak } : {}),
      teams: teamsById.get(id) ?? toTeamFromStanding(r, groupName),
    };
  });
}

/**
 * Standings read off the team rows, for where a record is wanted but a rank is not.
 *
 * Every team on `/teams/:conf` carries its own `record`, so a team card's W-L costs no extra
 * request. What it does not carry is `rank`, `place` or `streak` — those need `/standings/:conf`,
 * which is why these rows come back **unranked** and must not be presented as a table.
 *
 * A team whose `record` is missing is omitted rather than shown at `0-0`, which is a real record
 * upstream: an API too old to serve records yields no standings rather than a table of zeroes.
 */
export function toStandingsFromTeams(
  records: readonly TeamRecord[],
  teamsById: ReadonlyMap<string, Team>,
  groupName?: string,
): Standing[] {
  return records.flatMap((rec): Standing[] => {
    if (!rec.record) return [];
    // One row per team, so the team's own identity is also the standing's.
    const conf = rec.conf ?? "";
    const id = teamKey(conf, rec.code);
    return [{
      id,
      team_id: id,
      split_id: conf,
      wins: rec.record.seriesWins,
      losses: rec.record.seriesLosses,
      gameWins: rec.record.gameWins,
      gameLosses: rec.record.gameLosses,
      teams: teamsById.get(id) ?? toTeam(rec, groupName),
    }];
  });
}

/*
 * There were three series helpers here — `seriesKey`, `parseSeriesKey` and `bestOfForWeek` — which
 * synthesized `conf:wN:A_vs_B` as a URL segment and unpacked it again, because a match page had to
 * rebuild a best-of from a team's matchlist and guess its length from the tournament's per-week layout.
 * `/match/:scheduleMatchId` reads the fixture instead (`GET /tournaments/schedule/:id/result`), which
 * carries the resolved `bestOf` and the games that actually belong to it.
 */

// --------------------------------------------------------------------- players

export function toPlayers(stats: readonly PlayerStats[], teamsById: ReadonlyMap<string, Team>): Player[] {
  return stats.map((p): Player => ({
    profileId: p.id,
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
 * Rosters exactly as the league declares them — the five starting slots and the bench, nothing
 * else, and nothing derived from statistics.
 *
 * These used to be derived from `playerstats` alone, because `teams` stored roster slots as PUUIDs
 * with no public PUUID→name lookup. That inverted the meaning of the list: it showed whoever had
 * recorded a game, so a benched player was invisible, a stand-in looked like a squad member, and
 * every entry was necessarily a starter. Slots now carry `{ profileId, name }`, so the declared
 * roster is the source of truth — and `/teams/:conf` alone answers the whole question, with no
 * stats request behind it.
 *
 * Two consequences of taking nothing from statistics:
 *
 *  - **A bench player has no role.** The bench isn't role-assigned; only a stat line could say what
 *    someone actually played, and that is a record of appearances rather than a roster position.
 *  - **A slot whose Riot ID no longer resolves shows its profile id.** Banned and deleted accounts
 *    stop resolving; the name recorded when they played lives in `playerstats`, which this no
 *    longer reads. The team's own page still has stats loaded and still uses the better fallback.
 *
 * Stat lines no slot claimed are dropped entirely. A team card answers "who is on this team", and
 * someone who played without holding a slot is not an answer to that — they appear under "Other
 * Appearances" on the team's own page, where there is room to say what they are.
 */
export function toRosters(
  records: readonly TeamRecord[],
  teamsById: ReadonlyMap<string, Team>,
  splitName?: string,
): Roster[] {
  const split: { splits?: { name: string } } = splitName ? { splits: { name: splitName } } : {};

  return records.flatMap((rec): Roster[] => {
    const conf = rec.conf ?? "";
    const id = teamKey(conf, rec.code);
    const base = { team_id: id, split_id: conf, is_captain: false, teams: teamsById.get(id), ...split };

    return rosterEntries(rec).map((e): Roster => ({
      ...base,
      id: `${id}:${e.key}`,
      profileId: e.profileId,
      player_id: String(e.profileId),
      role: e.role ?? undefined,
      is_starter: e.starter,
      players: { id: String(e.profileId), display_name: e.name },
    }));
  });
}

// ---------------------------------------------------------------------- splits

/**
 * Present each active tournament as a "split" so the season bar keeps working.
 *
 * `name` is the tournament's full name. `shortname` reads as an abbreviation wherever it's shown on
 * its own — and `Split.name` is shown on its own, in the hero strip on Home.
 */
export function toSplits(tournaments: readonly Tournament[]): Split[] {
  return tournaments.map((t, i): Split => ({
    id: t.conf,
    name: t.name,
    split_number: i + 1,
    season_id: t.conf,
    is_active: true,
    seasons: { name: t.name },
  }));
}

/** Fallback color for a team with no color set, so badges aren't black-on-black. */
export const DEFAULT_TEAM_HEX = hexFromInt(null);

/**
 * Display label per conf, for telling concurrent conferences apart — the strips on Standings, Stats,
 * Teams and the Home standings panel all label their tabs from this one map.
 *
 * A conf *is* a tournament, so concurrent divisions are separate confs (e.g. `5a`, `5b`, `5c`).
 * The label is the conference's **`codename`** ("Apollo", "Mars") — the field upstream serves for
 * exactly this, edited as "Division Name" in Site Admin → Leagues — falling back to the full `name`
 * for a league that has not set one. Never `shortname`: it is the **season** label, it exists to tell
 * a team which season it played in, and sibling confs deliberately share it (`wed` and `thu` are both
 * "Summer '22"), so it cannot distinguish groups.
 */
export function groupLabels(
  tournaments: readonly Tournament[],
  confs: readonly string[],
): Map<string, string> {
  return new Map(
    confs.map(conf => {
      const t = tournaments.find(t => t.conf === conf);
      const label = t?.codename ?? t?.name;
      return [conf, label && label.trim() !== "" ? label : conf.toUpperCase()];
    }),
  );
}
