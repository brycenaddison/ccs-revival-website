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
 * record. Both are mapped so a logo and color resolve the same way here as anywhere else on the
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
 * Rows group on opponent identity alone, without role — the same person met mid and then jungle is
 * one row.
 *
 * **`accolades` is career-wide even when `?conf=` scopes everything else.** That is upstream's
 * decision, not an oversight here, and the UI has to say so — a trophy silently vanishing when a
 * reader picks a league would look like a bug.
 *
 * **`accounts` and `unverifiedAccounts` are two different kinds of thing, and the difference is the
 * whole point of the second list.** A verified account is in `profiles.puuids`: it carries match
 * attribution, roster eligibility and statistics, and it arrives with Riot detail — level, icon,
 * rank. A claim is a player saying "this is also me", and upstream lets it do exactly two things:
 * appear on the page and join the OP.GG multisearch. The same account may be claimed by several
 * profiles until one of them proves control, so nothing may read a claim as identity. That is why
 * they are separate fields here rather than one list with a flag — a flag is a thing a caller
 * forgets to check.
 *
 * **A verification check reports failure as data, not as a rejection.** Upstream answers `410` for
 * an expired challenge and `429` for the ten-second cooldown, with a JSON body naming the status —
 * and those bodies carry no `error` key, so `credentialedRequest` would surface `{"status":
 * "expired"}` as the sentence to show. `checkIconVerification` therefore catches those and returns
 * them, so the panel branches on a status the same way whether the answer was 200 or not. Only a
 * genuine fault — a disabled deployment, a Riot outage, a lost session — still rejects, and those
 * do carry a readable message.
 */

import { mapTeamRecord } from "./client";
import { mapPhaseRef, type PhaseRef } from "./phaseRef";
import { credentialedRequest } from "./credentialed";
import { ApiError, getList, getOne, post, type RequestOpts } from "./http";
import {
  colorSecondaryOf,
  hexFromInt,
  httpsUrl,
  normalizeRole,
  numOrNull,
  type Numeric,
  type Role,
} from "./normalize";
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

/**
 * Riot's ladder, low to high. Their API gives no ordering of its own — `tier` is just a string —
 * so any "which account is better" question has to be answered against a list like this one.
 *
 * `EMERALD` sits between platinum and diamond; it was inserted mid-2023 and shifted everything
 * above it. Apex tiers (`MASTER` and up) have no meaningful division: Riot reports `I` for all of
 * them and separates players by LP alone.
 */
const TIER_ORDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
] as const;

/** `IV` is the entry step of a tier and `I` the last one — Riot counts down, so this counts up. */
const DIVISION_ORDER = ["IV", "III", "II", "I"] as const;

/**
 * A single comparable number for one ranked entry.
 *
 * Tier dominates division, which dominates LP, and the multipliers are far enough apart that apex
 * LP (which runs into four digits) can never climb past the tier above it. An unrecognized tier
 * scores `-1` rather than being guessed at: a new tier we don't know about should lose the
 * comparison, not silently win it by sorting as index 0.
 */
export function rankScore(rank: AccountRank): number {
  const tier = (TIER_ORDER as readonly string[]).indexOf(rank.tier.toUpperCase());
  if (tier < 0) return -1;
  const division = (DIVISION_ORDER as readonly string[]).indexOf(rank.division.toUpperCase());
  return tier * 1_000_000 + Math.max(division, 0) * 100_000 + rank.leaguePoints;
}

/** The account's strongest queue, or null when it is unranked or Riot declined to say. */
export function bestRank(account: LinkedAccount): AccountRank | null {
  if (!account.ranked || account.ranked.length === 0) return null;
  return account.ranked.reduce((best, rank) => (rankScore(rank) > rankScore(best) ? rank : best));
}

/**
 * The account that represents the player — their highest rank across every linked account.
 *
 * Which one is "theirs" is not something the API models: a profile is a bag of PUUIDs with no
 * primary flag, and the order they were linked in says nothing about which one they play. Highest
 * rank is the closest available proxy, and it is also the one a reader would pick.
 *
 * Falls back to the first account with an icon (so the page still has an avatar for an unranked
 * player) and then to the first account at all. `null` only when there are none.
 */
export function primaryAccount(accounts: readonly LinkedAccount[]): LinkedAccount | null {
  if (accounts.length === 0) return null;
  let best: LinkedAccount | null = null;
  let bestScore = -1;
  for (const account of accounts) {
    const rank = bestRank(account);
    const score = rank ? rankScore(rank) : -1;
    if (score > bestScore) {
      best = account;
      bestScore = score;
    }
  }
  return best ?? accounts.find(a => a.profileIconUrl) ?? accounts[0];
}

/** Wins over games for one queue. `null` when the queue has no decided games. */
export function rankWinRate(rank: AccountRank): number | null {
  const games = rank.wins + rank.losses;
  return games > 0 ? rank.wins / games : null;
}

export const NICKNAME_MAX = 24;
export const PRONOUNS_MAX = 32;
export const PRONUNCIATION_MAX = 160;

/**
 * A self-reported claim on a Riot account: display data, and nothing else.
 *
 * Not a `LinkedAccount` with fields missing — upstream never asks Riot for a claim's level, icon or
 * rank, because an unproven claim is not somebody's identity and spending the shared key on one
 * would be paying to decorate an assertion. `riotId` is Riot's own canonical spelling of what was
 * submitted, resolved through Account-v1 before the row was written, and nullable for the same
 * routine reason it is on a verified account: a banned or deleted account stops resolving.
 */
export interface UnverifiedAccount {
  claimId: number;
  puuid: string;
  riotId: string | null;
  /** ISO string, like every other date crossing this layer. */
  addedAt: string | null;
}

/** `GET /profiles/:id/accounts` in full: the verified list, the claims, and the OP.GG link. */
export interface ProfileAccounts {
  profileId: number;
  accounts: LinkedAccount[];
  unverifiedAccounts: UnverifiedAccount[];
  links: ProfileLinks;
}

/**
 * Upstream's own limits, mirrored so a field can cap its own input.
 *
 * A Riot game name is 16 characters and a tag 5; upstream rejects longer, and an input that lets
 * someone type 30 characters only to be told no is a worse way to learn that.
 */
export const RIOT_GAME_NAME_MAX = 16;
export const RIOT_TAG_LINE_MAX = 5;

/** `MAX_UNVERIFIED_ACCOUNTS` upstream: the eleventh claim is a `409`, so the form stops at ten. */
export const MAX_UNVERIFIED_ACCOUNTS = 10;

export interface RiotAccountInput {
  gameName: string;
  tagLine: string;
}

/**
 * What adding a claim did.
 *
 * `existing` is a claim that was already there — upstream answers `200` rather than a conflict,
 * because submitting the same account twice is not an error a player needs telling off for.
 * `already_verified` means the account is on the profile *properly*, which is the one outcome that
 * should send the player back to the verified list rather than the claims list.
 */
export type AddAccountResult =
  | { status: "created" | "existing"; account: UnverifiedAccount }
  | { status: "already_verified"; puuid: string; riotId: string | null };

/**
 * A live profile-icon challenge.
 *
 * `reused` is upstream telling us it handed back an unexpired challenge rather than minting one, so
 * the panel can keep quiet instead of announcing a "new" icon that is the same icon. `expiresAt` is
 * the authority on the deadline and `secondsRemaining` is only its value at the moment of the
 * response — a countdown has to be derived from the former, or a panel left open for a minute shows
 * a clock that never moved.
 *
 * **`targetIconId` is the required field and `targetIconUrl` is the convenience.** The id is what the
 * challenge is *about* — it is what the server compares the live icon against — and the URL is
 * derivable from it by the same rule the site already uses for champion squares
 * (`profileIconUrl` in `RiotAccountCards.tsx`). So a missing or unusable URL is not worth failing the
 * whole challenge over: the panel can still show the right icon.
 */
export interface IconChallenge {
  claimId: number;
  targetIconId: number;
  targetIconUrl: string | null;
  expiresAt: string | null;
  secondsRemaining: number;
  reused: boolean;
}

/** Where a verified puuid ended up. `merged` absorbed another profile and is not reversible. */
export const LINK_STATUSES = ["linked", "already_linked", "merged"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

/**
 * Every answer a check can give, successes and refusals alike. See the header for why the refusals
 * are values rather than thrown errors.
 *
 * - `pending` — the live icon is not the target one yet. The normal case, and not a failure.
 * - `cooldown` — checked too soon; `retryAfterSeconds` is how long to wait.
 * - `expired` — the fifteen minutes ran out. Start again.
 * - `exhausted` — thirty checks used on one challenge. Start again.
 * - `missing` — no challenge for this claim; the panel has to start one before checking.
 * - `not_found` — the claim is gone, most likely removed in another tab.
 * - `no_profile` — the session outlived the profile it belonged to.
 */
export type IconCheckResult =
  | { status: "verified"; puuid: string; riotId: string | null; linkStatus: LinkStatus }
  | { status: "pending"; expiresAt: string | null; retryAfterSeconds: number }
  | { status: "cooldown"; retryAfterSeconds: number }
  | { status: "expired" | "exhausted" | "missing" | "not_found" | "no_profile" };

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
 * `TeamRecord`, so anything that only needs a name, a logo and a color takes this and accepts
 * either — but it is its own type, because a `record` this never carried must not look absent.
 */
export interface TeamMetadata {
  id: number;
  code: string;
  name: string;
  conf: string | null;
  logo?: string;
  /** Raw integer color; `null` or `0` both mean unset. */
  color: number | null;
  /** `color` rendered as CSS hex, falling back when unset. */
  colorHex: string;
  /** Secondary branding color; upstream's `teamMetadata` projection carries it. See `TeamRecord`. */
  colorSecondary?: number | null;
}

/** One game's place in the season structure. Defined in `./phaseRef`, shared with the team matchlist. */
export type { PhaseRef } from "./phaseRef";
export { mapPhaseRef } from "./phaseRef";

export interface ProfileBestGame {
  matchId: string;
  scheduleMatchId: number | null;
  conf: string;
  /**
   * Season-wide ordinal for the day this was played — day 1 through day 16 of the season.
   *
   * **A join key first and a label second**, and the repo's rule is to prefer the date; see the
   * "Season day is internal" section of `CLAUDE.md`. It is mapped here because a series card wants
   * to say which week of the season a match belongs to, which a date alone cannot answer for a
   * reader who thinks in weeks — the same reason the records boards already render `W{seasonDay}`.
   * Never put it beside a bracket round number, where "Round 4" and "Week 14" contradict each other.
   *
   * For where in the *structure* a game sits — "playoffs day 2" — read `phase` instead. The two are
   * both served because neither recovers the other.
   */
  seasonDay: number;
  /**
   * Where this game sits in the season's structure, or `null` for a day no published phase covers.
   *
   * **`null` is explicit and load-bearing.** Legacy conferences predate `schedule_match` and the
   * phase list entirely, and an unpublished phase still occupies its season days for the arithmetic
   * while its games read `null` rather than leaking it. Reading absent as "day 1 of the first phase"
   * would invent a placement.
   *
   * Never derive this. Phases are keyed by length rather than start day, so a client would need one
   * `GET /:conf/season` per conference a career spans plus a copy of arithmetic that goes stale the
   * moment structure is edited.
   */
  phase: PhaseRef | null;
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
  /**
   * Rounded average gold difference at 14 minutes against this opponent.
   *
   * **An average, and the only one on this row.** Its denominator is games *with a 14-minute
   * snapshot*, which is not `games` and is not served — so two rows' values cannot be combined
   * here without inventing the weights. `null` when no game against them has a snapshot, which is
   * every pre-2022 season.
   */
  gd14: number | null;
}

/** One trophy on a profile. Career-wide; never filtered by the league selector. */
export interface ProfileAccolade {
  accoladeId: number;
  definitionId: number;
  /**
   * `team` or `individual` upstream, but kept as an opaque string: it only picks an icon, and the
   * accolade's `name` is the content. An unfamiliar kind gets the generic trophy rather than being
   * dropped, which is the one place this module doesn't drop an unrecognized enum member.
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
  /** Every game in a series shares one — see `ProfileBestGame.seasonDay`. */
  seasonDay: number;
  /**
   * Where the series sits in the season's **structure**, or `null` on a day no published phase
   * covers. Served on every game, series and personal best, and the mapper has always read it —
   * the field was just missing from this type, which made a series card the one place that had to
   * fall back to `Week {seasonDay}` even when the phase was right there. Prefer it to `seasonDay`
   * for anything a reader sees; see "Season day is internal" in `CLAUDE.md`.
   */
  phase: PhaseRef | null;
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
  /** Display-only claims. Never identity — see the header. */
  unverifiedAccounts: UnverifiedAccount[];
  /** Built from the verified accounts **and** the claims, which is why it can be ahead of `accounts`. */
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
  /** Carried through unchanged: a claim has nothing to refresh, and dropping it would empty the list. */
  unverifiedAccounts: UnverifiedAccount[];
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

/**
 * One claim.
 *
 * `claimId` is what every write addresses, so an entry without one is unusable and dropped rather
 * than rendered as a row whose buttons cannot work. `status` is not read: upstream sends the literal
 * `"unverified"` on every entry of a field called `unverifiedAccounts`, and storing it would invite
 * a caller to branch on a constant.
 */
function mapUnverifiedAccount(value: unknown): UnverifiedAccount[] {
  const r = asRaw(value);
  const claimId = intOrNull(r.claimId);
  const puuid = strOrNull(r.puuid);
  if (claimId === null || !puuid) return [];

  return [{ claimId, puuid, riotId: strOrNull(r.riotId), addedAt: strOrNull(r.addedAt) }];
}

const mapUnverifiedAccounts = (v: unknown): UnverifiedAccount[] =>
  Array.isArray(v) ? v.flatMap(mapUnverifiedAccount) : [];

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
    seasonDay: int(r.seasonDay),
    phase: mapPhaseRef(r.phase),
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
export function mapTeamMetadata(value: unknown): TeamMetadata | null {
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
    ...colorSecondaryOf(r),
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
      gd14: metric(r.gd14),
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
      seasonDay: int(r.seasonDay),
      phase: mapPhaseRef(r.phase),
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
    unverifiedAccounts: mapUnverifiedAccounts(r.unverifiedAccounts),
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
 * Every Riot account on one profile — proven and claimed.
 *
 * `null` and an empty payload are different answers here too, one level up: empty lists are a
 * profile that has linked nothing, while `null` is the endpoint declining to say — a 404 for a
 * profile that doesn't exist, or a deployment that hasn't mounted the route. `getOne` resolves both
 * to null, and a caller that treated that as "no accounts" would tell a player their accounts had
 * vanished.
 *
 * `revalidate` because this is the read a player's own edits land in and upstream serves it
 * `max-age=60` — a refetch inside that window is answered from the browser's cache without the
 * server being asked, so adding an account would appear to have done nothing for up to a minute.
 * The conditional request costs a `304` when nothing changed. Same reasoning as `home()`.
 */
export async function profileAccounts(
  profileId: number,
  opts?: RequestOpts,
): Promise<ProfileAccounts | null> {
  const data = await getOne<Raw>(`/profiles/${profileId}/accounts`, { ...opts, revalidate: true });
  if (!data) return null;

  return {
    profileId: int(data.profileId, profileId),
    accounts: Array.isArray(data.accounts) ? data.accounts.flatMap(mapAccount) : [],
    unverifiedAccounts: mapUnverifiedAccounts(data.unverifiedAccounts),
    links: mapLinks(data.links),
  };
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

/**
 * Claim a Riot account by name and tag.
 *
 * Upstream resolves the Riot ID through Account-v1 before writing anything, so the claim that comes
 * back carries Riot's canonical spelling — `account.riotId`, not what was typed. Rendering the
 * submitted text instead would show `alt account#na1` next to a real one and look like a bug the
 * first time someone typed their own name in lower case.
 */
export async function addUnverifiedAccount(input: RiotAccountInput): Promise<AddAccountResult> {
  const data = asRaw(await credentialedRequest("/profiles/me/accounts", { method: "POST", body: input }));
  const status = strOrNull(data.status);

  if (status === "already_verified") {
    const puuid = strOrNull(data.puuid);
    if (!puuid) throw new Error("The response to adding that account was incomplete.");
    return { status, puuid, riotId: strOrNull(data.riotId) };
  }

  if (status === "created" || status === "existing") {
    const [account] = mapUnverifiedAccount(data.account);
    if (!account) throw new Error("The response to adding that account was incomplete.");
    return { status, account };
  }

  // A status this client doesn't know is not something to guess at: the account may or may not have
  // been written, and the only honest move is to fail and let the list refetch say what happened.
  throw new Error("The response to adding that account was not understood.");
}

/** Drop one claim. Upstream answers `204`, and `404` for a claim that is not the caller's. */
export async function removeUnverifiedAccount(claimId: number): Promise<void> {
  await credentialedRequest(`/profiles/me/accounts/${claimId}`, { method: "DELETE" });
}

/**
 * `sendStatus(404)`, made readable.
 *
 * The two verification routes answer a bare `404` for a claim that isn't there, whose body is the
 * word "Not Found" — one of the few upstream messages that is a status line rather than a sentence
 * written to be read, so it is the one place here that doesn't surface the API's own words.
 */
function claimGone(e: unknown): Error {
  if (e instanceof ApiError && e.status === 404) {
    return new Error("That account is no longer on your profile. Reload the page and add it again.");
  }
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Start — or resume — the profile-icon challenge for one claim.
 *
 * Calling this repeatedly is safe and is how the panel recovers: an unexpired challenge comes back
 * as-is with `reused: true` rather than a fresh icon, so a reload mid-flow doesn't move the target
 * and waste the icon change the player already made.
 *
 * The empty body is not decoration. These routes require `application/json`, and the content type is
 * only sent when `credentialedRequest` is given a body — see its header for why that header is the
 * CSRF defense rather than a formality.
 */
export async function startIconVerification(claimId: number): Promise<IconChallenge> {
  let data: Raw;
  try {
    data = asRaw(
      await credentialedRequest(`/profiles/me/accounts/${claimId}/verification`, {
        method: "POST",
        body: {},
      }),
    );
  } catch (e) {
    throw claimGone(e);
  }

  const targetIconId = intOrNull(data.targetIconId);
  if (targetIconId === null) {
    // Without the id there is no challenge: nothing to show, and nothing the check could match.
    throw new Error("The verification challenge response was incomplete.");
  }

  return {
    claimId: int(data.claimId, claimId),
    targetIconId,
    targetIconUrl: strOrNull(data.targetIconUrl),
    expiresAt: strOrNull(data.expiresAt),
    secondsRemaining: int(data.secondsRemaining),
    reused: bool(data.reused),
  };
}

const isLinkStatus = (v: unknown): v is LinkStatus =>
  typeof v === "string" && (LINK_STATUSES as readonly string[]).includes(v);

/** The statuses upstream reports on a non-2xx, which this module returns instead of throwing. */
const REPORTED_CHECK_STATUSES = ["expired", "exhausted", "missing", "not_found", "no_profile"] as const;

function mapCheck(value: unknown): IconCheckResult | null {
  const r = asRaw(value);
  const status = strOrNull(r.status);

  if (status === "verified") {
    const puuid = strOrNull(r.puuid);
    if (!puuid || !isLinkStatus(r.linkStatus)) return null;
    return { status, puuid, riotId: strOrNull(r.riotId), linkStatus: r.linkStatus };
  }
  if (status === "pending") {
    return { status, expiresAt: strOrNull(r.expiresAt), retryAfterSeconds: int(r.retryAfterSeconds) };
  }
  if (status === "cooldown") {
    return { status, retryAfterSeconds: int(r.retryAfterSeconds) };
  }
  if ((REPORTED_CHECK_STATUSES as readonly string[]).includes(status ?? "")) {
    return { status: status as (typeof REPORTED_CHECK_STATUSES)[number] };
  }
  return null;
}

/**
 * Read the account's live icon and, on a match, promote the claim to a verified account.
 *
 * A refusal upstream can describe — expired, exhausted, on cooldown, gone — arrives as a status code
 * with a JSON body and is returned as a value; see the module header. Anything else rejects: a `503`
 * from a deployment with icon verification switched off, a `502` from Riot, a lost session. Those
 * carry a sentence worth showing, and pretending they were a check result would tell the player to
 * keep waiting for something that is never going to answer.
 */
export async function checkIconVerification(claimId: number): Promise<IconCheckResult> {
  const path = `/profiles/me/accounts/${claimId}/verification/check`;
  try {
    const result = mapCheck(await credentialedRequest(path, { method: "POST", body: {} }));
    if (!result) throw new Error("The verification check response was not understood.");
    return result;
  } catch (e) {
    if (e instanceof ApiError) {
      const reported = mapCheck(e.body);
      if (reported) return reported;
      // A bare 404 here is the claim itself, not a challenge status.
      throw claimGone(e);
    }
    throw e;
  }
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
    unverifiedAccounts: mapUnverifiedAccounts(r.unverifiedAccounts),
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

// ------------------------------------------------------------------- search

/**
 * One hit from the profile autocomplete.
 *
 * `profileId` rather than the wire's `id`, matching every other person reference in this client —
 * `RosterSlot`, `ProfileRef`, `ApplicationMember`. `avatar` is a finished Discord CDN url; `handle`
 * is the cached Discord username and is often null, because it has only been recorded at login since
 * the column existed.
 */
export interface ProfileSearchResult {
  profileId: number;
  name: string | null;
  handle: string | null;
  avatar: string | null;
}

/** Upstream's own floor. A shorter query is a `400`, not an empty result — so callers must gate. */
export const PROFILE_SEARCH_MIN = 2;

/** Upstream's cap, which it also uses as the default. */
export const PROFILE_SEARCH_MAX = 25;

/**
 * Public profile autocomplete.
 *
 * Matches display names and cached Discord handles case-insensitively; an all-digit query also
 * matches that exact profile id, which is what makes it a superset of pasting an id in by hand.
 *
 * `conf` narrows to profiles a **published** team in that conference references — starters, subs,
 * owner or contacts. That is a genuinely different question from "everyone", not a nicety: with the
 * filter on, nobody unrostered can be found at all, so a caster or a former player needs it off. An
 * unknown but well-formed conf answers `[]` rather than falling back to unfiltered.
 *
 * Anonymous, via `./http` — it returns the same reference already visible on every public profile
 * page, so there is nothing here for a guard to protect.
 */
export function searchProfiles(
  q: string,
  conf?: string | null,
  limit?: number,
  opts?: RequestOpts,
): Promise<ProfileSearchResult[]> {
  const params = new URLSearchParams({ q });
  if (conf) params.set("conf", conf);
  if (limit !== undefined) params.set("limit", String(limit));

  return getList<Raw>(`/profiles/search?${params.toString()}`, opts).then(rows =>
    rows.flatMap(raw => {
      const r = asRaw(raw);
      const profileId = intOrNull(r.id ?? r.profileId);
      if (profileId === null) return [];
      return [
        {
          profileId,
          name: strOrNull(r.name),
          handle: strOrNull(r.handle),
          avatar: strOrNull(r.avatar),
        },
      ];
    }),
  );
}

/** Namespaced for parity with the other modules' aggregates. */
export const profilesApi = {
  profileAccounts,
  playerProfile,
  searchProfiles,
  updateMyProfile,
  refreshProfileAccounts,
  addUnverifiedAccount,
  removeUnverifiedAccount,
  startIconVerification,
  checkIconVerification,
};
