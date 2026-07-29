/**
 * The CCS API client. Every function returns a normalized shape from `./types`.
 *
 * Endpoints marked PROPOSED do not exist upstream yet; because `getList` treats a 404 as
 * absence, they resolve to `[]` until the tournament-bot side ships them. See the gap
 * analysis for the intended contracts.
 */

import { getList, getOne, isAbort, post, type RequestOpts } from "./http";
import {
  hexFromInt,
  httpsUrl,
  normalizeRole,
  num,
  numOrNull,
  ratio,
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
  RoleKey,
  RosterSlot,
  SeasonRecord,
  StandingRow,
  StatTotals,
  TeamDetail,
  TeamRecord,
  TeamRoster,
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

/** The starting slots, in roster order. Shared with the matchlist, which uses the same keys. */
const ROLE_KEYS: readonly RoleKey[] = ["top", "jg", "mid", "bot", "sup"];

/**
 * A roster slot, or `null` for an unfilled one.
 *
 * A slot with no usable `profileId` is treated as unfilled: `profileId` is the only part that
 * joins to anything, so a slot without one cannot be rendered or looked up.
 */
function mapRosterSlot(raw: unknown): RosterSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = asRaw(raw);
  const profileId = numOrNull(s.profileId as Numeric);
  if (profileId === null) return null;
  return { profileId, name: strOrNull(s.name) };
}

function mapRoster(raw: Raw): TeamRoster {
  const slots = {} as Record<RoleKey, RosterSlot | null>;
  for (const k of ROLE_KEYS) slots[k] = mapRosterSlot(raw[k]);
  return {
    ...slots,
    subs: Array.isArray(raw.subs)
      ? raw.subs.map(mapRosterSlot).filter((s): s is RosterSlot => s !== null)
      : [],
  };
}

const RECORD_COUNTS = ["seriesWins", "seriesLosses", "gameWins", "gameLosses"] as const;

/**
 * The standings record, or `null` when the response has no `record` field at all.
 *
 * Absence is deliberately not normalized to zeros: `0-0` is a real record upstream (a team that
 * hasn't played), so coercing a missing field to it would report every team as winless on an API
 * too old to serve records.
 */
function mapSeasonRecord(raw: unknown): SeasonRecord | null {
  if (!raw || typeof raw !== "object") return null;
  return pickCounts(asRaw(raw), RECORD_COUNTS);
}

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
    record: mapSeasonRecord(raw.record),
    ...mapRoster(raw),
  };
}

/** Strip a record down to its roster, so `TeamDetail` doesn't carry duplicate identity fields. */
function rosterOf({ top, jg, mid, bot, sup, subs }: TeamRoster): TeamRoster {
  return { top, jg, mid, bot, sup, subs };
}

// ------------------------------------------------------------------ standings

function mapStandingRow(raw: Raw): StandingRow {
  const color = numOrNull(raw.color as Numeric);
  return {
    conf: str(raw.conf),
    code: str(raw.code),
    name: str(raw.name),
    logo: httpsUrl(raw.logo as string),
    color,
    colorHex: hexFromInt(color),
    rank: num(raw.rank as Numeric),
    // Falls back to the bare rank so a row is never left without something to show.
    place: strOrNull(raw.place) ?? String(num(raw.rank as Numeric)),
    gameWinPct: numOrNull(raw.gameWinPct as Numeric),
    streak: strOrNull(raw.streak),
    ...pickCounts(raw, RECORD_COUNTS),
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

/**
 * @param record This team's row from `GET /teams/:conf`, when it could be fetched.
 *
 * That row supplies three things the aggregated endpoint doesn't: the roster, the series record,
 * and identity fields for a team that hasn't played — upstream spreads a null `teamstats` row, so
 * such a team arrives with no `code`, `name`, colour or logo at all.
 */
function buildTeamDetail(conf: string, code: string, raw: Raw, record: TeamRecord | undefined): TeamDetail {
  const hasStats = typeof raw.code === "string";
  const stats = hasStats ? mapTeamStats(raw) : null;
  const color = stats?.color ?? record?.color ?? null;

  const base: Partial<TeamStats> = stats ?? {};
  return {
    ...base,
    code: stats?.code ?? record?.code ?? code,
    name: stats?.name ?? record?.name ?? code,
    conf,
    logo: stats?.logo ?? record?.logo,
    color,
    colorHex: hexFromInt(color),
    hasStats,
    roster: record ? rosterOf(record) : null,
    record: record?.record ?? null,
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

// --------------------------------------------------------------- stat totals

const TOTALS_FIELDS = [
  "teams", "players", "matches", "games", "gameDays", "championsPicked", "championsBanned",
  "kills", "deaths", "assists", "gold", "damage", "cs", "visionScore", "wardsPlaced",
  "wardsCleared", "controlWards", "turrets", "dragons", "barons", "heralds", "grubs",
  "soloKills", "doubleKills", "tripleKills", "quadraKills", "pentaKills",
  "playtimeSeconds", "longestGameSeconds", "shortestGameSeconds",
] as const;

/**
 * Every field goes through `numOrNull`, including the counts.
 *
 * Elsewhere counts use `num` with a zero fallback, because upstream always sends them. Here it
 * would be wrong: this endpoint doesn't exist yet, so a field being absent is the *expected* case
 * during rollout, and coercing it to 0 would put "0 KILLS" on the page.
 */
function mapStatTotals(conf: string, raw: Raw): StatTotals {
  return {
    conf: strOrNull(raw.conf) ?? conf,
    firstGame: strOrNull(raw.firstGame),
    lastGame: strOrNull(raw.lastGame),
    updatedAt: strOrNull(raw.updatedAt),
    ...pickRatios(raw, TOTALS_FIELDS),
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

/**
 * Everything a team page needs, from the two endpoints that hold it.
 *
 * The conf listing is fetched in parallel for the roster and series record — `/teams/:c/:t`
 * carries stats but neither. A failure there is swallowed: both are supplementary, and losing
 * them should not take down a page whose main content arrived fine. Aborts still propagate, so a
 * caller that navigated away isn't handed a half-built result.
 */
export async function teamDetail(conf: string, code: string, opts?: RequestOpts): Promise<TeamDetail | null> {
  const [raw, records] = await Promise.all([
    getOne<Raw>(`/teams/${encodeURIComponent(conf)}/${encodeURIComponent(code)}`, opts),
    teamsForConf(conf, opts).catch((e: unknown) => {
      if (isAbort(e)) throw e;
      return [] as TeamRecord[];
    }),
  ]);
  if (raw === null) return null;
  return buildTeamDetail(conf, code, raw, records.find(t => t.code === code));
}

/**
 * The conf's standings, already ranked.
 *
 * Preserve the order as returned — the tiebreakers are resolved server-side, and head-to-head
 * cannot be reconstructed from any other endpoint this client calls. Needed only where a rank or
 * a streak is shown; a team card's record rides along on `/teams/:conf` for free.
 */
export function standings(conf: string, opts?: RequestOpts): Promise<StandingRow[]> {
  return getList<Raw>(`/standings/${encodeURIComponent(conf)}`, opts).then(rows => rows.map(mapStandingRow));
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

/**
 * Cumulative league totals for one conf.
 *
 * PROPOSED — the route does not exist upstream yet, and `getOne` maps a 404 to `null` without
 * throwing, so this resolves to `null` until it ships and the totals bar simply doesn't render.
 * Nothing needs to change on this side when it does.
 */
export function statTotals(conf: string, opts?: RequestOpts): Promise<StatTotals | null> {
  return getOne<Raw>(`/stats/totals/${encodeURIComponent(conf)}`, opts).then(raw =>
    raw === null ? null : mapStatTotals(conf, raw),
  );
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
  standings,
  playerStats,
  teamStats,
  championStats,
  statTotals,
  matchData,
  articleViews,
  bumpArticleView,
};
