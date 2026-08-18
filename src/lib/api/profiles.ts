/**
 * Public player-profile reads and the player-owned presentation write.
 *
 * Two things make this unlike every other public read in here, and both shape the mapping below.
 *
 * **It reads Riot at request time.** Everything else this client talks to is served from the API's
 * own database, so a payload either arrives whole or the request failed. Here each account is
 * assembled from three Riot calls that fail independently: `riotId`, `summonerLevel` and
 * `profileIconUrl` are each separately nullable, and a null `riotId` is *routine* rather than an
 * error — a banned or deleted account stops resolving. One account failing does not sink its
 * siblings.
 *
 * **`ranked: []` and `ranked: null` are different answers, and this module exists to keep them
 * apart.** Empty means we asked and the account is unranked. Null means Riot would not tell us —
 * a rate limit, an outage, an expired key. Collapsing them puts "Unranked" on a Challenger
 * player's page with nothing downstream able to tell that it happened, so the union survives all
 * the way to the component and callers have to branch on it.
 *
 * Entries are rendered in the order served: upstream sorts solo ahead of flex so that `ranked[0]`
 * is the headline rank, and re-sorting here would throw that away.
 *
 * **Teams arrive hydrated at two different weights, and the difference is deliberate.**
 * `career.teams` carries the full `TeamRecord` that `GET /teams` serves — roster and standings
 * included — because it is a short list the page renders in detail. Opponents, which repeat on
 * every game and every series, carry only `TeamMetadata`: identity and branding, no roster, no
 * record. Both are mapped so a logo and colour resolve the same way here as anywhere else on the
 * site; the compact one is not a `TeamRecord` with holes in it, and typing it as one would invite a
 * caller to read a `record` that was never sent.
 *
 * **`opponent` is the object and `opponentCode` is the string**, on games, series and personal
 * bests alike. The code is what the result was recorded with and always survives; `opponent` is
 * null when a historical team's metadata is gone, which is exactly when the code is the only label
 * left. Reading them the other way round — code as the fallback *of* the object — is the bug this
 * pairing exists to prevent.
 *
 * **`career.laneMatchups` is per conference and is never merged across them.** Two rows for one
 * opponent in two seasons is the served answer, not a duplicate to fold: upstream builds them from
 * the per-conf scout reports, and summing them here would invent a career matchup record the API
 * deliberately does not compute. `conf` is therefore part of a row's identity, not decoration.
 *
 * **`accolades` is career-wide even when `?conf=` scopes everything else.** That is upstream's
 * decision, not an oversight here, and the UI has to say so — a trophy silently vanishing when a
 * reader picks a league would look like a bug.
 */

import { mapTeamRecord } from "./client";
import { credentialedRequest } from "./credentialed";
import { getOne, post, type RequestOpts } from "./http";
import { hexFromInt, httpsUrl, normalizeRole, numOrNull, type Numeric, type Role } from "./normalize";
import type { TeamRecord } from "./types";

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** The two queues upstream serves. Riot's TFT and arena standings are dropped before we see them. */
export const RANKED_QUEUES = ["solo", "flex"] as const;
export type RankedQueue = (typeof RANKED_QUEUES)[number];

const isQueue = (v: unknown): v is RankedQueue =>
  typeof v === "string" && (RANKED_QUEUES as readonly string[]).includes(v);

export interface AccountRank {
  queue: RankedQueue;
  /** The metal — `GOLD`, in Riot's own casing. */
  tier: string;
  /** The step within the tier — `II`. Riot calls this `rank`; shown with `tier`, never alone. */
  division: string;
  leaguePoints: number;
  /** Per queue, and never summed with another queue's — a combined total hides which tier is which. */
  wins: number;
  losses: number;
  hotStreak: boolean;
}

export interface LinkedAccount {
  puuid: string;
  /** `gameName#tagLine`, or null when Riot will not resolve the account. */
  riotId: string | null;
  summonerLevel: number | null;
  profileIconUrl: string | null;
  /** `[]` is unranked. `null` is "Riot would not tell us" — see the header. */
  ranked: AccountRank[] | null;
}

export const NICKNAME_MAX = 24;
export const PRONOUNS_MAX = 32;
export const PRONUNCIATION_MAX = 160;

export interface ProfilePresentation {
  id: number;
  nickname: string;
  pronouns: string | null;
  pronunciation: string | null;
}

export interface ProfilePresentationInput {
  nickname: string;
  pronouns: string | null;
  pronunciation: string | null;
}

/** Every profile statistic is numeric; Postgres numeric values simply cross the wire as strings. */
export type ProfileMetrics = Record<string, number | null>;

/**
 * A team's identity, without its roster or record.
 *
 * Upstream's compact reference for teams that repeat across a payload. Structurally a subset of
 * `TeamRecord`, so anything that only needs a name, a logo and a colour takes this and accepts
 * either — but it is its own type, because a `record` this never carried must not look absent.
 */
export interface TeamMetadata {
  id: number;
  code: string;
  name: string;
  conf: string | null;
  logo?: string;
  /** Raw integer colour; `null` or `0` both mean unset. */
  color: number | null;
  /** `color` rendered as CSS hex, falling back when unset. */
  colorHex: string;
}

export interface ProfileBestGame {
  matchId: string;
  scheduleMatchId: number | null;
  conf: string;
  game: number | null;
  startTime: string | null;
  champId: number | null;
  champ: string | null;
  /** The opposing team's code, as recorded with the result. Always present when there was one. */
  opponentCode: string | null;
  /** Its metadata, or null when that team no longer has any — fall back to `opponentCode`. */
  opponent: TeamMetadata | null;
}

export interface ProfilePersonalBest {
  value: number;
  killsAndAssists: number | null;
  game: ProfileBestGame;
}

export interface ProfileRoleBreakdown {
  role: Role;
  games: number;
  wins: number;
  losses: number;
  winPercent: number | null;
  kda: number | null;
}

export interface ProfileTeamBreakdown {
  conf: string;
  /** The bare code, always present. The label of last resort when `team` is null. */
  teamCode: string;
  /** Hydrated identity, or null for a historical stats row whose team no longer exists. */
  team: TeamRecord | null;
  games: number;
  wins: number;
  losses: number;
  firstPlayed: string | null;
  lastPlayed: string | null;
}

/**
 * One opponent faced in the lane, **within one conference**.
 *
 * A player met across three seasons is three rows, and `(conf, profileId)` — not `profileId` — is
 * what identifies one. See the header: upstream builds these per conf from the scout reports and
 * merging them here would fabricate a career record it declines to compute.
 *
 * `name` is that opponent's Riot ID *now* and can be null for a banned account. `games_detail` is
 * served and deliberately unmapped: upstream documents its element shape as undocumented, so there
 * is nothing here that could read it safely.
 */
export interface ProfileLaneMatchup {
  conf: string;
  profileId: number;
  name: string | null;
  team: string;
  games: number;
  wins: number;
  losses: number;
}

/** One trophy on a profile. Career-wide; never filtered by the league selector. */
export interface ProfileAccolade {
  accoladeId: number;
  definitionId: number;
  /**
   * `team` or `individual` upstream, but kept as an opaque string: it only picks an icon, and the
   * accolade's `name` is the content. An unfamiliar kind gets the generic trophy rather than being
   * dropped, which is the one place this module doesn't drop an unrecognised enum member.
   */
  kind: string;
  name: string;
  description: string | null;
  /** Distinguishes repeat issuances of one definition — `Group A`, `Week 4`. */
  label: string | null;
  /** Null is a site-wide award, not a missing league. */
  conf: string | null;
  awardedAt: string | null;
  team: { id: number; code: string; name: string } | null;
}

export interface ProfileChampionBreakdown {
  champId: number | null;
  champ: string | null;
  img: string | null;
  games: number;
  wins: number;
  losses: number;
  winPercent: number | null;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  csMin: number | null;
  damageMin: number | null;
  goldDiffAt14: number | null;
}

/** `opponent` and `opponentCode` are inherited from `ProfileBestGame` — every game ref carries them. */
export interface ProfileGame extends ProfileBestGame {
  durationS: number;
  team: string;
  win: boolean;
  blueside: boolean | null;
  role: Role | null;
  champImg: string | null;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  damage: number;
  damageMin: number | null;
  cs: number;
  csMin: number | null;
  goldDiffAt8: number | null;
  goldDiffAt14: number | null;
  csDiffAt14: number | null;
  xpDiffAt14: number | null;
  killParticipation: number | null;
  visionScore: number;
  visionScoreMin: number | null;
}

export interface ProfileMatch {
  seriesId: string;
  scheduleMatchId: number | null;
  conf: string;
  team: string;
  opponentCode: string | null;
  opponent: TeamMetadata | null;
  gameWins: number;
  gameLosses: number;
  gamesPlayed: number;
  startTime: string | null;
  gameIds: string[];
}

export interface ProfileLinks {
  opggMultisearch: string | null;
  opggComplete: boolean;
  unresolvedPuuids: string[];
}

export interface PlayerProfile {
  profile: ProfilePresentation;
  filter: { conf: string | null; availableConferences: string[] };
  accounts: LinkedAccount[];
  links: ProfileLinks;
  /** Career-wide regardless of `?conf=`. See the header. */
  accolades: ProfileAccolade[];
  career: {
    totals: ProfileMetrics;
    personalBests: Record<string, ProfilePersonalBest | null>;
    roles: ProfileRoleBreakdown[];
    teams: ProfileTeamBreakdown[];
    champions: ProfileChampionBreakdown[];
    /**
     * Per conference, ordered by conf and then games descending. Never merged — see the header.
     * A game whose lane opponent couldn't be resolved contributes to no row, so these do not sum
     * to `totals.games`.
     */
    laneMatchups: ProfileLaneMatchup[];
  };
  games: ProfileGame[];
  matches: ProfileMatch[];
}

export const ACCOUNT_REFRESH_STATUSES = [
  "refreshed",
  "recently_refreshed",
  "partial",
  "stale",
  "unavailable",
] as const;
export type AccountRefreshStatus = (typeof ACCOUNT_REFRESH_STATUSES)[number];

export interface ProfileAccountRefresh {
  profileId: number;
  accounts: LinkedAccount[];
  refresh: { puuid: string; status: AccountRefreshStatus }[];
  links: ProfileLinks;
}

function mapRank(value: unknown): AccountRank[] {
  const r = asRaw(value);
  // An entry we can't name a queue for is dropped rather than repaired: a rank shown under the
  // wrong queue is worse than one missing, and upstream already filtered the queues it serves.
  if (!isQueue(r.queue)) return [];
  const tier = strOrNull(r.tier);
  if (!tier) return [];

  return [
    {
      queue: r.queue,
      tier,
      division: strOrNull(r.division) ?? "",
      leaguePoints: int(r.leaguePoints),
      wins: int(r.wins),
      losses: int(r.losses),
      hotStreak: r.hotStreak === true,
    },
  ];
}

function mapAccount(value: unknown): LinkedAccount[] {
  const r = asRaw(value);
  const puuid = strOrNull(r.puuid);
  if (!puuid) return [];

  return [
    {
      puuid,
      riotId: strOrNull(r.riotId),
      summonerLevel: intOrNull(r.summonerLevel),
      profileIconUrl: strOrNull(r.profileIconUrl),
      // The one field where absent and empty must not converge. Anything that isn't an array —
      // an explicit null, or a deployment that doesn't serve the key — is "we couldn't ask".
      ranked: Array.isArray(r.ranked) ? r.ranked.flatMap(mapRank) : null,
    },
  ];
}

const bool = (v: unknown): boolean => v === true;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((entry): entry is string => typeof entry === "string" && entry !== "") : [];

function metric(v: unknown): number | null {
  if (typeof v === "string" && /^infinity$/i.test(v.trim())) return Infinity;
  return numOrNull(v as Numeric);
}

function metrics(value: unknown): ProfileMetrics {
  return Object.fromEntries(Object.entries(asRaw(value)).map(([key, v]) => [key, metric(v)]));
}

function mapLinks(value: unknown): ProfileLinks {
  const r = asRaw(value);
  return {
    opggMultisearch: strOrNull(r.opggMultisearch),
    opggComplete: bool(r.opggComplete),
    unresolvedPuuids: strings(r.unresolvedPuuids),
  };
}

function mapPresentation(value: unknown): ProfilePresentation | null {
  const r = asRaw(value);
  const id = intOrNull(r.id);
  if (id === null) return null;
  return {
    id,
    nickname: strOrNull(r.nickname) ?? "Unknown player",
    pronouns: strOrNull(r.pronouns),
    pronunciation: strOrNull(r.pronunciation),
  };
}

function mapBestGame(value: unknown): ProfileBestGame | null {
  const r = asRaw(value);
  const matchId = strOrNull(r.matchId);
  const conf = strOrNull(r.conf);
  if (!matchId || !conf) return null;
  return {
    matchId,
    scheduleMatchId: intOrNull(r.scheduleMatchId),
    conf,
    game: intOrNull(r.game),
    startTime: strOrNull(r.startTime),
    champId: intOrNull(r.champId),
    champ: strOrNull(r.champ),
    opponentCode: strOrNull(r.opponentCode),
    opponent: mapTeamMetadata(r.opponent),
  };
}

function mapPersonalBests(value: unknown): Record<string, ProfilePersonalBest | null> {
  return Object.fromEntries(
    Object.entries(asRaw(value)).map(([key, raw]) => {
      if (raw === null) return [key, null];
      const r = asRaw(raw);
      const game = mapBestGame(r.game);
      const value = metric(r.value);
      return [key, game && value !== null ? { value, killsAndAssists: intOrNull(r.killsAndAssists), game } : null];
    }),
  );
}

function mapRoles(value: unknown): ProfileRoleBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const r = asRaw(entry);
    const role = normalizeRole(strOrNull(r.role));
    if (!role) return [];
    return [{
      role,
      games: int(r.games),
      wins: int(r.wins),
      losses: int(r.losses),
      winPercent: metric(r.winPercent),
      kda: metric(r.kda),
    }];
  });
}

/**
 * A hydrated team, or null.
 *
 * Null covers two cases the UI treats identically: the API hasn't joined this row yet, and the
 * join found nothing because the team's metadata is gone. Both mean "you only have the code".
 * An object without an `id` is rejected rather than mapped, since `mapTeamRecord` would happily
 * produce a `TeamRecord` with id 0 and an empty name.
 */
function mapTeamOrNull(value: unknown): TeamRecord | null {
  const r = asRaw(value);
  return intOrNull(r.id) === null ? null : mapTeamRecord(r);
}

/**
 * The compact opponent reference.
 *
 * `logo` and `color` get exactly the treatment `mapTeamRecord` gives them — `httpsUrl` because some
 * stored logos are plain HTTP, `hexFromInt` because the wire value is an integer — so the same team
 * cannot render one way as an opponent and another way on its own page.
 */
function mapTeamMetadata(value: unknown): TeamMetadata | null {
  const r = asRaw(value);
  const id = intOrNull(r.id);
  if (id === null) return null;
  const color = numOrNull(r.color as Numeric);
  return {
    id,
    code: strOrNull(r.code) ?? "",
    name: strOrNull(r.name) ?? "",
    conf: strOrNull(r.conf),
    logo: httpsUrl(r.logo as string),
    color,
    colorHex: hexFromInt(color),
  };
}

function mapTeams(value: unknown): ProfileTeamBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const r = asRaw(entry);
    const conf = strOrNull(r.conf);
    // `teamCode` since the team-metadata join; `team` was the code on the deployment before it.
    const teamCode = strOrNull(r.teamCode) ?? strOrNull(r.team);
    if (!conf || !teamCode) return [];
    return [{
      conf,
      teamCode,
      team: mapTeamOrNull(r.team),
      games: int(r.games),
      wins: int(r.wins),
      losses: int(r.losses),
      firstPlayed: strOrNull(r.firstPlayed),
      lastPlayed: strOrNull(r.lastPlayed),
    }];
  });
}

function mapLaneMatchups(value: unknown): ProfileLaneMatchup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const r = asRaw(entry);
    const profileId = intOrNull(r.profileId);
    const conf = strOrNull(r.conf);
    // Without a conf the row has no identity — one opponent met in two seasons is two rows.
    if (profileId === null || !conf) return [];
    return [{
      conf,
      profileId,
      name: strOrNull(r.name),
      team: strOrNull(r.team) ?? "",
      games: int(r.games),
      wins: int(r.wins),
      losses: int(r.losses),
    }];
  });
}

function mapAccolades(value: unknown): ProfileAccolade[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const r = asRaw(entry);
    const accoladeId = intOrNull(r.accoladeId);
    const name = strOrNull(r.name);
    // The name is the whole point of a trophy; an entry without one has nothing to render.
    if (accoladeId === null || !name) return [];
    const team = asRaw(r.team);
    const teamId = intOrNull(team.id);
    return [{
      accoladeId,
      definitionId: int(r.definitionId),
      kind: strOrNull(r.kind) ?? "",
      name,
      description: strOrNull(r.description),
      label: strOrNull(r.label),
      conf: strOrNull(r.conf),
      awardedAt: strOrNull(r.awardedAt),
      team: teamId === null
        ? null
        : { id: teamId, code: strOrNull(team.code) ?? "", name: strOrNull(team.name) ?? "" },
    }];
  });
}

function mapChampions(value: unknown): ProfileChampionBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    const r = asRaw(entry);
    return {
      champId: intOrNull(r.champId),
      champ: strOrNull(r.champ),
      img: strOrNull(r.img),
      games: int(r.games),
      wins: int(r.wins),
      losses: int(r.losses),
      winPercent: metric(r.winPercent),
      kills: int(r.kills),
      deaths: int(r.deaths),
      assists: int(r.assists),
      kda: metric(r.kda),
      csMin: metric(r.csMin),
      damageMin: metric(r.damageMin),
      goldDiffAt14: metric(r.goldDiffAt14),
    };
  });
}

function mapGames(value: unknown): ProfileGame[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const r = asRaw(entry);
    const base = mapBestGame(r);
    const team = strOrNull(r.team);
    if (!base || !team) return [];
    return [{
      ...base,
      durationS: int(r.durationS),
      team,
      win: bool(r.win),
      blueside: typeof r.blueside === "boolean" ? r.blueside : null,
      role: normalizeRole(strOrNull(r.role)),
      champImg: strOrNull(r.champImg),
      kills: int(r.kills), deaths: int(r.deaths), assists: int(r.assists),
      kda: metric(r.kda), damage: int(r.damage), damageMin: metric(r.damageMin),
      cs: int(r.cs), csMin: metric(r.csMin), goldDiffAt8: metric(r.goldDiffAt8),
      goldDiffAt14: metric(r.goldDiffAt14), csDiffAt14: metric(r.csDiffAt14),
      xpDiffAt14: metric(r.xpDiffAt14), killParticipation: metric(r.killParticipation),
      visionScore: int(r.visionScore), visionScoreMin: metric(r.visionScoreMin),
    }];
  });
}

function mapMatches(value: unknown): ProfileMatch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const r = asRaw(entry);
    const seriesId = strOrNull(r.seriesId);
    const conf = strOrNull(r.conf);
    const team = strOrNull(r.team);
    if (!seriesId || !conf || !team) return [];
    return [{
      seriesId,
      scheduleMatchId: intOrNull(r.scheduleMatchId),
      conf,
      team,
      opponentCode: strOrNull(r.opponentCode),
      opponent: mapTeamMetadata(r.opponent),
      gameWins: int(r.gameWins),
      gameLosses: int(r.gameLosses),
      gamesPlayed: int(r.gamesPlayed),
      startTime: strOrNull(r.startTime),
      gameIds: strings(r.gameIds),
    }];
  });
}

function mapPlayerProfile(value: unknown): PlayerProfile | null {
  const r = asRaw(value);
  const presentation = mapPresentation(r.profile);
  if (!presentation) return null;
  const filter = asRaw(r.filter);
  const career = asRaw(r.career);
  return {
    profile: presentation,
    filter: { conf: strOrNull(filter.conf), availableConferences: strings(filter.availableConferences) },
    accounts: Array.isArray(r.accounts) ? r.accounts.flatMap(mapAccount) : [],
    links: mapLinks(r.links),
    accolades: mapAccolades(r.accolades),
    career: {
      totals: metrics(career.totals),
      personalBests: mapPersonalBests(career.personalBests),
      roles: mapRoles(career.roles),
      teams: mapTeams(career.teams),
      champions: mapChampions(career.champions),
      laneMatchups: mapLaneMatchups(career.laneMatchups),
    },
    games: mapGames(r.games),
    matches: mapMatches(r.matches),
  };
}

/**
 * Every Riot account linked to one profile.
 *
 * `null` and `[]` are different answers here too, one level up: `[]` is a profile that has linked
 * nothing, while `null` is the endpoint declining to say — a 404 for a profile that doesn't exist,
 * or a deployment that hasn't mounted the route. `getOne` resolves both to null, and a caller that
 * treated that as "no accounts" would tell a player their accounts had vanished.
 */
export async function profileAccounts(
  profileId: number,
  opts?: RequestOpts,
): Promise<LinkedAccount[] | null> {
  const data = await getOne<Raw>(`/profiles/${profileId}/accounts`, opts);
  if (!data) return null;
  return Array.isArray(data.accounts) ? data.accounts.flatMap(mapAccount) : [];
}

/** Public cross-season player page. Rows are kept in the exact order the API serves. */
export async function playerProfile(
  profileId: number,
  conf?: string | null,
  opts?: RequestOpts,
): Promise<PlayerProfile | null> {
  const suffix = conf ? `?conf=${encodeURIComponent(conf)}` : "";
  const data = await getOne<Raw>(`/profiles/${profileId}${suffix}`, opts);
  return data ? mapPlayerProfile(data) : null;
}

/** Complete-document presentation write; it also atomically completes first-time setup. */
export async function updateMyProfile(input: ProfilePresentationInput): Promise<ProfilePresentation> {
  const data = await credentialedRequest("/profiles/me", { method: "PUT", body: input });
  const presentation = mapPresentation(data);
  if (!presentation) throw new Error("The saved profile response was incomplete.");
  return presentation;
}

const isRefreshStatus = (v: unknown): v is AccountRefreshStatus =>
  typeof v === "string" && (ACCOUNT_REFRESH_STATUSES as readonly string[]).includes(v);

/** Public, targeted Riot refresh. Existing cached account data remains useful on a failed call. */
export async function refreshProfileAccounts(profileId: number): Promise<ProfileAccountRefresh | null> {
  const data = await post<Raw>(`/profiles/${profileId}/accounts/refresh`);
  if (!data) return null;
  const r = asRaw(data);
  return {
    profileId: int(r.profileId, profileId),
    accounts: Array.isArray(r.accounts) ? r.accounts.flatMap(mapAccount) : [],
    refresh: Array.isArray(r.refresh)
      ? r.refresh.flatMap(entry => {
          const item = asRaw(entry);
          const puuid = strOrNull(item.puuid);
          return puuid && isRefreshStatus(item.status) ? [{ puuid, status: item.status }] : [];
        })
      : [],
    links: mapLinks(r.links),
  };
}

/** Namespaced for parity with the other modules' aggregates. */
export const profilesApi = { profileAccounts, playerProfile, updateMyProfile, refreshProfileAccounts };
