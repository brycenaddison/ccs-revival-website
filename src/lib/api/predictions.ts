/**
 * Prediction API boundary. Wire names follow the sibling API's prediction and settings schemas.
 *
 * Business calculations stay upstream: amounts are `{ minor, display }` hundredths, kept here as the
 * `minor` decimal string and never parsed through `Number`. The website never computes a payout; a
 * pool share is display arithmetic only.
 *
 * Upstream behavior worth knowing:
 *
 *  - `outcomes[0]` is always the fixture's team A and `outcomes[1]` team B, and `result.score` uses
 *    the same order. A team can be null on the wire; its outcome keeps a null `teamId`.
 *  - Settled results serve camelCase `winnerTeamId`/`voidReason` beside deprecated snake_case keys.
 *    Only the camelCase keys are read. `score` is null for settlements recorded before it was stored.
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

export const PREDICTION_LEDGER_KINDS = ["starting", "daily", "stake", "settlement", "correction", "transfer", "adjustment"] as const;
export type PredictionLedgerKind = typeof PREDICTION_LEDGER_KINDS[number];

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

/**
 * The machine reason on a prediction error body (`insufficient_points`, `publication_preview_changed`).
 * The sentence to show is still `errorMessage`; this only decides which server state to refresh.
 */
export function predictionErrorReason(error: unknown): string | null {
  return error instanceof ApiError ? string(raw(error.body).reason) : null;
}

// --------------------------------------------------------------------------------------- events

export interface PredictionOutcome {
  /** Null when the wire team is null; such an outcome cannot be picked. */
  teamId: number | null;
  team: TeamMetadata | null;
  /** Effective pool (paid plus bonus), minor units. */
  pool: string;
}
export interface PredictionScore { teamA: number; teamB: number }
export interface PredictionResult {
  winnerTeamId: number | null;
  voidReason: string | null;
  score: PredictionScore | null;
}
export interface PredictionEvent {
  id: number;
  conf: string;
  scheduleMatchId: number | null;
  state: PredictionState;
  revision: number | null;
  settlementRevision: number | null;
  closesAt: string | null;
  openedAt: string | null;
  bestOf: number | null;
  phase: PhaseRef | null;
  /** Team A, then team B. */
  outcomes: [PredictionOutcome, PredictionOutcome];
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
  const pool = amount(r.effective);
  if (pool === null) return null;
  const team = mapTeamMetadata(r.team);
  return { teamId: team?.id ?? null, team, pool };
}
function scoreOf(value: unknown): PredictionScore | null {
  const r = raw(value), teamA = integer(r.teamA), teamB = integer(r.teamB);
  return teamA !== null && teamB !== null && teamA >= 0 && teamB >= 0 ? { teamA, teamB } : null;
}
function resultOf(value: unknown): PredictionResult | null {
  if (!value || typeof value !== "object") return null;
  const r = raw(value);
  return { winnerTeamId: id(r.winnerTeamId), voidReason: string(r.voidReason), score: scoreOf(r.score) };
}
function eventOf(value: unknown, serverNow: string | null = null): PredictionEvent | null {
  const r = raw(value);
  const eventId = id(r.id), conf = string(r.conf), state = enumValue(r.state, PREDICTION_STATES);
  const outcomes = rows(r.outcomes, outcomeOf);
  if (eventId === null || !conf || !state || outcomes.length !== 2) return null;
  const bestOf = integer(r.bestOf);
  return {
    id: eventId,
    conf,
    scheduleMatchId: id(r.scheduleMatchId),
    state,
    revision: id(r.revision),
    settlementRevision: integer(r.settlementRevision),
    closesAt: string(r.closesAt),
    openedAt: string(r.openedAt),
    bestOf: bestOf !== null && bestOf > 0 ? bestOf : null,
    phase: mapPhaseRef(r.phase),
    outcomes: [outcomes[0], outcomes[1]],
    totalPool: (BigInt(outcomes[0].pool) + BigInt(outcomes[1].pool)).toString(),
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

export interface PredictionRewards {
  periodId: number | null;
  eligible: boolean | null;
  claimed: boolean | null;
  /** Eligible and not yet claimed this period. */
  claimable: boolean;
  /** 0 to 5; the reward grows with it. */
  streak: number | null;
  nextReward: string | null;
  resetsAt: string | null;
  siteTimeZone: string | null;
  serverNow: string | null;
}
const rewardsOf = (value: unknown): PredictionRewards | null => {
  if (!value || typeof value !== "object") return null;
  const r = raw(value), eligible = bool(r.eligible), claimed = bool(r.claimed);
  return {
    periodId: id(r.periodId), eligible, claimed, claimable: eligible === true && claimed === false,
    streak: integer(r.streak), nextReward: amount(r.nextReward), resetsAt: string(r.resetsAt),
    siteTimeZone: string(r.siteTimeZone), serverNow: string(r.serverNow),
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

/** Returns the starting balance, for the confirmation. Repeating enrollment awards nothing. */
export async function enrollPredictions(): Promise<{ spendable: string | null }> {
  const r = required(await credentialedRequest("/predictions/me/enroll", { method: "POST", body: {} }), "enrollment");
  return { spendable: amount(r.spendable) };
}

export async function claimPredictionReward(requestId: string, periodId: number): Promise<{ awarded: string | null; alreadyClaimed: boolean }> {
  const r = required(await credentialedRequest("/predictions/me/rewards/claim", { method: "POST", body: { requestId, periodId } }), "the daily reward");
  return { awarded: amount(r.awarded), alreadyClaimed: r.alreadyClaimed === true };
}

// ------------------------------------------------------------------------------------ positions

export interface PredictionPick {
  teamId: number;
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
  const r = raw(value), teamId = id(r.teamId);
  return teamId === null ? null : { teamId, paid: amount(r.paid), estimatedReturn: amount(r.estimatedReturn) };
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
export async function previewPrediction(eventId: number, teamId: number, paid: string, opts?: RequestOpts): Promise<PredictionEstimate> {
  const r = required(await credentialedRequest(`/predictions/${eventId}/preview`,
    { method: "POST", body: { teamId, amount: paid } }, opts), "the return estimate");
  const estimate = { paid: amount(r.paid), bonus: amount(r.bonus), effective: amount(r.effective), estimatedReturn: amount(r.estimatedReturn) };
  if (estimate.paid === null || estimate.bonus === null || estimate.effective === null || estimate.estimatedReturn === null) {
    throw new Error("The return estimate was incomplete.");
  }
  return estimate as PredictionEstimate;
}

/** `requestId` is a command identity: keep it until the outcome is known, then discard it. */
export async function placePrediction(eventId: number, teamId: number, paid: string, requestId: string): Promise<void> {
  await credentialedRequest(`/predictions/${eventId}/stakes`, { method: "POST", body: { teamId, amount: paid, requestId } });
}

// ------------------------------------------------------------------------------------- history

export interface PredictionHistoryEvent {
  id: number;
  conf: string;
  state: PredictionState | null;
  teams: [TeamMetadata | null, TeamMetadata | null];
}
export interface PredictionHistoryEntry {
  id: number;
  kind: PredictionLedgerKind;
  eventId: number | null;
  /** Null for hidden events and entries with no event. */
  event: PredictionHistoryEvent | null;
  /** The picked team on stake entries, when the ledger recorded it. */
  teamId: number | null;
  amount: string | null;
  balanceAfter: string | null;
  createdAt: string | null;
}
const historyEventOf = (value: unknown): PredictionHistoryEvent | null => {
  const r = raw(value), eventId = id(r.id), conf = string(r.conf);
  if (eventId === null || !conf || !Array.isArray(r.teams) || r.teams.length !== 2) return null;
  return { id: eventId, conf, state: enumValue(r.state, PREDICTION_STATES), teams: [mapTeamMetadata(r.teams[0]), mapTeamMetadata(r.teams[1])] };
};
const historyOf = (value: unknown): PredictionHistoryEntry | null => {
  const r = raw(value), entryId = id(r.id), kind = enumValue(r.kind, PREDICTION_LEDGER_KINDS);
  if (entryId === null || !kind) return null;
  return {
    id: entryId, kind, eventId: id(r.eventId), event: historyEventOf(r.event), teamId: id(r.teamId),
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
/** Served ranking; ties share a rank. Cursors are positions, so a moving score can reorder pages. */
export async function predictionLeaderboard(cursor?: string | null, opts?: RequestOpts) {
  const r = required(await getOne<unknown>(`/predictions/leaderboard${params({ cursor })}`, { ...opts, anonymous: true }), "the prediction leaderboard");
  return { items: rows(r.entries, leaderOf), nextCursor: cursorOf(r.nextCursor) };
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

export type PredictionEventAction = "lock" | "reopen" | "void";
export async function predictionAction(conf: string, eventId: number, action: PredictionEventAction, expectedRevision: number, reason: string, requestId: string): Promise<void> {
  await credentialedRequest(`${conferencePath(conf)}/${eventId}/actions`,
    { method: "POST", body: { action, expectedRevision, reason, requestId } });
}

export type PredictionCorrectionKind = "result" | "void";
export interface PredictionCorrectionAffected {
  profileId: number;
  player: PlayerSummary | null;
  delta: string;
  resultingBalance: string;
}
export interface PredictionCorrectionPreview {
  eventId: number;
  expectedRevision: number;
  previewToken: string;
  correction: PredictionCorrectionKind;
  reason: string;
  oldWinnerTeamId: number | null;
  newWinnerTeamId: number | null;
  voidReason: string | null;
  score: PredictionScore | null;
  evidenceCount: number;
  promotionMint: string | null;
  affected: PredictionCorrectionAffected[];
}
export async function previewPredictionCorrection(conf: string, eventId: number, expectedRevision: number, reason: string, correction: PredictionCorrectionKind): Promise<PredictionCorrectionPreview> {
  const r = required(await credentialedRequest(`${conferencePath(conf)}/${eventId}/actions`, { method: "POST", body: {
    action: "preview_correction", correction, expectedRevision, reason, requestId: crypto.randomUUID(),
  } }), "the correction preview");
  const previewToken = string(r.previewToken);
  if (!previewToken) throw new Error("The correction preview did not include a token.");
  return {
    eventId: id(r.eventId) ?? eventId, expectedRevision: id(r.expectedRevision) ?? expectedRevision, previewToken,
    correction, reason, oldWinnerTeamId: id(raw(raw(r.oldResult).inputs).winnerTeamId), newWinnerTeamId: id(r.winnerTeamId),
    voidReason: string(r.voidReason), score: scoreOf(r.score),
    evidenceCount: Array.isArray(r.evidence) ? r.evidence.length : 0, promotionMint: amount(r.promotionMint),
    affected: rows(r.affected, value => {
      const d = raw(value), profileId = id(d.profileId), delta = amount(d.delta), resultingBalance = amount(d.resultingBalance);
      return profileId !== null && delta !== null && resultingBalance !== null
        ? { profileId, player: mapPlayerSummary(d.profile), delta, resultingBalance } : null;
    }),
  };
}
/** `requestId` is fresh per apply attempt and kept for retries of that attempt. */
export async function applyPredictionCorrection(conf: string, preview: PredictionCorrectionPreview, requestId: string): Promise<void> {
  await credentialedRequest(`${conferencePath(conf)}/${preview.eventId}/actions`, { method: "POST", body: {
    action: "correct", correction: preview.correction, expectedRevision: preview.expectedRevision,
    reason: preview.reason, previewToken: preview.previewToken, requestId,
  } });
}
export async function reconcilePredictions(conf: string): Promise<void> {
  await credentialedRequest(`${conferencePath(conf)}/reconcile`, { method: "POST", body: {} });
}

// ---------------------------------------------------------------------------- site settings

export interface PublicPredictionCalendar {
  siteTimeZone: string;
  serverNow: string;
}
export async function publicPredictionSiteSettings(opts?: RequestOpts): Promise<PublicPredictionCalendar> {
  const r = required(await getOne<unknown>("/settings", { ...opts, anonymous: true }), "the site calendar");
  const siteTimeZone = string(r.siteTimeZone), serverNow = string(r.serverNow);
  if (!siteTimeZone || !serverNow) throw new Error("The site calendar did not include a timezone and server time.");
  return { siteTimeZone, serverNow };
}

export const PREDICTION_SWITCHES = ["publicationEnabled", "stakingEnabled", "settlementEnabled", "rewardsEnabled"] as const;
export type PredictionSwitch = typeof PREDICTION_SWITCHES[number];

export interface PredictionSiteSettings extends Record<PredictionSwitch, boolean | null> {
  siteTimeZone: string | null;
  pendingTimeZone: string | null;
  effectiveAt: string | null;
  version: number | null;
}
export async function predictionSiteSettings(opts?: RequestOpts): Promise<PredictionSiteSettings> {
  const r = required(await credentialedRequest("/admin/settings", { cache: "no-store" }, opts), "the site settings");
  return {
    siteTimeZone: string(r.site_time_zone), pendingTimeZone: string(r.pending_time_zone),
    effectiveAt: string(r.pending_effective_at), version: integer(r.version),
    publicationEnabled: bool(r.publication_enabled), stakingEnabled: bool(r.staking_enabled),
    settlementEnabled: bool(r.settlement_enabled), rewardsEnabled: bool(r.rewards_enabled),
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
