/**
 * The CCS API client. Every function returns a normalized shape from `./types`.
 *
 * One transport wrinkle worth knowing: `getOne` maps a 404 to `null`, because upstream's older data
 * routes signal "no rows" as a 200 with a `null` body and a 404 therefore meant the route didn't exist.
 * The newer stats routes use 404 for a genuinely absent resource, so the two are indistinguishable
 * here. Every caller that can reach the ambiguity reads `null` as "nothing to show" rather than as an
 * error, which is the right answer either way.
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
  RecordBoard,
  RecordRow,
  RecordUnit,
  RecordsResponse,
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

/**
 * Exported for `./admin` and `./teamApplications`: `GET /admin/leagues`, the league writes and the
 * intake toggle all answer with the same row shape `GET /tournaments` serves, and an editor that
 * normalized its own save differently from the list it just updated would show the two disagreeing.
 *
 * The three flags are each omitted rather than defaulted when the wire doesn't carry them. Reading
 * an absent `listed` as `false` would report every existing season as hidden, which is the same trap
 * `active` already documents.
 */
export function mapTournament(input: unknown): Tournament {
  const raw = asRaw(input);
  return {
    conf: str(raw.conf),
    name: str(raw.name),
    shortname: strOrNull(raw.shortname),
    ...(typeof raw.active === "boolean" ? { active: raw.active } : {}),
    ...(typeof raw.listed === "boolean" ? { listed: raw.listed } : {}),
    ...(typeof raw.applicationsOpen === "boolean"
      ? { applicationsOpen: raw.applicationsOpen }
      : {}),
    ...("teamsPublishedAt" in raw ? { teamsPublishedAt: strOrNull(raw.teamsPublishedAt) } : {}),
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

/**
 * Exported for `./feed`: `teamA`/`teamB` on `GET /tournaments/schedule/:id/result` are the same rows
 * `/teams/:conf` serves, rosters and record included, so a match page needs no second call. Mapping
 * them here rather than again over there is what keeps them the same `TeamRecord` the rest of the site
 * holds — and therefore what `toTeam`, `toBadge` and `rosterEntries` already take.
 */
export function mapTeamRecord(raw: Raw): TeamRecord {
  const color = numOrNull(raw.color as Numeric);
  return {
    id: num(raw.id as Numeric),
    code: str(raw.code),
    name: str(raw.name),
    conf: strOrNull(raw.conf),
    logo: httpsUrl(raw.logo as string),
    color,
    colorHex: hexFromInt(color),
    // Absent keys stay absent rather than becoming `null`: a deployment without these columns has
    // no secondary color and no recorded ownership, which is not the same answer as "nobody owns
    // this team". `owner` and each contact are the same slot shape as the playing positions, so
    // they reuse `mapRosterSlot` and link through to a player page identically.
    ...("colorSecondary" in raw ? { colorSecondary: numOrNull(raw.colorSecondary as Numeric) } : {}),
    ...("owner" in raw ? { owner: mapRosterSlot(raw.owner) } : {}),
    ...(Array.isArray(raw.contacts)
      ? {
          contacts: raw.contacts
            .map(mapRosterSlot)
            .filter((slot): slot is RosterSlot => slot !== null),
        }
      : {}),
    record: mapSeasonRecord(raw.record),
    ...mapRoster(raw),
  };
}

/** Strip a record down to its roster, so `TeamDetail` doesn't carry duplicate identity fields. */
function rosterOf({ top, jg, mid, bot, sup, subs }: TeamRoster): TeamRoster {
  return { top, jg, mid, bot, sup, subs };
}

// ------------------------------------------------------------------ standings

/** Last-five results, dropping anything that isn't a W or an L rather than trusting the wire. */
function mapForm(v: unknown): ("W" | "L")[] {
  return Array.isArray(v) ? v.flatMap(x => (x === "W" || x === "L" ? [x] : [])) : [];
}

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
    form: mapForm(raw.form),
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
    profileId: numOrNull(p.profileId as Numeric),
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
    seasonDay: num(raw.seasonDay as Numeric),
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

/** The API returns matchlists unordered; sort chronologically by season day then game. */
function sortMatchlist(entries: MatchlistEntry[]): MatchlistEntry[] {
  return [...entries].sort((a, b) => a.seasonDay - b.seasonDay || a.game - b.game || a.startTime.localeCompare(b.startTime));
}

// --------------------------------------------------------------- team detail

/**
 * @param record This team's row from `GET /teams/:conf`, when it could be fetched.
 *
 * That row supplies three things the aggregated endpoint doesn't: the roster, the series record,
 * and identity fields for a team that hasn't played — upstream spreads a null `teamstats` row, so
 * such a team arrives with no `code`, `name`, color or logo at all.
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
  "playtimeSeconds",
] as const;

/**
 * Every field goes through `numOrNull`, including the counts.
 *
 * Elsewhere counts use `num` with a zero fallback, because upstream always sends them. Here it would be
 * wrong: this endpoint's contract is that `null` means "no data" and never zero — a partly-covered metric
 * reports `null` rather than a confident undercount — so coercing it would put "0 KILLS" on the page. A
 * genuine zero still arrives as `0` and survives.
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

// ------------------------------------------------------------------- records

const RECORD_UNITS: readonly RecordUnit[] = ["int", "dec2", "pct", "signed", "duration"];

/** Unknown units fall back to `int` rather than throwing — a new board should still render. */
const asUnit = (v: unknown): RecordUnit =>
  RECORD_UNITS.includes(v as RecordUnit) ? (v as RecordUnit) : "int";

function mapRecordRow(raw: unknown): RecordRow {
  const r = asRaw(raw);
  return {
    rank: num(r.rank as Numeric),
    value: numOrNull(r.value as Numeric),
    profileId: numOrNull(r.profileId as Numeric),
    name: str(r.name),
    team: str(r.team),
    champ: strOrNull(r.champ),
    champImg: httpsUrl(r.champImg as string) ?? null,
    role: normalizeRole(r.role as string),
    opponent: str(r.opponent),
    seasonDay: num(r.seasonDay as Numeric),
    game: num(r.game as Numeric),
    matchId: str(r.matchId),
    startTime: strOrNull(r.startTime),
  };
}

function mapRecordBoard(raw: unknown): RecordBoard {
  const b = asRaw(raw);
  return {
    id: str(b.id),
    title: str(b.title),
    unit: asUnit(b.unit),
    // Order is the contract: rows arrive best-first and boards arrive in a server-owned order.
    rows: Array.isArray(b.rows) ? b.rows.map(mapRecordRow) : [],
  };
}

function mapRecords(conf: string, raw: Raw): RecordsResponse {
  return {
    conf: strOrNull(raw.conf) ?? conf,
    games: numOrNull(raw.games as Numeric),
    lines: numOrNull(raw.lines as Numeric),
    generatedAt: strOrNull(raw.generatedAt),
    players: Array.isArray(raw.players) ? raw.players.map(mapRecordBoard) : [],
    teams: Array.isArray(raw.teams) ? raw.teams.map(mapRecordBoard) : [],
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

/** Cumulative league totals for one conf. A conf with no games returns an object of nulls, not `null`. */
export function statTotals(conf: string, opts?: RequestOpts): Promise<StatTotals | null> {
  return getOne<Raw>(`/stats/totals/${encodeURIComponent(conf)}`, opts).then(raw =>
    raw === null ? null : mapStatTotals(conf, raw),
  );
}

/**
 * Single-game record boards for one conf. `limit` is rows per board, clamped to 1–25 server-side.
 *
 * `minMinutes=0` is sent explicitly rather than omitted. It is a minimum game length upstream applies to
 * rate boards, guarding against a short surrender producing a CS/min no real game can beat — but its
 * default is 20, so leaving it off would silently filter rather than not filter. CCS games are already
 * guaranteed to run past fourteen minutes, so every game counts and no board carries a caveat.
 */
export function records(
  conf: string,
  params?: { limit?: number },
  opts?: RequestOpts,
): Promise<RecordsResponse | null> {
  const q = new URLSearchParams({ minMinutes: "0" });
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  return getOne<Raw>(`/stats/records/${encodeURIComponent(conf)}?${q.toString()}`, opts).then(raw =>
    raw === null ? null : mapRecords(conf, raw),
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
