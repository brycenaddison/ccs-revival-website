/**
 * The CCS API client. Every function returns a normalized shape from `./types`.
 *
 * Endpoints marked PROPOSED do not exist upstream yet; because `getList` treats a 404 as
 * absence, they resolve to `[]` until the tournament-bot side ships them. See the gap
 * analysis for the intended contracts.
 */

import { getList, getOne, post, type RequestOpts } from "./http";
import {
  hexFromInt,
  httpsUrl,
  normalizeRole,
  num,
  numOrNull,
  ratio,
  trimPuuid,
  type Numeric,
  type Role,
} from "./normalize";
import type {
  BanCount,
  Champ,
  ChampionStats,
  MatchBan,
  MatchlistEntry,
  MatchlistPlayer,
  MatchlistRoleKey,
  PlayerStats,
  PlayerStatsRanked,
  RiotMatch,
  TeamDetail,
  TeamRecord,
  TeamStats,
  Tournament,
} from "./types";

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Copy a set of keys through `numOrNull`, for derived statistics that can be NULL. */
function pickRatios<K extends string>(raw: Raw, keys: readonly K[]): Record<K, number | null> {
  const out = {} as Record<K, number | null>;
  for (const k of keys) out[k] = numOrNull(raw[k] as Numeric);
  return out;
}

/** Copy a set of keys through `num`, for counts that are always present. */
function pickCounts<K extends string>(raw: Raw, keys: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = num(raw[k] as Numeric, 0);
  return out;
}

// ---------------------------------------------------------------- tournaments

function mapTournament(raw: Raw): Tournament {
  const layout = Array.isArray(raw.layout) ? raw.layout : [];
  return {
    conf: str(raw.conf),
    name: str(raw.name),
    shortname: strOrNull(raw.shortname),
    layout: layout.map(l => {
      const e = asRaw(l);
      return { startingWeek: num(e.startingWeek as Numeric, 0), bestOf: num(e.bestOf as Numeric, 1) };
    }),
    ...(typeof raw.active === "boolean" ? { active: raw.active } : {}),
  };
}

// ---------------------------------------------------------------------- teams

function mapTeamRecord(raw: Raw): TeamRecord {
  const color = numOrNull(raw.color as Numeric);
  return {
    id: num(raw.id as Numeric),
    code: str(raw.code),
    name: str(raw.name),
    conf: strOrNull(raw.conf),
    logo: httpsUrl(raw.logo as string),
    color,
    colorHex: hexFromInt(color),
    top: trimPuuid(raw.top as string),
    jg: trimPuuid(raw.jg as string),
    mid: trimPuuid(raw.mid as string),
    bot: trimPuuid(raw.bot as string),
    sup: trimPuuid(raw.sup as string),
    subs: Array.isArray(raw.subs)
      ? raw.subs.map(s => trimPuuid(s as string)).filter((s): s is string => s !== null)
      : [],
  };
}

// ------------------------------------------------------------------ champions

function mapChamp(raw: unknown): Champ {
  const c = asRaw(raw);
  return {
    champid: num(c.champid as Numeric),
    name: str(c.name),
    img: str(c.img),
    ...(typeof c.splash === "string" ? { splash: c.splash } : {}),
    picks: numOrNull(c.picks as Numeric),
  };
}

function mapBanCount(raw: unknown): BanCount {
  const b = asRaw(raw);
  return {
    championId: num(b.championId as Numeric),
    name: str(b.name),
    img: str(b.img),
    bans: num(b.bans as Numeric),
  };
}

function mapMatchBan(raw: unknown): MatchBan {
  const b = asRaw(raw);
  return {
    pickTurn: num(b.pickTurn as Numeric),
    championId: num(b.championId as Numeric),
    name: str(b.name),
    icon: str(b.icon),
  };
}

// -------------------------------------------------------------- player stats

const PLAYER_COUNTS = [
  "games", "wins", "losses", "kills", "deaths", "assists",
  "soloKills", "doubleKills", "tripleKills", "quadraKills", "pentaKills",
] as const;

const PLAYER_RATIOS = [
  "winPercent", "avgKills", "avgDeaths", "avgAssists", "csMin", "goldMin", "goldPercent",
  "killParticipation", "jungleProximity", "damagePercent", "damagePerGold", "damageMin",
  "xpMin", "visionScoreMin", "wardsMin", "controlWardsMin", "wardsClearedMin",
  "visionScorePercent", "goldDiffAt8", "csDiffAt8", "xpDiffAt8", "goldDiffAt14",
  "csDiffAt14", "xpDiffAt14", "killsAndAssistsAt15", "killParticipationAt15",
  "killsAndAssistsAt25", "killParticipationAt25", "firstBloodPercent",
  "firstBloodedPercent", "killPercent", "deathPercent",
] as const;

function mapPlayerStats(raw: Raw): PlayerStats {
  const id = num(raw.id as Numeric);
  const role = normalizeRole(raw.role as string);
  const team = str(raw.team);
  const conf = str(raw.conf);
  return {
    name: str(raw.name),
    id,
    team,
    conf,
    role,
    logo: httpsUrl(raw.logo as string),
    kda: ratio(raw.kda as Numeric),
    champs: Array.isArray(raw.champs) ? raw.champs.map(mapChamp) : [],
    rowKey: `${id}:${role ?? "?"}:${team}:${conf}`,
    ...pickCounts(raw, PLAYER_COUNTS),
    ...pickRatios(raw, PLAYER_RATIOS),
  };
}

/** `r*` rank column → the statistic it ranks. */
const RANK_COLUMNS: Readonly<Record<string, keyof PlayerStats>> = {
  rkda: "kda",
  rkills: "kills",
  rdeaths: "deaths",
  rassists: "assists",
  ravgKills: "avgKills",
  ravgDeaths: "avgDeaths",
  ravgAssists: "avgAssists",
  rcsMin: "csMin",
  rgoldMin: "goldMin",
  rgoldPercent: "goldPercent",
  rkillParticipation: "killParticipation",
  rjungleProximity: "jungleProximity",
  rdamagePercent: "damagePercent",
  rdamagePerGold: "damagePerGold",
  rdamageMin: "damageMin",
  rxpMin: "xpMin",
  rvisionScoreMin: "visionScoreMin",
  rwardsMin: "wardsMin",
  rcontrolWardsMin: "controlWardsMin",
  rwardsClearedMin: "wardsClearedMin",
  rvisionScorePercent: "visionScorePercent",
  rgoldDiffAt8: "goldDiffAt8",
  rcsDiffAt8: "csDiffAt8",
  rxpDiffAt8: "xpDiffAt8",
  rgoldDiffAt14: "goldDiffAt14",
  rcsDiffAt14: "csDiffAt14",
  rxpDiffAt14: "xpDiffAt14",
  rka15: "killsAndAssistsAt15",
  rkp15: "killParticipationAt15",
  rka25: "killsAndAssistsAt25",
  rkp25: "killParticipationAt25",
  rfirstBloodPercent: "firstBloodPercent",
  rfirstBloodedPercent: "firstBloodedPercent",
  rkillPercent: "killPercent",
  rdeathPercent: "deathPercent",
  rsoloKills: "soloKills",
  rdoubleKills: "doubleKills",
  rtripleKills: "tripleKills",
  rquadraKills: "quadraKills",
  rpentaKills: "pentaKills",
};

function mapPlayerStatsRanked(raw: Raw): PlayerStatsRanked {
  const ranks: PlayerStatsRanked["ranks"] = {};
  for (const [col, stat] of Object.entries(RANK_COLUMNS)) {
    ranks[stat] = numOrNull(raw[col] as Numeric);
  }
  return {
    ...mapPlayerStats(raw),
    rankPool: numOrNull(raw.count as Numeric),
    ranks,
  };
}

// ---------------------------------------------------------------- team stats

const TEAM_COUNTS = ["games", "wins", "losses", "bluesideWins", "redsideWins"] as const;

const TEAM_RATIOS = [
  "winrate", "bluesideWinrate", "redsideWinrate", "killDeathRatio", "avgKills",
  "avgAssists", "avgDeaths", "avgKillsAt15", "avgKillsAt25", "firstBloodPercent",
  "damageMin", "goldMin", "goldDiffAt14", "csMin", "csDiffAt14", "xpMin", "xpDiffAt14",
  "visionScoreMin", "wardsPlacedMin", "controlWardsPurchasedMin", "wardsClearedMin",
  "wardsClearedPercent", "firstTowerPercent", "avgTowersTaken", "avgTowersGiven",
  "firstDragonPercent", "percentDragonsTaken", "avgDragonsTaken", "avgDragonsGiven",
  "firstHeraldPercent", "percentHeraldsTaken", "avgHeraldsTaken", "avgHeraldsGiven",
  "firstBaronPercent", "percentBaronsTaken", "avgBaronsTaken", "avgBaronsGiven",
] as const;

function mapTeamStats(raw: Raw): TeamStats {
  const color = numOrNull(raw.color as Numeric);
  return {
    id: num(raw.id as Numeric),
    code: str(raw.code),
    name: str(raw.name),
    conf: str(raw.conf),
    logo: httpsUrl(raw.logo as string),
    color,
    colorHex: hexFromInt(color),
    avgTime: str(raw.avgTime),
    ...pickCounts(raw, TEAM_COUNTS),
    ...pickRatios(raw, TEAM_RATIOS),
  };
}

// ------------------------------------------------------------------ matchlist

const ROLE_KEYS: readonly MatchlistRoleKey[] = ["top", "jg", "mid", "bot", "sup"];

function mapMatchlistPlayer(raw: unknown): MatchlistPlayer | null {
  if (!raw || typeof raw !== "object") return null;
  const p = asRaw(raw);
  return {
    name: strOrNull(p.name),
    champ: strOrNull(p.champ),
    ...(typeof p.champSplash === "string" ? { champSplash: p.champSplash } : {}),
    kills: num(p.kills as Numeric),
    deaths: num(p.deaths as Numeric),
    assists: num(p.assists as Numeric),
    dmg: num(p.dmg as Numeric),
    cs: num(p.cs as Numeric),
    csm: numOrNull(p.csm as Numeric),
    kda: ratio(p.kda as Numeric),
    gd8: numOrNull(p.gd8 as Numeric),
    gd14: numOrNull(p.gd14 as Numeric),
    kp: numOrNull(p.kp as Numeric),
    jp: numOrNull(p.jp as Numeric),
  };
}

function mapMatchlistEntry(raw: Raw): MatchlistEntry {
  const roles = {} as Record<MatchlistRoleKey, MatchlistPlayer | null>;
  for (const k of ROLE_KEYS) roles[k] = mapMatchlistPlayer(raw[k]);
  return {
    matchId: str(raw.matchId),
    conf: str(raw.conf),
    week: num(raw.week as Numeric),
    team: str(raw.team),
    opponent: str(raw.opponent),
    game: num(raw.game as Numeric, 1),
    win: raw.win === true,
    time: num(raw.time as Numeric),
    startTime: str(raw.startTime),
    blueside: raw.blueside === true,
    kills: num(raw.kills as Numeric),
    deaths: num(raw.deaths as Numeric),
    assists: num(raw.assists as Numeric),
    gold: numOrNull(raw.gold as Numeric),
    gd14: numOrNull(raw.gd14 as Numeric),
    towers: numOrNull(raw.towers as Numeric),
    dragons: numOrNull(raw.dragons as Numeric),
    barons: numOrNull(raw.barons as Numeric),
    heralds: numOrNull(raw.heralds as Numeric),
    matchMaxDmg: numOrNull(raw.topDmg as Numeric),
    bans: Array.isArray(raw.bans) ? raw.bans.map(mapMatchBan) : [],
    bansAgainst: Array.isArray(raw.bansAgainst) ? raw.bansAgainst.map(mapMatchBan) : [],
    roles,
  };
}

/** The API returns matchlists unordered; sort chronologically by week then game. */
function sortMatchlist(entries: MatchlistEntry[]): MatchlistEntry[] {
  return [...entries].sort((a, b) => a.week - b.week || a.game - b.game || a.startTime.localeCompare(b.startTime));
}

// --------------------------------------------------------------- team detail

async function buildTeamDetail(conf: string, code: string, raw: Raw, opts?: RequestOpts): Promise<TeamDetail> {
  const hasStats = typeof raw.code === "string";
  const stats = hasStats ? mapTeamStats(raw) : null;

  // Upstream spreads a null `teamstats` row, so a team that hasn't played loses its own
  // identity fields. Backfill them from `teams` rather than rendering blanks.
  let identity = { code, name: code, logo: undefined as string | undefined, color: null as number | null };
  if (!hasStats) {
    const team = (await teamsForConf(conf, opts)).find(t => t.code === code);
    if (team) identity = { code: team.code, name: team.name, logo: team.logo, color: team.color };
  }

  const base: Partial<TeamStats> = stats ?? {};
  return {
    ...base,
    code: stats?.code ?? identity.code,
    name: stats?.name ?? identity.name,
    conf,
    logo: stats?.logo ?? identity.logo,
    color: stats?.color ?? identity.color,
    colorHex: stats?.colorHex ?? hexFromInt(identity.color),
    hasStats,
    players: Array.isArray(raw.players) ? raw.players.map(p => mapPlayerStatsRanked(asRaw(p))) : [],
    bannedAgainst: Array.isArray(raw.bannedAgainst) ? raw.bannedAgainst.map(mapBanCount) : [],
    bannedBy: Array.isArray(raw.bannedBy) ? raw.bannedBy.map(mapBanCount) : [],
    matchlist: sortMatchlist(Array.isArray(raw.matchlist) ? raw.matchlist.map(m => mapMatchlistEntry(asRaw(m))) : []),
  };
}

// ------------------------------------------------------------ champion stats

const CHAMPION_COUNTS = [
  "total", "games", "bans", "wins", "losses", "kills", "deaths", "assists",
  "soloKills", "doubleKills", "tripleKills", "quadraKills", "pentaKills",
] as const;

const CHAMPION_RATIOS = [
  "pickRate", "banRate", "presence", "avgBanTurn", "winPercent", "avgKills", "avgDeaths",
  "avgAssists", "csMin", "goldMin", "goldPercent", "killParticipation", "jungleProximity",
  "damagePercent", "damagePerGold", "damageMin", "xpMin", "visionScoreMin", "wardsMin",
  "controlWardsMin", "wardsClearedMin", "visionScorePercent", "goldDiffAt8", "csDiffAt8",
  "xpDiffAt8", "goldDiffAt14", "csDiffAt14", "xpDiffAt14", "killsAndAssistsAt15",
  "killParticipationAt15", "killsAndAssistsAt25", "killParticipationAt25",
  "firstBloodPercent", "firstBloodedPercent", "killPercent", "deathPercent",
] as const;

function mapChampionStats(raw: Raw): ChampionStats {
  return {
    champid: num(raw.champid as Numeric),
    conf: str(raw.conf),
    name: str(raw.name),
    img: str(raw.img),
    role: normalizeRole(raw.role as string),
    avgTime: str(raw.avgTime),
    kda: ratio(raw.kda as Numeric),
    bestPlayerName: strOrNull(raw.bestPlayerName),
    bestPlayerTeam: strOrNull(raw.bestPlayerTeam),
    bestPlayerLogo: httpsUrl(raw.bestPlayerLogo as string),
    bestPlayerGames: numOrNull(raw.bestPlayerGames as Numeric),
    bestPlayerKda: numOrNull(raw.bestPlayerKda as Numeric),
    bestPlayerWinrate: numOrNull(raw.bestPlayerWinrate as Numeric),
    ...pickCounts(raw, CHAMPION_COUNTS),
    ...pickRatios(raw, CHAMPION_RATIOS),
  };
}

// ----------------------------------------------------------------- endpoints

export function tournaments(opts?: RequestOpts): Promise<Tournament[]> {
  return getList<Raw>("/tournaments", opts).then(rows => rows.map(mapTournament));
}

export function teams(opts?: RequestOpts): Promise<TeamRecord[]> {
  return getList<Raw>("/teams", opts).then(rows => rows.map(mapTeamRecord));
}

export function teamsForConf(conf: string, opts?: RequestOpts): Promise<TeamRecord[]> {
  return getList<Raw>(`/teams/${encodeURIComponent(conf)}`, opts).then(rows => rows.map(mapTeamRecord));
}

export async function teamDetail(conf: string, code: string, opts?: RequestOpts): Promise<TeamDetail | null> {
  const raw = await getOne<Raw>(`/teams/${encodeURIComponent(conf)}/${encodeURIComponent(code)}`, opts);
  if (raw === null) return null;
  return buildTeamDetail(conf, code, raw, opts);
}

export function playerStats(conf: string, opts?: RequestOpts): Promise<PlayerStats[]> {
  return getList<Raw>(`/stats/players/${encodeURIComponent(conf)}`, opts).then(rows => rows.map(mapPlayerStats));
}

export function teamStats(conf: string, opts?: RequestOpts): Promise<TeamStats[]> {
  return getList<Raw>(`/stats/teams/${encodeURIComponent(conf)}`, opts).then(rows => rows.map(mapTeamStats));
}

export function championStats(conf: string, role?: Role | null, opts?: RequestOpts): Promise<ChampionStats[]> {
  const path = role
    ? `/stats/champions/${encodeURIComponent(conf)}/${encodeURIComponent(role)}`
    : `/stats/champions/${encodeURIComponent(conf)}`;
  return getList<Raw>(path, opts).then(rows => rows.map(mapChampionStats));
}

export function matchData(matchId: string, opts?: RequestOpts): Promise<RiotMatch | null> {
  return getOne<RiotMatch>(`/m/${encodeURIComponent(matchId)}`, opts);
}

export function articleViews(slug: string, opts?: RequestOpts): Promise<{ article: boolean; views: number }> {
  return getOne<{ article?: boolean; views?: number }>(`/articles/view/${encodeURIComponent(slug)}`, opts).then(r => ({
    article: r?.article === true,
    views: num(r?.views as Numeric, 0),
  }));
}

export function bumpArticleView(slug: string, opts?: RequestOpts): Promise<boolean> {
  return post<{ success?: boolean }>(`/articles/view/${encodeURIComponent(slug)}`, undefined, opts)
    .then(r => r?.success === true)
    .catch(() => false);
}

export const api = {
  tournaments,
  teams,
  teamsForConf,
  teamDetail,
  playerStats,
  teamStats,
  championStats,
  matchData,
  articleViews,
  bumpArticleView,
};
