/**
 * Prediction API boundary. Wire names follow the sibling API's prediction and settings schemas.
 *
 * Business calculations stay upstream: amounts are `{ minor, display }` hundredths, kept here as the
 * `minor` decimal string and never parsed through `Number`. The website never computes a payout; a
 * pool share is display arithmetic only.
 *
 * Upstream behavior worth knowing:
 *
 *  - Every event has a `kind`. A `match` market is a fixture's series winner; a `custom` market is a
 *    staff question with a `title`, nullable `details` and 2 to 16 outcomes. Custom markets serve
 *    null `scheduleMatchId`, `phase` and `bestOf`; match markets serve null `title` and `details`.
 *  - Outcomes arrive ordered by `position`. A match market has exactly two, `outcomes[0]` the
 *    fixture's team A and `outcomes[1]` team B, and `result.score` uses the same order. A custom
 *    outcome references at most one team or profile. A team can be null on the wire; its outcome
 *    keeps a null `teamId`.
 *  - Stakes, previews, positions and holdings are keyed by `outcomeId`, which is valid on any
 *    market. `teamId` is only a match-market projection.
 *  - Settled results serve camelCase `winnerOutcomeId`/`winnerTeamId`/`voidReason` beside
 *    deprecated snake_case keys. Only the camelCase keys are read; `winnerOutcomeId` decides the
 *    winner and `winnerTeamId` stays for match projection. `score` is null for settlements recorded
 *    before it was stored.
 *  - Enrollment is per leaderboard season. After a rollover every wallet reads as not enrolled
 *    until it enrolls again, which awards the new season's starting points.
 *  - Every reward period stores the policy it was created under, so the rewards read describes the
 *    current period, and `upcoming` is a scheduled change effective at the next reset.
 *  - Review, skip and ledger-kind values are documented enums. Unknown values drop to null rather
 *    than being repaired. A candidate with an unknown skip reason still counts as unavailable,
 *    because the reason's presence, not its label, is what makes it unpublishable.
 *  - `GET /predictions/me` omits per-outcome principal, so which side a viewer picked comes from
 *    `GET /predictions/me/positions`, which also covers settled events.
 *  - The worker status serves camelCase aliases; the snake_case keys are deprecated fallbacks.
 *  - Site settings (`/admin/settings`) are served in snake_case.
 */

import { credentialedRequest } from "./credentialed";
import { ApiError, getOne, type RequestOpts } from "./http";
import { mapPhaseRef, type PhaseRef } from "./phaseRef";
import { mapPlayerSummary, type PlayerSummary } from "./playerSummary";
import { mapTeamMetadata, type TeamMetadata } from "./profiles";

type Raw = Record<string, unknown>;
const raw = (value: unknown): Raw => value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
const string = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const integer = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const bool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const id = (value: unknown): number | null => {
  const n = integer(value);
  return n !== null && n > 0 ? n : null;
};
/** Cursors are opaque: integers for `sort=id` and history, strings for the kickoff sorts. */
const cursorOf = (value: unknown): string | null =>
  string(value) ?? (integer(value) !== null ? String(value) : null);
const amount = (value: unknown): string | null => {
  const minor = typeof value === "object" && value !== null ? raw(value).minor : value;
  return typeof minor === "string" && /^-?\d+$/.test(minor) ? minor : null;
};
const rows = <T>(value: unknown, map: (value: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.flatMap(entry => { const mapped = map(entry); return mapped === null ? [] : [mapped]; }) : [];
const enumValue = <T extends string>(value: unknown, values: readonly T[]): T | null =>
  typeof value === "string" && values.includes(value as T) ? value as T : null;
const required = (value: unknown, label: string): Raw => {
  const r = raw(value);
  if (Object.keys(r).length === 0) throw new Error(`Could not read ${label}.`);
  return r;
};
const params = (values: Record<string, string | null | undefined>): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  const result = query.toString();
  return result ? `?${result}` : "";
};
const conferencePath = (conf: string) => `/tournaments/${encodeURIComponent(conf)}/predictions`;

// ---------------------------------------------------------------------------------- constraints

export const PREDICTION_STATES = ["scheduled", "open", "locked", "settled", "voided", "review"] as const;
export type PredictionState = typeof PREDICTION_STATES[number];

/** Every state an event can reach after it stops taking predictions. */
export const CLOSED_PREDICTION_STATES = ["locked", "review", "settled", "voided"] as const satisfies readonly PredictionState[];

export const PREDICTION_SORTS = ["id", "closesAt", "-closesAt"] as const;
export type PredictionSort = typeof PREDICTION_SORTS[number];

export const PREDICTION_REVIEW_REASONS = [
  "ambiguous_linkage", "conflicting_conference", "visibility_lost", "fixture_changed", "undated_fixture",
  "stakes_after_start", "invalid_fixture", "invalid_game_numbers", "games_after_clinch", "conflicting_teams",
  "result_changed",
] as const;
export type PredictionReviewReason = typeof PREDICTION_REVIEW_REASONS[number];

export const PREDICTION_SKIP_REASONS = [
  "already_published", "predictions_disabled", "ambiguous_linkage", "hidden_conference", "inactive_conference",
  "unpublished_phase", "not_a_match", "unknown_teams", "undated_fixture", "deadline_passed", "play_recorded",
] as const;
export type PredictionSkipReason = typeof PREDICTION_SKIP_REASONS[number];

export const PREDICTION_KINDS = ["match", "custom"] as const;
export type PredictionKind = typeof PREDICTION_KINDS[number];

/** `daily` is the reward kind for both cadences; `season_close` zeroes a balance at rollover. */
export const PREDICTION_LEDGER_KINDS = [
  "starting", "daily", "stake", "settlement", "correction", "transfer", "adjustment", "season_close",
] as const;
export type PredictionLedgerKind = typeof PREDICTION_LEDGER_KINDS[number];

export const PREDICTION_REWARD_CADENCES = ["daily", "weekly"] as const;
export type PredictionRewardCadence = typeof PREDICTION_REWARD_CADENCES[number];
/** `flat` pays `amount` each claim; `scaling` pays `amount` times the streak, up to `streakCap`. */
export const PREDICTION_REWARD_MODES = ["flat", "scaling"] as const;
export type PredictionRewardMode = typeof PREDICTION_REWARD_MODES[number];

/** Automatic voids carry this code; staff voids carry the reason they entered, verbatim. */
export const NO_WINNING_POOL = "no_winning_pool";

/** Event list page size, which is also the positions read's ID limit. */
export const PREDICTION_PAGE_SIZE = 50;
export const PREDICTION_POSITIONS_MAX = 50;
/** `GET /predictions/me` holdings cap; `truncated` says more exist. */
export const PREDICTION_HOLDINGS_MAX = 100;
/** Publication selections per batch. */
export const PREDICTION_BATCH_MAX = 50;
/** Staff audit reasons. */
export const PREDICTION_REASON_MAX = 500;

/** Custom market rules, as the publication route enforces them. */
export const CUSTOM_TITLE_MAX = 120;
export const CUSTOM_DETAILS_MAX = 2000;
export const CUSTOM_OUTCOMES_MIN = 2;
export const CUSTOM_OUTCOMES_MAX = 16;
/** Labels are trimmed with whitespace collapsed, then compared ignoring case. */
export const CUSTOM_LABEL_MAX = 80;
/** A custom deadline must be in the future and within this many days. */
export const CUSTOM_DEADLINE_DAYS = 370;

/** Reward policy bounds: the amount in minor units (1 to 100,000 points) and the scaling cap. */
export const REWARD_AMOUNT_MIN_MINOR = 100n;
export const REWARD_AMOUNT_MAX_MINOR = 10_000_000n;
export const REWARD_STREAK_CAP_MAX = 30;

export const PREDICTION_SEASON_NAME_MAX = 80;

/**
 * The machine reason on a prediction error body (`insufficient_points`, `publication_preview_changed`).
 * The sentence to show is still `errorMessage`; this only decides which server state to refresh.
 */
export function predictionErrorReason(error: unknown): string | null {
  return error instanceof ApiError ? string(raw(error.body).reason) : null;
}

// --------------------------------------------------------------------------------------- events

export interface PredictionOutcome {
  /** The stake key on any market. */
  id: number;
  position: number | null;
  /** The served label. Display goes through `outcomeName`, which names a match outcome's team. */
  label: string | null;
  /** The referenced team. A match outcome whose wire team is null cannot be picked. */
  teamId: number | null;
  team: TeamMetadata | null;
  /** A custom outcome's referenced profile. */
  profile: PlayerSummary | null;
  /** Effective pool (paid plus bonus), minor units. */
  pool: string;
}
export interface PredictionScore { teamA: number; teamB: number }
export interface PredictionResult {
  winnerOutcomeId: number | null;
  /** Match projection only; the winner is decided by `winnerOutcomeId`. */
  winnerTeamId: number | null;
  voidReason: string | null;
  score: PredictionScore | null;
}
export interface PredictionEvent {
  id: number;
  kind: PredictionKind;
  conf: string;
  /** Custom markets only. */
  title: string | null;
  /** Custom markets only; plain text. */
  details: string | null;
  scheduleMatchId: number | null;
  state: PredictionState;
  revision: number | null;
  settlementRevision: number | null;
  closesAt: string | null;
  openedAt: string | null;
  bestOf: number | null;
  phase: PhaseRef | null;
  /** In position order: two on a match market (team A, then team B), 2 to 16 on a custom one. */
  outcomes: PredictionOutcome[];
  totalPool: string;
  reviewReason: PredictionReviewReason | null;
  result: PredictionResult | null;
  /** The response's server time, carried on each card so countdowns start from the API clock. */
  serverNow: string | null;
}
export interface PredictionPage {
  items: PredictionEvent[];
  nextCursor: string | null;
  serverNow: string | null;
}
export interface PredictionFilters {
  conf?: string | null;
  status?: readonly PredictionState[] | null;
  sort?: PredictionSort | null;
  scheduleMatchId?: number | null;
  cursor?: string | null;
}

function outcomeOf(value: unknown): PredictionOutcome | null {
  const r = raw(value);
  const outcomeId = id(r.id), pool = amount(r.effective), position = integer(r.position);
  if (outcomeId === null || pool === null) return null;
  const team = mapTeamMetadata(r.team);
  return {
    id: outcomeId, position: position !== null && position >= 0 ? position : null, label: string(r.label),
    teamId: team?.id ?? null, team, profile: mapPlayerSummary(r.profile), pool,
  };
}
function scoreOf(value: unknown): PredictionScore | null {
  const r = raw(value), teamA = integer(r.teamA), teamB = integer(r.teamB);
  return teamA !== null && teamB !== null && teamA >= 0 && teamB >= 0 ? { teamA, teamB } : null;
}
function resultOf(value: unknown): PredictionResult | null {
  if (!value || typeof value !== "object") return null;
  const r = raw(value);
  return {
    winnerOutcomeId: id(r.winnerOutcomeId), winnerTeamId: id(r.winnerTeamId),
    voidReason: string(r.voidReason), score: scoreOf(r.score),
  };
}
function eventOf(value: unknown, serverNow: string | null = null): PredictionEvent | null {
  const r = raw(value);
  const eventId = id(r.id), conf = string(r.conf), state = enumValue(r.state, PREDICTION_STATES);
  const kind = enumValue(r.kind, PREDICTION_KINDS);
  const outcomes = rows(r.outcomes, outcomeOf);
  if (eventId === null || !conf || !state || !kind || outcomes.length < CUSTOM_OUTCOMES_MIN) return null;
  if (kind === "match" && outcomes.length !== 2) return null;
  const bestOf = integer(r.bestOf);
  return {
    id: eventId,
    kind,
    conf,
    title: string(r.title),
    details: string(r.details),
    scheduleMatchId: id(r.scheduleMatchId),
    state,
    revision: id(r.revision),
    settlementRevision: integer(r.settlementRevision),
    closesAt: string(r.closesAt),
    openedAt: string(r.openedAt),
    bestOf: bestOf !== null && bestOf > 0 ? bestOf : null,
    phase: mapPhaseRef(r.phase),
    outcomes,
    totalPool: outcomes.reduce((total, outcome) => total + BigInt(outcome.pool), 0n).toString(),
    reviewReason: enumValue(r.reviewReason, PREDICTION_REVIEW_REASONS),
    result: resultOf(r.result),
    serverNow,
  };
}

export async function predictions(filters: PredictionFilters = {}, opts?: RequestOpts): Promise<PredictionPage> {
  const query = params({
    conf: filters.conf,
    status: filters.status?.length ? filters.status.join(",") : null,
    sort: filters.sort && filters.sort !== "id" ? filters.sort : null,
    scheduleMatchId: filters.scheduleMatchId ? String(filters.scheduleMatchId) : null,
    cursor: filters.cursor,
  });
  const r = required(await getOne<unknown>(`/predictions${query}`, { ...opts, anonymous: true }), "published predictions");
  const serverNow = string(r.serverNow);
  return { items: rows(r.events, value => eventOf(value, serverNow)), nextCursor: cursorOf(r.nextCursor), serverNow };
}

export async function prediction(eventId: number, opts?: RequestOpts): Promise<PredictionEvent | null> {
  const r = raw(await getOne<unknown>(`/predictions/${eventId}`, { ...opts, anonymous: true }));
  return eventOf(r.event, string(r.serverNow));
}

// --------------------------------------------------------------------------------------- wallet

export interface PredictionRewardPolicy {
  cadence: PredictionRewardCadence;
  mode: PredictionRewardMode;
  /** Minor units: the flat amount, or the per-streak step when scaling. */
  amount: string;
  streakCap: number;
}
/** A scheduled policy, effective at the next reset. */
export interface PendingRewardPolicy extends PredictionRewardPolicy { effectiveAt: string }

/** Reads both the `{ minor, display }` projection and the admin settings' bare minor string. */
const rewardPolicyOf = (value: unknown): PredictionRewardPolicy | null => {
  const r = raw(value);
  const cadence = enumValue(r.cadence, PREDICTION_REWARD_CADENCES), mode = enumValue(r.mode, PREDICTION_REWARD_MODES);
  const minor = amount(r.amount), streakCap = id(r.streakCap);
  return cadence && mode && minor !== null && streakCap !== null ? { cadence, mode, amount: minor, streakCap } : null;
};
const pendingRewardPolicyOf = (value: unknown): PendingRewardPolicy | null => {
  const policy = rewardPolicyOf(value), effectiveAt = string(raw(value).effectiveAt);
  return policy && effectiveAt ? { ...policy, effectiveAt } : null;
};

export interface PredictionRewards {
  periodId: number | null;
  eligible: boolean | null;
  claimed: boolean | null;
  /** Eligible and not yet claimed this period. */
  claimable: boolean;
  /** Consecutive claims, capped upstream. A scaling reward grows with it up to `streakCap`. */
  streak: number | null;
  nextReward: string | null;
  resetsAt: string | null;
  siteTimeZone: string | null;
  serverNow: string | null;
  /** The current period's stored policy. */
  cadence: PredictionRewardCadence | null;
  mode: PredictionRewardMode | null;
  amount: string | null;
  streakCap: number | null;
  upcoming: PendingRewardPolicy | null;
}
const rewardsOf = (value: unknown): PredictionRewards | null => {
  if (!value || typeof value !== "object") return null;
  const r = raw(value), eligible = bool(r.eligible), claimed = bool(r.claimed);
  return {
    periodId: id(r.periodId), eligible, claimed, claimable: eligible === true && claimed === false,
    streak: integer(r.streak), nextReward: amount(r.nextReward), resetsAt: string(r.resetsAt),
    siteTimeZone: string(r.siteTimeZone), serverNow: string(r.serverNow),
    cadence: enumValue(r.cadence, PREDICTION_REWARD_CADENCES), mode: enumValue(r.mode, PREDICTION_REWARD_MODES),
    amount: amount(r.amount), streakCap: id(r.streakCap), upcoming: pendingRewardPolicyOf(r.upcoming),
  };
};

export interface PredictionStanding {
  rank: number;
  wealth: string | null;
  netProfit: string | null;
}
export interface PredictionSummary {
  enrolled: boolean | null;
  balance: string | null;
  spendable: string | null;
  /** Null when not enrolled. */
  rewards: PredictionRewards | null;
  /** The viewer's authoritative leaderboard row; null when not enrolled. */
  standing: PredictionStanding | null;
  serverNow: string | null;
}
const standingOf = (value: unknown): PredictionStanding | null => {
  const r = raw(value), rank = id(r.rank);
  return rank === null ? null : { rank, wealth: amount(r.wealth), netProfit: amount(r.netPredictionProfit) };
};
export async function predictionSummary(opts?: RequestOpts): Promise<PredictionSummary> {
  const r = required(await credentialedRequest("/predictions/me/summary", { cache: "no-store" }, opts), "your prediction summary");
  return {
    enrolled: bool(r.enrolled), balance: amount(r.balance), spendable: amount(r.spendable),
    rewards: rewardsOf(r.rewards), standing: standingOf(r.leaderboard), serverNow: string(r.serverNow),
  };
}

/**
 * Enrolls in the open season and returns the starting balance, for the confirmation. Repeating
 * enrollment within one season awards nothing.
 */
export async function enrollPredictions(): Promise<{ seasonId: number | null; spendable: string | null }> {
  const r = required(await credentialedRequest("/predictions/me/enroll", { method: "POST", body: {} }), "enrollment");
  return { seasonId: id(r.seasonId), spendable: amount(r.spendable) };
}

export async function claimPredictionReward(requestId: string, periodId: number): Promise<{ awarded: string | null; alreadyClaimed: boolean }> {
  const r = required(await credentialedRequest("/predictions/me/rewards/claim", { method: "POST", body: { requestId, periodId } }), "the reward");
  return { awarded: amount(r.awarded), alreadyClaimed: r.alreadyClaimed === true };
}

// ------------------------------------------------------------------------------------ positions

export interface PredictionPick {
  outcomeId: number;
  /** Match markets only. */
  teamId: number | null;
  paid: string | null;
  /** Present only while the event is unsettled. */
  estimatedReturn: string | null;
}
export interface PredictionPosition {
  eventId: number;
  state: PredictionState | null;
  paid: string | null;
  bonus: string | null;
  /** Every outcome the viewer holds, with a nonzero or zero principal each. */
  outcomes: PredictionPick[];
  /** Net settlement and correction credit; null while unsettled. */
  returned: string | null;
  /** Void refund; null unless voided. */
  refunded: string | null;
}
const pickOf = (value: unknown): PredictionPick | null => {
  const r = raw(value), outcomeId = id(r.outcomeId);
  return outcomeId === null ? null : { outcomeId, teamId: id(r.teamId), paid: amount(r.paid), estimatedReturn: amount(r.estimatedReturn) };
};
const positionOf = (value: unknown): PredictionPosition | null => {
  const r = raw(value), eventId = id(r.eventId);
  if (eventId === null) return null;
  return {
    eventId, state: enumValue(r.state, PREDICTION_STATES), paid: amount(r.paid), bonus: amount(r.bonus),
    outcomes: rows(r.outcomes, pickOf), returned: amount(r.returned), refunded: amount(r.refunded),
  };
};

/** The viewer's positions for up to 50 events. Events the viewer does not hold are absent. */
export async function predictionPositions(eventIds: readonly number[], opts?: RequestOpts): Promise<PredictionPosition[]> {
  if (eventIds.length === 0) return [];
  if (eventIds.length > PREDICTION_POSITIONS_MAX) throw new Error(`Positions can be read for at most ${PREDICTION_POSITIONS_MAX} events at once.`);
  const r = required(await credentialedRequest(`/predictions/me/positions${params({ eventIds: eventIds.join(",") })}`,
    { cache: "no-store" }, opts), "your predictions");
  return rows(r.positions, positionOf);
}

export interface PredictionHolding {
  eventId: number;
  /** Null for a hidden fixture: amounts stay available, card data does not. */
  event: PredictionEvent | null;
  paid: string | null;
  bonus: string | null;
}
export interface PredictionPortfolio {
  holdings: PredictionHolding[];
  truncated: boolean;
  serverNow: string | null;
}
/** Outstanding holdings only, up to 100. Settled events leave this list. */
export async function myPredictions(opts?: RequestOpts): Promise<PredictionPortfolio> {
  const r = required(await credentialedRequest("/predictions/me", { cache: "no-store" }, opts), "your predictions");
  const serverNow = string(r.serverNow);
  return {
    holdings: rows(r.stakes, value => {
      const h = raw(value), eventId = id(h.eventId);
      return eventId === null ? null : { eventId, event: eventOf(h.event, serverNow), paid: amount(h.paid), bonus: amount(h.bonus) };
    }),
    truncated: r.truncated === true,
    serverNow,
  };
}

// ----------------------------------------------------------------------------------- estimates

export interface PredictionEstimate {
  paid: string;
  bonus: string;
  effective: string;
  estimatedReturn: string;
}
/**
 * A POST with no side effects: it reserves neither points nor a return, which is why the website
 * reads it through a query rather than a mutation.
 */
export async function previewPrediction(eventId: number, outcomeId: number, paid: string, opts?: RequestOpts): Promise<PredictionEstimate> {
  const r = required(await credentialedRequest(`/predictions/${eventId}/preview`,
    { method: "POST", body: { outcomeId, amount: paid } }, opts), "the return estimate");
  const estimate = { paid: amount(r.paid), bonus: amount(r.bonus), effective: amount(r.effective), estimatedReturn: amount(r.estimatedReturn) };
  if (estimate.paid === null || estimate.bonus === null || estimate.effective === null || estimate.estimatedReturn === null) {
    throw new Error("The return estimate was incomplete.");
  }
  return estimate as PredictionEstimate;
}

/** `requestId` is a command identity: keep it until the outcome is known, then discard it. */
export async function placePrediction(eventId: number, outcomeId: number, paid: string, requestId: string): Promise<void> {
  await credentialedRequest(`/predictions/${eventId}/stakes`, { method: "POST", body: { outcomeId, amount: paid, requestId } });
}

// ------------------------------------------------------------------------------------- history

export interface PredictionHistoryEvent {
  id: number;
  kind: PredictionKind;
  conf: string;
  state: PredictionState | null;
  /** Custom markets only. */
  title: string | null;
  /** Team A and team B on a match market; empty on a custom market. */
  teams: (TeamMetadata | null)[];
}
export interface PredictionHistoryEntry {
  id: number;
  kind: PredictionLedgerKind;
  eventId: number | null;
  /** Null for hidden events and entries with no event. */
  event: PredictionHistoryEvent | null;
  /** The picked outcome on stake entries, and its team on match markets, when the ledger recorded them. */
  outcomeId: number | null;
  teamId: number | null;
  amount: string | null;
  balanceAfter: string | null;
  createdAt: string | null;
}
const historyEventOf = (value: unknown): PredictionHistoryEvent | null => {
  const r = raw(value), eventId = id(r.id), conf = string(r.conf), kind = enumValue(r.kind, PREDICTION_KINDS);
  if (eventId === null || !conf || !kind || !Array.isArray(r.teams)) return null;
  if (kind === "match" && r.teams.length !== 2) return null;
  return {
    id: eventId, kind, conf, state: enumValue(r.state, PREDICTION_STATES), title: string(r.title),
    teams: kind === "match" ? r.teams.map(mapTeamMetadata) : [],
  };
};
const historyOf = (value: unknown): PredictionHistoryEntry | null => {
  const r = raw(value), entryId = id(r.id), kind = enumValue(r.kind, PREDICTION_LEDGER_KINDS);
  if (entryId === null || !kind) return null;
  return {
    id: entryId, kind, eventId: id(r.eventId), event: historyEventOf(r.event), outcomeId: id(r.outcomeId), teamId: id(r.teamId),
    amount: amount(r.amount), balanceAfter: amount(r.balanceAfter), createdAt: string(r.createdAt),
  };
};
export async function predictionHistory(cursor?: string | null, opts?: RequestOpts) {
  const r = required(await credentialedRequest(`/predictions/me/history${params({ cursor })}`, { cache: "no-store" }, opts), "your prediction history");
  return { items: rows(r.entries, historyOf), nextCursor: cursorOf(r.nextCursor) };
}

// --------------------------------------------------------------------------------- leaderboard

export interface PredictionLeader {
  rank: number;
  player: PlayerSummary | null;
  wealth: string | null;
  netProfit: string | null;
}
const leaderOf = (value: unknown): PredictionLeader | null => {
  const r = raw(value), rank = id(r.rank);
  return rank === null ? null : { rank, player: mapPlayerSummary(r.profile), wealth: amount(r.wealth), netProfit: amount(r.netPredictionProfit) };
};
export interface PredictionSeason {
  id: number;
  name: string;
  startedAt: string | null;
  /** Null for the open season; exactly one season is open. */
  endedAt: string | null;
}
const seasonOf = (value: unknown): PredictionSeason | null => {
  const r = raw(value), seasonId = id(r.id), name = string(r.name);
  return seasonId !== null && name ? { id: seasonId, name, startedAt: string(r.startedAt), endedAt: string(r.endedAt) } : null;
};
/** Every leaderboard season, newest first. */
export async function predictionSeasons(opts?: RequestOpts): Promise<PredictionSeason[]> {
  const r = required(await getOne<unknown>("/predictions/seasons", { ...opts, anonymous: true }), "the prediction seasons");
  return rows(r.seasons, seasonOf);
}

/**
 * Served ranking; ties share a rank. Cursors are positions, so a moving score can reorder pages.
 * A null season is the open one; a closed season is served from its frozen final standings.
 */
export async function predictionLeaderboard(season: number | null, cursor?: string | null, opts?: RequestOpts) {
  const query = params({ season: season === null ? null : String(season), cursor });
  const r = required(await getOne<unknown>(`/predictions/leaderboard${query}`, { ...opts, anonymous: true }), "the prediction leaderboard");
  return { items: rows(r.entries, leaderOf), nextCursor: cursorOf(r.nextCursor), season: seasonOf(r.season) };
}

// ---------------------------------------------------------------------------------- management

export interface PredictionCandidate {
  scheduleMatchId: number;
  teamA: TeamMetadata | null;
  teamB: TeamMetadata | null;
  bestOf: number | null;
  closesAt: string | null;
  phase: PhaseRef | null;
  /** The published event, for `already_published`. */
  eventId: number | null;
  /** Known skip reason; null for an available candidate or an unrecognized reason. */
  reason: PredictionSkipReason | null;
  /** False whenever the API served any skip reason, known or not, or no preview hash. */
  available: boolean;
  expectedRevision: string | null;
}
const candidateOf = (value: unknown): PredictionCandidate | null => {
  const r = raw(value), matchId = id(r.scheduleMatchId);
  if (matchId === null) return null;
  const expectedRevision = typeof r.expectedRevision === "string" && /^[a-f0-9]{64}$/.test(r.expectedRevision) ? r.expectedRevision : null;
  const bestOf = integer(r.bestOf);
  return {
    scheduleMatchId: matchId, teamA: mapTeamMetadata(r.teamA), teamB: mapTeamMetadata(r.teamB),
    bestOf: bestOf !== null && bestOf > 0 ? bestOf : null, closesAt: string(r.closesAt), phase: mapPhaseRef(r.phase),
    eventId: id(r.eventId), reason: enumValue(r.reason, PREDICTION_SKIP_REASONS),
    available: (r.reason === null || r.reason === undefined) && expectedRevision !== null, expectedRevision,
  };
};
export interface PredictionWorker {
  pending: number | null;
  review: number | null;
  errors: number | null;
  ledgerDiscrepancies: number | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}
export interface PredictionManage {
  weekStart: string;
  startsAt: string | null;
  endsAt: string | null;
  siteTimeZone: string | null;
  serverNow: string | null;
  rulesEnabled: boolean | null;
  candidates: PredictionCandidate[];
  events: PredictionEvent[];
  worker: PredictionWorker;
  errors: { eventId: number; error: string }[];
}
export async function managePredictions(conf: string, weekStart: string, opts?: RequestOpts): Promise<PredictionManage> {
  const r = required(await credentialedRequest(`${conferencePath(conf)}/manage${params({ weekStart })}`,
    { cache: "no-store" }, opts), "the weekly predictions preview");
  const worker = raw(r.worker), serverNow = string(r.serverNow);
  return {
    weekStart: string(r.weekStart) ?? weekStart, startsAt: string(r.startsAt), endsAt: string(r.endsAt),
    siteTimeZone: string(r.siteTimeZone), serverNow, rulesEnabled: bool(raw(r.rules).enabled),
    candidates: rows(r.candidates, candidateOf), events: rows(r.events, value => eventOf(value, serverNow)),
    worker: {
      pending: integer(worker.pending), review: integer(worker.review), errors: integer(worker.errors),
      ledgerDiscrepancies: integer(worker.ledgerDiscrepancies),
      lastSuccessAt: string(worker.lastSuccessAt) ?? string(worker.last_success_at),
      lastError: string(worker.lastError) ?? string(worker.last_error),
    },
    errors: rows(r.errors, value => {
      const e = raw(value), eventId = id(e.eventId), error = string(e.error);
      return eventId !== null && error ? { eventId, error } : null;
    }),
  };
}

export interface PublicationSelection { scheduleMatchId: number; expectedRevision: string }
export async function publishPredictions(conf: string, weekStart: string, selections: readonly PublicationSelection[], requestId: string): Promise<void> {
  await credentialedRequest(`${conferencePath(conf)}/batches`, { method: "POST", body: { weekStart, selections, requestId } });
}

export interface CustomOutcomeInput {
  label: string;
  /** At most one of `teamId` and `profileId`. */
  teamId?: number | null;
  profileId?: number | null;
}
export interface CustomPredictionInput {
  requestId: string;
  title: string;
  details: string | null;
  closesAt: string;
  outcomes: readonly CustomOutcomeInput[];
}
/** Publishes a custom market, open immediately. An identical retry returns the same event. */
export async function publishCustomPrediction(conf: string, input: CustomPredictionInput): Promise<{ eventId: number | null }> {
  const r = raw(await credentialedRequest(`${conferencePath(conf)}/custom`, { method: "POST", body: {
    requestId: input.requestId, title: input.title, details: input.details, closesAt: input.closesAt,
    outcomes: input.outcomes.map(outcome => ({
      label: outcome.label,
      ...(outcome.teamId ? { teamId: outcome.teamId } : {}),
      ...(outcome.profileId ? { profileId: outcome.profileId } : {}),
    })),
  } }));
  return { eventId: id(r.eventId) };
}

export type PredictionEventAction = "lock" | "reopen" | "void";
/** `closesAt` is the new deadline that reopening a custom market requires; nothing else sends it. */
export async function predictionAction(conf: string, eventId: number, action: PredictionEventAction, expectedRevision: number,
  reason: string, requestId: string, closesAt?: string | null): Promise<void> {
  await credentialedRequest(`${conferencePath(conf)}/${eventId}/actions`,
    { method: "POST", body: { action, expectedRevision, reason, requestId, ...(closesAt ? { closesAt } : {}) } });
}

/** `result` is match-only and `outcome` custom-only; `void` refunds either kind. */
export type PredictionCorrectionKind = "result" | "outcome" | "void";
/**
 * Resolution names a custom market's first winner; correction changes a paid result. `outcomeId` is
 * required for resolution and outcome corrections, and accepted nowhere else.
 */
export type PredictionSettlementCommand =
  | { action: "preview_resolution"; outcomeId: number }
  | { action: "preview_correction"; correction: PredictionCorrectionKind; outcomeId?: number };
export interface PredictionCorrectionAffected {
  profileId: number;
  player: PlayerSummary | null;
  delta: string;
  resultingBalance: string;
}
export interface PredictionSettlementPreview {
  eventId: number;
  expectedRevision: number;
  previewToken: string;
  command: PredictionSettlementCommand;
  reason: string;
  /** Null for a first resolution. */
  oldWinnerOutcomeId: number | null;
  newWinnerOutcomeId: number | null;
  voidReason: string | null;
  score: PredictionScore | null;
  /** Games behind a match result; null on custom markets, which have no fixture evidence. */
  evidenceCount: number | null;
  promotionMint: string | null;
  affected: PredictionCorrectionAffected[];
}
/**
 * Winners are named by outcome. Settlements recorded before outcome IDs existed keep only
 * `inputs.winnerTeamId`, so the previous winner falls back to the outcome referencing that team.
 */
export async function previewPredictionSettlement(conf: string, event: PredictionEvent, command: PredictionSettlementCommand,
  reason: string): Promise<PredictionSettlementPreview> {
  const expectedRevision = event.revision!;
  const r = required(await credentialedRequest(`${conferencePath(conf)}/${event.id}/actions`, { method: "POST", body: {
    ...command, expectedRevision, reason, requestId: crypto.randomUUID(),
  } }), command.action === "preview_resolution" ? "the resolution preview" : "the correction preview");
  const previewToken = string(r.previewToken);
  if (!previewToken) throw new Error("The settlement preview did not include a token.");
  const byTeam = (teamId: number | null) =>
    teamId === null ? null : event.outcomes.find(outcome => outcome.teamId === teamId)?.id ?? null;
  const oldInputs = raw(raw(r.oldResult).inputs);
  return {
    eventId: id(r.eventId) ?? event.id, expectedRevision: id(r.expectedRevision) ?? expectedRevision, previewToken,
    command, reason,
    oldWinnerOutcomeId: id(oldInputs.winnerOutcomeId) ?? byTeam(id(oldInputs.winnerTeamId)),
    newWinnerOutcomeId: id(r.winnerOutcomeId) ?? byTeam(id(r.winnerTeamId)),
    voidReason: string(r.voidReason), score: scoreOf(r.score),
    evidenceCount: event.kind === "match" && Array.isArray(r.evidence) ? r.evidence.length : null,
    promotionMint: amount(r.promotionMint),
    affected: rows(r.affected, value => {
      const d = raw(value), profileId = id(d.profileId), delta = amount(d.delta), resultingBalance = amount(d.resultingBalance);
      return profileId !== null && delta !== null && resultingBalance !== null
        ? { profileId, player: mapPlayerSummary(d.profile), delta, resultingBalance } : null;
    }),
  };
}
/**
 * Sends `resolve` or `correct` with the previewed command and token. `requestId` is fresh per apply
 * attempt and kept for retries of that attempt.
 */
export async function applyPredictionSettlement(conf: string, preview: PredictionSettlementPreview, requestId: string): Promise<void> {
  const { command } = preview;
  const body = command.action === "preview_resolution"
    ? { action: "resolve", outcomeId: command.outcomeId }
    : { action: "correct", correction: command.correction, ...(command.outcomeId ? { outcomeId: command.outcomeId } : {}) };
  await credentialedRequest(`${conferencePath(conf)}/${preview.eventId}/actions`, { method: "POST", body: {
    ...body, expectedRevision: preview.expectedRevision, reason: preview.reason, previewToken: preview.previewToken, requestId,
  } });
}
export async function reconcilePredictions(conf: string): Promise<void> {
  await credentialedRequest(`${conferencePath(conf)}/reconcile`, { method: "POST", body: {} });
}

// ---------------------------------------------------------------------------- site settings

export interface PublicPredictionCalendar {
  siteTimeZone: string;
  serverNow: string;
  /** Public so the reward rules can be explained to anonymous visitors. */
  rewards: { enabled: boolean | null; policy: PredictionRewardPolicy | null; pending: PendingRewardPolicy | null };
}
export async function publicPredictionSiteSettings(opts?: RequestOpts): Promise<PublicPredictionCalendar> {
  const r = required(await getOne<unknown>("/settings", { ...opts, anonymous: true }), "the site calendar");
  const siteTimeZone = string(r.siteTimeZone), serverNow = string(r.serverNow), rewards = raw(r.rewards);
  if (!siteTimeZone || !serverNow) throw new Error("The site calendar did not include a timezone and server time.");
  return {
    siteTimeZone, serverNow,
    rewards: { enabled: bool(rewards.enabled), policy: rewardPolicyOf(rewards), pending: pendingRewardPolicyOf(rewards.pending) },
  };
}

export const PREDICTION_SWITCHES = ["publicationEnabled", "stakingEnabled", "settlementEnabled", "rewardsEnabled"] as const;
export type PredictionSwitch = typeof PREDICTION_SWITCHES[number];

export interface PredictionSiteSettings extends Record<PredictionSwitch, boolean | null> {
  siteTimeZone: string | null;
  pendingTimeZone: string | null;
  effectiveAt: string | null;
  version: number | null;
  rewardPolicy: PredictionRewardPolicy | null;
  /** A scheduled policy change, replaceable until `pendingRewardEffectiveAt`. */
  pendingRewardPolicy: PredictionRewardPolicy | null;
  pendingRewardEffectiveAt: string | null;
}
export async function predictionSiteSettings(opts?: RequestOpts): Promise<PredictionSiteSettings> {
  const r = required(await credentialedRequest("/admin/settings", { cache: "no-store" }, opts), "the site settings");
  return {
    siteTimeZone: string(r.site_time_zone), pendingTimeZone: string(r.pending_time_zone),
    effectiveAt: string(r.pending_effective_at), version: integer(r.version),
    publicationEnabled: bool(r.publication_enabled), stakingEnabled: bool(r.staking_enabled),
    settlementEnabled: bool(r.settlement_enabled), rewardsEnabled: bool(r.rewards_enabled),
    rewardPolicy: rewardPolicyOf({
      cadence: r.reward_cadence, mode: r.reward_mode, amount: r.reward_amount, streakCap: r.reward_streak_cap,
    }),
    pendingRewardPolicy: rewardPolicyOf(r.pending_reward_policy),
    pendingRewardEffectiveAt: string(r.pending_reward_effective_at),
  };
}

export interface CalendarPreview {
  siteTimeZone: string;
  effectiveAt: string | null;
  nextRewardReset: string | null;
}
export async function previewPredictionSiteTimeZone(siteTimeZone: string, expectedVersion: number): Promise<CalendarPreview> {
  const r = raw(await credentialedRequest("/admin/settings", { method: "PATCH", body: { siteTimeZone, expectedVersion, preview: true } }));
  const zone = string(r.siteTimeZone);
  if (!zone) throw new Error("The timezone preview was incomplete.");
  return { siteTimeZone: zone, effectiveAt: string(r.effectiveAt), nextRewardReset: string(r.nextRewardReset) };
}
export async function savePredictionSiteTimeZone(siteTimeZone: string, expectedVersion: number, expectedEffectiveAt: string): Promise<void> {
  await credentialedRequest("/admin/settings", { method: "PATCH", body: { siteTimeZone, expectedVersion, expectedEffectiveAt, preview: false } });
}
/** Policy fields to change. Omitted fields keep their scheduled values and are left out of the request. */
export type RewardPolicyChanges = Partial<PredictionRewardPolicy>;
const rewardPolicyBody = (changes: RewardPolicyChanges) => ({
  ...(changes.cadence ? { rewardCadence: changes.cadence } : {}),
  ...(changes.mode ? { rewardMode: changes.mode } : {}),
  ...(changes.amount ? { rewardAmount: changes.amount } : {}),
  ...(changes.streakCap ? { rewardStreakCap: changes.streakCap } : {}),
});
export interface RewardPolicyPreview {
  effectiveAt: string | null;
  nextRewardReset: string | null;
  /** Length of the transition period under the new calendar. */
  transitionHours: number | null;
  current: PredictionRewardPolicy | null;
  next: PredictionRewardPolicy | null;
}
export async function previewPredictionRewardPolicy(changes: RewardPolicyChanges, expectedVersion: number): Promise<RewardPolicyPreview> {
  const r = raw(await credentialedRequest("/admin/settings", { method: "PATCH", body: { ...rewardPolicyBody(changes), expectedVersion, preview: true } }));
  const policy = raw(r.rewardPolicy);
  return {
    effectiveAt: string(r.effectiveAt), nextRewardReset: string(r.nextRewardReset),
    transitionHours: typeof r.transitionHours === "number" && Number.isFinite(r.transitionHours) ? r.transitionHours : null,
    current: rewardPolicyOf(policy.current), next: rewardPolicyOf(policy.next),
  };
}
export async function savePredictionRewardPolicy(changes: RewardPolicyChanges, expectedVersion: number, expectedEffectiveAt: string): Promise<void> {
  await credentialedRequest("/admin/settings", { method: "PATCH", body: {
    ...rewardPolicyBody(changes), expectedVersion, expectedEffectiveAt, preview: false,
  } });
}
export async function savePredictionSiteSwitch(field: PredictionSwitch, enabled: boolean, expectedVersion: number): Promise<void> {
  await credentialedRequest("/admin/settings", { method: "PATCH", body: { expectedVersion, preview: false, [field]: enabled } });
}

// ------------------------------------------------------------------------------- league rules

export interface PredictionLeagueRule {
  conf: string;
  enabled: boolean;
  /** Zero for a league that has never had a rule. */
  version: number;
}
const ruleOf = (value: unknown): PredictionLeagueRule | null => {
  const r = raw(value), conf = string(r.conf), enabled = bool(r.enabled), version = integer(r.version);
  return conf && enabled !== null && version !== null && version >= 0 ? { conf, enabled, version } : null;
};
/** Every conference's rule, hidden drafts included, without fixture discovery. */
export async function predictionLeagueRules(opts?: RequestOpts): Promise<PredictionLeagueRule[]> {
  const r = required(await credentialedRequest("/admin/predictions/leagues", { cache: "no-store" }, opts), "the league prediction rules");
  return rows(r.leagues, ruleOf);
}
export async function savePredictionLeagueRule(conf: string, enabled: boolean, expectedVersion: number): Promise<void> {
  await credentialedRequest(`/admin/leagues/${encodeURIComponent(conf)}/predictions`,
    { method: "PATCH", body: { enabled, expectedVersion } });
}

// ----------------------------------------------------------------------------- season rollover

export interface PredictionRolloverBlocker {
  eventId: number;
  conf: string;
  state: PredictionState | null;
  kind: PredictionKind | null;
  title: string | null;
}
export interface PredictionRolloverPreview {
  /** The open season the rollover would close. */
  season: PredictionSeason;
  /** Every outstanding market. The rollover is refused until none remain. */
  blockers: PredictionRolloverBlocker[];
  walletsToClear: number | null;
  balanceCleared: string | null;
  debtCleared: string | null;
  /** Rows the frozen board will hold. */
  standings: number | null;
  previewToken: string;
}
const count = (value: unknown): number | null => {
  const n = integer(value);
  return n !== null && n >= 0 ? n : null;
};
export async function predictionRolloverPreview(opts?: RequestOpts): Promise<PredictionRolloverPreview> {
  const r = required(await credentialedRequest("/admin/predictions/seasons/rollover", { cache: "no-store" }, opts), "the season rollover preview");
  const season = seasonOf(r.season), previewToken = string(r.previewToken);
  if (!season || !previewToken) throw new Error("The season rollover preview was incomplete.");
  return {
    season, previewToken,
    blockers: rows(r.blockers, value => {
      const b = raw(value), eventId = id(b.eventId), conf = string(b.conf);
      return eventId !== null && conf
        ? { eventId, conf, state: enumValue(b.state, PREDICTION_STATES), kind: enumValue(b.kind, PREDICTION_KINDS), title: string(b.title) }
        : null;
    }),
    walletsToClear: count(r.walletsToClear), balanceCleared: amount(r.balanceCleared), debtCleared: amount(r.debtCleared),
    standings: count(r.standings),
  };
}
export interface PredictionRolloverInput {
  requestId: string;
  expectedSeasonId: number;
  name: string;
  previewToken: string;
}
/** Freezes the open season's standings, zeroes every balance and opens `name`. Players enroll again. */
export async function rolloverPredictionSeason(input: PredictionRolloverInput): Promise<{ season: PredictionSeason | null }> {
  const r = raw(await credentialedRequest("/admin/predictions/seasons", { method: "POST", body: { ...input } }));
  return { season: seasonOf(r.season) };
}
