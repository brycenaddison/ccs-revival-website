/**
 * Normalized shapes returned by `src/lib/api/client.ts`.
 *
 * These are *not* the wire shapes. Every `numeric` column the API sends as a string is a
 * `number` here, `null` collections are `[]`, and colours/URLs are pre-derived. Counts use
 * `number`; derived statistics use `number | null`, because several are genuinely NULL
 * upstream (divide-by-zero in the views, and ban-only champions from a FULL JOIN).
 */

import type { Role } from "./normalize";

export type { Role } from "./normalize";

/** One entry of a tournament's per-week series format. */
export interface TournamentLayout {
  startingWeek: number;
  bestOf: number;
}

export interface Tournament {
  conf: string;
  name: string;
  /** e.g. "Spring '23". Null for older rows. */
  shortname: string | null;
  layout: TournamentLayout[];
  /**
   * PROPOSED upstream — not yet returned by the API. Until it exists, the current league
   * is resolved from `VITE_ACTIVE_CONFS`. See the gap analysis.
   */
  active?: boolean;
}

/** A row of the `teams` table: roster slots plus branding, no statistics. */
export interface TeamRecord {
  id: number;
  code: string;
  name: string;
  conf: string | null;
  logo?: string;
  /** Raw integer colour; `null` or `0` both mean unset. */
  color: number | null;
  /** `color` rendered as CSS hex, falling back when unset. */
  colorHex: string;
  top: string | null;
  jg: string | null;
  mid: string | null;
  bot: string | null;
  sup: string | null;
  subs: string[];
}

export interface Champ {
  champid: number;
  name: string;
  img: string;
  /** Only present on the team-page variant. */
  splash?: string;
  picks: number | null;
}

/** Aggregated ban count for one champion. */
export interface BanCount {
  championId: number;
  name: string;
  img: string;
  bans: number;
}

/** A single ban within one game. */
export interface MatchBan {
  pickTurn: number;
  championId: number;
  name: string;
  icon: string;
}

export interface PlayerStats {
  name: string;
  /** `profiles.id`. Not unique on its own — see `rowKey`. */
  id: number;
  team: string;
  conf: string;
  role: Role | null;
  logo?: string;

  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  soloKills: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;

  winPercent: number | null;
  /** May be `Infinity` when a player has never died. */
  kda: number;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  csMin: number | null;
  goldMin: number | null;
  goldPercent: number | null;
  killParticipation: number | null;
  jungleProximity: number | null;
  damagePercent: number | null;
  damagePerGold: number | null;
  damageMin: number | null;
  xpMin: number | null;
  visionScoreMin: number | null;
  wardsMin: number | null;
  controlWardsMin: number | null;
  wardsClearedMin: number | null;
  visionScorePercent: number | null;
  goldDiffAt8: number | null;
  csDiffAt8: number | null;
  xpDiffAt8: number | null;
  goldDiffAt14: number | null;
  csDiffAt14: number | null;
  xpDiffAt14: number | null;
  killsAndAssistsAt15: number | null;
  killParticipationAt15: number | null;
  killsAndAssistsAt25: number | null;
  killParticipationAt25: number | null;
  firstBloodPercent: number | null;
  firstBloodedPercent: number | null;
  killPercent: number | null;
  deathPercent: number | null;

  champs: Champ[];

  /**
   * Stable identity for a row.
   *
   * `playerstats` is keyed on `(id, role, team, conf)` by design — stats are tracked
   * separately per role, so one person who played two roles legitimately has two rows and
   * appears twice on a leaderboard. Do not aggregate across roles. `id` alone is therefore
   * not a usable key for UI lists; use this.
   */
  rowKey: string;
}

/** Per-role rank columns, present only on the team-page response. */
export interface PlayerStatsRanked extends PlayerStats {
  /** Number of players in the ranking pool for this role. Null for players with ≤4 games. */
  rankPool: number | null;
  /** Rank within role, by stat key. Null entries mean "not ranked". */
  ranks: Partial<Record<keyof PlayerStats, number | null>>;
}

export interface TeamStats {
  id: number;
  code: string;
  name: string;
  conf: string;
  logo?: string;
  color: number | null;
  colorHex: string;

  games: number;
  wins: number;
  losses: number;
  bluesideWins: number;
  redsideWins: number;

  /** Pre-formatted "m:ss" from the view; kept as text. */
  avgTime: string;

  winrate: number | null;
  bluesideWinrate: number | null;
  redsideWinrate: number | null;
  killDeathRatio: number | null;
  avgKills: number | null;
  avgAssists: number | null;
  avgDeaths: number | null;
  avgKillsAt15: number | null;
  avgKillsAt25: number | null;
  firstBloodPercent: number | null;
  damageMin: number | null;
  goldMin: number | null;
  goldDiffAt14: number | null;
  csMin: number | null;
  csDiffAt14: number | null;
  xpMin: number | null;
  xpDiffAt14: number | null;
  visionScoreMin: number | null;
  wardsPlacedMin: number | null;
  controlWardsPurchasedMin: number | null;
  wardsClearedMin: number | null;
  wardsClearedPercent: number | null;
  firstTowerPercent: number | null;
  avgTowersTaken: number | null;
  avgTowersGiven: number | null;
  firstDragonPercent: number | null;
  percentDragonsTaken: number | null;
  avgDragonsTaken: number | null;
  avgDragonsGiven: number | null;
  firstHeraldPercent: number | null;
  percentHeraldsTaken: number | null;
  avgHeraldsTaken: number | null;
  avgHeraldsGiven: number | null;
  firstBaronPercent: number | null;
  percentBaronsTaken: number | null;
  avgBaronsTaken: number | null;
  avgBaronsGiven: number | null;
}

/** One player's line in a single game. Every field can be absent for an unresolved player. */
export interface MatchlistPlayer {
  name: string | null;
  champ: string | null;
  champSplash?: string;
  kills: number;
  deaths: number;
  assists: number;
  dmg: number;
  cs: number;
  csm: number | null;
  /** May be `Infinity`. */
  kda: number;
  gd8: number | null;
  gd14: number | null;
  kp: number | null;
  /** Jungle proximity — only meaningful for some roles. */
  jp: number | null;
}

export type MatchlistRoleKey = "top" | "jg" | "mid" | "bot" | "sup";

/** One *game* (not series) from a team's point of view. */
export interface MatchlistEntry {
  matchId: string;
  conf: string;
  week: number;
  team: string;
  opponent: string;
  /** Game number within the series. */
  game: number;
  win: boolean;
  /** Duration in seconds. */
  time: number;
  startTime: string;
  blueside: boolean;
  kills: number;
  deaths: number;
  assists: number;
  gold: number | null;
  gd14: number | null;
  towers: number | null;
  dragons: number | null;
  barons: number | null;
  heralds: number | null;
  /**
   * Highest single-player damage in the *whole match*, both teams included.
   * The API calls this `topDmg`, which reads as "the top laner's damage" — it isn't.
   */
  matchMaxDmg: number | null;
  bans: MatchBan[];
  bansAgainst: MatchBan[];
  roles: Record<MatchlistRoleKey, MatchlistPlayer | null>;
}

/**
 * Aggregated team page.
 *
 * The statistics are `Partial` on purpose: upstream spreads a possibly-`null` `teamstats`
 * row, so a team that exists but has not played returns an object with no statistics at
 * all. Identity fields are backfilled from `teams` by the client so `code`/`name` are
 * always present.
 */
export interface TeamDetail extends Partial<Omit<TeamStats, "code" | "name" | "conf">> {
  code: string;
  name: string;
  conf: string;
  /** True when no `teamstats` row existed — i.e. the team has not played yet. */
  hasStats: boolean;
  players: PlayerStatsRanked[];
  bannedAgainst: BanCount[];
  bannedBy: BanCount[];
  matchlist: MatchlistEntry[];
}

export interface ChampionStats {
  champid: number;
  conf: string;
  name: string;
  img: string;
  /** Only set by the per-role endpoint. */
  role: Role | null;

  /** Total games in the conf, used as the denominator for presence. */
  total: number;
  games: number;
  bans: number;
  wins: number;
  losses: number;
  soloKills: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  kills: number;
  deaths: number;
  assists: number;

  avgTime: string;

  pickRate: number | null;
  banRate: number | null;
  presence: number | null;
  avgBanTurn: number | null;
  winPercent: number | null;
  kda: number;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  csMin: number | null;
  goldMin: number | null;
  goldPercent: number | null;
  killParticipation: number | null;
  jungleProximity: number | null;
  damagePercent: number | null;
  damagePerGold: number | null;
  damageMin: number | null;
  xpMin: number | null;
  visionScoreMin: number | null;
  wardsMin: number | null;
  controlWardsMin: number | null;
  wardsClearedMin: number | null;
  visionScorePercent: number | null;
  goldDiffAt8: number | null;
  csDiffAt8: number | null;
  xpDiffAt8: number | null;
  goldDiffAt14: number | null;
  csDiffAt14: number | null;
  xpDiffAt14: number | null;
  killsAndAssistsAt15: number | null;
  killParticipationAt15: number | null;
  killsAndAssistsAt25: number | null;
  killParticipationAt25: number | null;
  firstBloodPercent: number | null;
  firstBloodedPercent: number | null;
  killPercent: number | null;
  deathPercent: number | null;

  bestPlayerName: string | null;
  bestPlayerTeam: string | null;
  bestPlayerLogo?: string;
  bestPlayerGames: number | null;
  bestPlayerKda: number | null;
  bestPlayerWinrate: number | null;
}

/**
 * Raw Riot Match-V5 payload, passed through unmodified by `GET /m/:matchId`.
 * Only the fields the UI reads are declared.
 */
export interface RiotMatch {
  metadata?: { matchId?: string; participants?: string[] };
  info?: {
    gameCreation?: number;
    gameDuration?: number;
    gameVersion?: string;
    platformId?: string;
    queueId?: number;
    participants?: RiotParticipant[];
    teams?: RiotTeam[];
  };
}

export interface RiotParticipant {
  puuid?: string;
  teamId?: number;
  teamPosition?: string;
  individualPosition?: string;
  championId?: number;
  championName?: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
  win?: boolean;
  kills?: number;
  deaths?: number;
  assists?: number;
  totalMinionsKilled?: number;
  neutralMinionsKilled?: number;
  goldEarned?: number;
  totalDamageDealtToChampions?: number;
  totalDamageTaken?: number;
  damageSelfMitigated?: number;
  visionScore?: number;
  wardsPlaced?: number;
  wardsKilled?: number;
  visionWardsBoughtInGame?: number;
  turretKills?: number;
  champLevel?: number;
  item0?: number;
  item1?: number;
  item2?: number;
  item3?: number;
  item4?: number;
  item5?: number;
  item6?: number;
}

export interface RiotTeam {
  teamId?: number;
  win?: boolean;
  bans?: { championId?: number; pickTurn?: number }[];
  objectives?: Record<string, { first?: boolean; kills?: number } | undefined>;
}
