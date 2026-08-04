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
   * Whether this season is running now. Served by the API and writable by a site admin through
   * `PATCH /admin/leagues/:conf`.
   *
   * Still optional on the type: a deployment older than the column omits it, and reading absent as
   * `false` would report every season as finished. `resolveActiveConfs` treats it that way too.
   */
  active?: boolean;
}

/** The five starting-slot keys, as the API names them. Shared by rosters and matchlists. */
export type RoleKey = "top" | "jg" | "mid" | "bot" | "sup";

/**
 * One roster slot.
 *
 * A slot names a **person, not an account**: `profileId` is a `profiles.id`, which is the same
 * key as `PlayerStats.id`, so a slot joins straight to that player's statistics.
 *
 * These fields used to be raw `char(78)` PUUIDs, which consumers had to resolve to a display
 * name themselves. That stopped being possible when Riot removed summoner-v4 `by-name`, so
 * rosters now key on profiles and the API serves the name it already knows.
 */
export interface RosterSlot {
  profileId: number;
  /**
   * Riot ID (`gameName#tagLine`), or `null` when Riot will not resolve the account — banned
   * and deleted accounts stop resolving. That is normal rather than an error: `profileId` is
   * still valid and still joins to stats, so render a fallback instead of dropping the slot.
   */
  name: string | null;
}

/**
 * A team's declared roster.
 *
 * This is the only view of a roster that includes players with no recorded games — a benched
 * player, or anyone yet to play, appears here and nowhere else. Rosters derived from
 * `playerstats` can only ever show people who have already played.
 */
export interface TeamRoster {
  /** An unfilled starting slot is `null`. */
  top: RosterSlot | null;
  jg: RosterSlot | null;
  mid: RosterSlot | null;
  bot: RosterSlot | null;
  sup: RosterSlot | null;
  /** `[]` when the bench is empty; never contains empty slots. */
  subs: RosterSlot[];
}

/**
 * A team's standings record.
 *
 * Joined on `(conf, code)` — the key `teams` is unique on — so it stays exact even on the
 * all-confs `/teams`, where two confs can share a team code. Forfeits are included, which is why
 * this is worth taking from the API: forfeits exist outside `matchlist`, so a record counted from
 * played games disagrees with it.
 */
export interface SeasonRecord {
  /** The standings record, in **series**. A 2-1 series win is one win and three games. */
  seriesWins: number;
  seriesLosses: number;
  /** Individual games. A tiebreaker input only — never rank on these. */
  gameWins: number;
  gameLosses: number;
}

/**
 * One row of `GET /standings/:conf` — the same numbers as `SeasonRecord`, ranked and with a
 * streak, which the `/teams` record deliberately omits (it would cost a second query on a hot
 * endpoint).
 *
 * **The rows arrive ranked; do not re-sort them.** Series record, then game win percentage, then
 * head-to-head among the teams still level — head-to-head in particular cannot be computed from
 * anything else this client fetches.
 */
export interface StandingRow extends SeasonRecord {
  conf: string;
  code: string;
  name: string;
  logo?: string;
  color: number | null;
  colorHex: string;
  /**
   * Position, 1-based. Teams level on every tiebreaker **share** a rank, and a shared rank
   * consumes the positions it covers — three teams tied at 2 are followed by rank 5.
   */
  rank: number;
  /** `rank` as displayed, marking a tie: `"T-2"` rather than `"2"`. */
  place: string;
  /** 0–1, the first tiebreaker. Exposed so a table can show why two teams are separated. */
  gameWinPct: number | null;
  /**
   * Current run of series results (`"W2"`, `"L1"`), or `null` before the team has a decided
   * series. Undecided series are skipped rather than breaking the run.
   */
  streak: string | null;
  /**
   * The last five decided series, **most recent last**. `[]` for a team with none yet.
   *
   * It exists because `streak` cannot tell a one-game win streak after four losses (`"W1"`,
   * `["L","L","L","L","W"]`) from a team that has won four of its last five (`"L1"`,
   * `["W","W","W","W","L"]`). Skips undecided series on exactly the same rule as `streak`, from the
   * same rows, so the two can never disagree about what counts as a result.
   */
  form: ("W" | "L")[];
}

/** A row of the `teams` table: roster slots, branding and the standings record. */
export interface TeamRecord extends TeamRoster {
  id: number;
  code: string;
  name: string;
  conf: string | null;
  logo?: string;
  /** Raw integer colour; `null` or `0` both mean unset. */
  color: number | null;
  /** `color` rendered as CSS hex, falling back when unset. */
  colorHex: string;
  /**
   * The `record` field of the response — the team's standings, not to be confused with this
   * interface's name.
   *
   * Upstream never omits it, and a team that has played nothing is `0-0` rather than absent. So
   * `null` here means the field was missing entirely — an API too old to serve it — and must not
   * be shown as `0-0`, which would read as a real record.
   *
   * Carries no streak and no rank: for those, ask `GET /standings/:conf` (`StandingRow`).
   */
  record: SeasonRecord | null;
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
  /**
   * `profiles.id`, the durable key for a person — `null` when the puuid isn't linked to a profile.
   *
   * Before this existed the only key a per-game line and a per-season row shared was the Riot ID
   * string: a user-editable display name, ambiguous between two accounts with the same game name, and
   * `null` outright for a banned account. This is what lets a matchlist line reach a scouting report.
   */
  profileId: number | null;
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

export type MatchlistRoleKey = RoleKey;

/** One *game* (not series) from a team's point of view. */
export interface MatchlistEntry {
  matchId: string;
  conf: string;
  seasonDay: number;
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
  /**
   * The declared roster, from `GET /teams/:conf` — the aggregated team endpoint does not carry
   * it. `null` only when that lookup failed or the team is missing from the conf listing; an
   * empty roster is a `TeamRoster` with null slots, not `null`.
   */
  roster: TeamRoster | null;
  /**
   * The series record, from the same `GET /teams/:conf` row as the roster.
   *
   * Distinct from the `wins`/`losses` inherited from `TeamStats`, which are individual **games**
   * out of `teamstats`. Ranking is on series; do not present one as the other.
   */
  record: SeasonRecord | null;
  /**
   * Stat lines for this team. Keyed per role, so a player who swapped roles has several rows
   * here and is *not* the same thing as a roster slot — see `joinRoster` in `lib/roster.ts`.
   */
  players: PlayerStatsRanked[];
  bannedAgainst: BanCount[];
  bannedBy: BanCount[];
  matchlist: MatchlistEntry[];
}

/**
 * League-wide cumulative totals for one conf — the figures across the top of the Stats page.
 *
 * **Every metric is nullable, and `null` is not zero.** That is the endpoint's own contract, not a
 * rollout artefact: a partly-covered metric reports `null` rather than a confident undercount, because
 * upstream guards every nullable column with `CASE WHEN count(*) = count(col) THEN sum(col) END`. Void
 * grubs are the standing example — `objectives.horde` doesn't exist before patch 14.1, so `null` is the
 * permanent and correct answer for older confs. A genuine zero is still sent as `0`, so the two are
 * distinguishable, and the bar omits a `null` tile rather than rendering "0 KILLS".
 *
 * No superlatives here by design — longest and shortest game belong to `/stats/records/:conf`, where the
 * tie rules and the not-a-game floor already live and where a row can be clicked through to the game.
 * `firstGame`/`lastGame` stay because they bound the season rather than crown a game.
 */
export interface StatTotals {
  /** Would be `null` on the all-conf `GET /stats/totals`, which this client doesn't call. */
  conf: string;

  // Counts of things
  teams: number | null;
  players: number | null;
  /** Series, not games — the same unit the standings rank on. */
  matches: number | null;
  games: number | null;
  /** Distinct calendar days with a game — the old dashboard's "game nights". */
  gameDays: number | null;
  championsPicked: number | null;
  championsBanned: number | null;

  // Cumulative sums
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  gold: number | null;
  damage: number | null;
  cs: number | null;
  visionScore: number | null;
  wardsPlaced: number | null;
  wardsCleared: number | null;
  controlWards: number | null;
  turrets: number | null;
  dragons: number | null;
  barons: number | null;
  heralds: number | null;
  grubs: number | null;
  soloKills: number | null;
  doubleKills: number | null;
  tripleKills: number | null;
  quadraKills: number | null;
  pentaKills: number | null;

  /**
   * Total time played across every game, in seconds.
   *
   * One duration per game, not per player — but there is no game-duration column in the schema, so the
   * source is the per-match maximum of each participant's `timePlayed`. Close, and a proxy.
   */
  playtimeSeconds: number | null;
  /** ISO timestamps bounding the season's games. */
  firstGame: string | null;
  lastGame: string | null;
  /** When the underlying aggregate was last refreshed, for a "data as of" caption. */
  updatedAt: string | null;
}

// ------------------------------------------------------------------- records

/** How to format a board's `value`. The value itself is always raw, so a bar can scale it. */
export type RecordUnit = "int" | "dec2" | "pct" | "signed" | "duration";

/**
 * One entry on a record board — a single side of a single game.
 *
 * On a **team** board `profileId`, `champ`, `champImg` and `role` are all `null` and `name` carries the
 * team code. On a player board `profileId` can still be `null` when the puuid isn't linked to a profile;
 * the row ranks regardless, it just can't be linked through to a player.
 */
export interface RecordRow {
  /** Ties **share** a rank, so a board's rows can run past the requested limit. */
  rank: number;
  value: number | null;
  profileId: number | null;
  name: string;
  team: string;
  champ: string | null;
  champImg: string | null;
  role: Role | null;
  opponent: string;
  seasonDay: number;
  matchId: string;
  /** Which game of the series. */
  game: number;
  startTime: string | null;
}

/**
 * One board. `id`, `title`, `unit`, `note` and the board order are all server-owned — which boards
 * exist and what they are called is a league decision, so render them off the wire rather than
 * hardcoding a list.
 */
export interface RecordBoard {
  /** Stable slug, safe as a React key. */
  id: string;
  title: string;
  unit: RecordUnit;
  /**
   * Best first. **Do not re-sort.** An empty board is still a board and keeps its title.
   *
   * Can be longer than the requested limit, because tied rows share a rank and upstream returns all of
   * them rather than picking one arbitrarily.
   */
  rows: RecordRow[];
  // The wire also carries a `note` naming the minimum game length applied to rate boards. It isn't
  // modelled here: this client asks for no minimum, so there is never a caveat to report.
}

export interface RecordsResponse {
  conf: string;
  /** Games considered, after the 300-second not-a-game floor. */
  games: number | null;
  /** Player performances considered — the "out of N" denominator. */
  lines: number | null;
  generatedAt: string | null;
  players: RecordBoard[];
  teams: RecordBoard[];
}

// -------------------------------------------------------------------- scouting

/** One entry of `GET /stats/scout/:conf` — enough to populate a player picker. */
export interface ScoutIndexEntry {
  profileId: number;
  /** A banned or deleted Riot account is normal. */
  name: string | null;
  /** The team this player has played most for in the conf. */
  team: string;
  games: number;
  /** Most-played first. */
  roles: Role[];
}

/**
 * Season aggregate for one player.
 *
 * `kp` and `csm` are ratios of sums rather than means of per-game ratios — a 40-minute game should not
 * weigh the same as a 20-minute one. `kp` is `null` when the side recorded no kills at all; `gd14` is
 * averaged over only the games that have a 14-minute snapshot.
 */
export interface ScoutTotals {
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  /** May be `Infinity` — the API's convention for a deathless aggregate. */
  kda: number;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  avgDmg: number | null;
  avgCs: number | null;
  csm: number | null;
  kp: number | null;
  gd14: number | null;
}

/** One champion in a player's pool for the season. */
export interface ScoutChamp {
  champ: string;
  champId: number;
  img: string | null;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  /** May be `Infinity`. */
  kda: number;
}

/**
 * The lane opponent on one game.
 *
 * Carries less than a full line — no CS, no lane diffs, no kill participation. `name` can be `null` for a
 * banned account, so test presence on the object rather than on the name.
 */
export interface ScoutOpponent {
  profileId: number | null;
  name: string | null;
  champ: string | null;
  champImg: string | null;
  kills: number;
  deaths: number;
  assists: number;
  /** May be `Infinity`. */
  kda: number;
  dmg: number;
}

/** One game in a player's season, **oldest first** as served, because it drives a form reading. */
export interface ScoutGame {
  matchId: string;
  game: number;
  seasonDay: number;
  startTime: string | null;
  durationS: number;
  team: string;
  opponent: string;
  win: boolean;
  blueside: boolean;
  role: Role | null;
  champ: string | null;
  champId: number | null;
  champImg: string | null;
  kills: number;
  deaths: number;
  assists: number;
  /** May be `Infinity`. */
  kda: number;
  dmg: number;
  cs: number;
  csm: number | null;
  gd8: number | null;
  gd14: number | null;
  kp: number | null;
  visionScore: number;
  /** The denominator of `kp`. */
  teamKills: number;
  /** `null` when the lane opponent can't be resolved — the game is still kept. */
  vs: ScoutOpponent | null;
}

/** One opponent faced in the lane this season. A game with no resolvable opponent contributes none. */
export interface ScoutMatchup {
  profileId: number;
  name: string | null;
  team: string;
  games: number;
  wins: number;
  losses: number;
  /**
   * Newest first, but the element shape is undocumented upstream — left unread rather than guessed at.
   */
  games_detail: unknown[];
}

/**
 * One player's scouting report for one conf. Strictly per-season: career totals and cross-season
 * champion pools belong to a future `/players/:profileId`.
 *
 * `name` on any row is that player's Riot ID *now* — renames propagate through historical data, so an
 * old game is attributed to the current name. Nothing here can render who a player was called at the
 * time, and the UI should not imply otherwise.
 */
export interface ScoutReport {
  profileId: number;
  name: string | null;
  conf: string;
  teams: string[];
  roles: Role[];
  totals: ScoutTotals;
  champs: ScoutChamp[];
  timeline: ScoutGame[];
  matchups: ScoutMatchup[];
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
