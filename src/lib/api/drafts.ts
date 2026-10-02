/**
 * Drafter rooms: the global draft settings, one room per fixture, day batches, rechecks and the
 * site-admin repair inbox.
 *
 * Upstream behavior worth knowing:
 *
 *  - Every route is session-scoped and answers no-store. A league's `schedule` grant (or site admin)
 *    creates, reads and rechecks a fixture's room; settings and the issues inbox are site admin only.
 *  - Settings are one revisioned document replaced whole. A stale `expectedRevision` is a 409, an
 *    identical save is a no-op, and a change applies only to rooms created afterwards.
 *  - A fixture holds at most one registration, reserved before the provider call. An identical
 *    repeat answers 200 with it; changed labels or an unresolved attempt answer 409 with the existing
 *    registration. `failed` and `uncertain` registrations are terminal here: room replacement is not
 *    part of the API, and a timeout must never be retried into a second room.
 *  - `gameAmount` must equal the fixture's effective best-of, labels are trimmed 1 to 35 characters,
 *    and byes are refused. Team 1 is the fixture's original team A; each game's blue and red sides
 *    are independent of that.
 *  - A registration records the fixture it was made for. `fixtureMismatch` means the teams,
 *    conference, best-of or kind changed since, and the public preview then withholds the room.
 *  - The day batch validates the whole selection before the first provider call, skips byes, and
 *    reports per fixture. Earlier successes survive a later failure; throttling stops the run.
 *  - A recheck fetches only the registered series, answers 200 once processed and 202 while queued
 *    or under review. It has a per-series cooldown; failures leave stored games untouched.
 *  - Refusals carry a category code (`{ error, uncertain }`), plus the existing `series` on a
 *    creation conflict. `draftErrorText` in the components owns their sentences.
 *  - Game rows keep the provider's snake_case and physical sides. Champion values are numeric IDs;
 *    a skipped ban keeps its null slot, and pick order stays on its side even when red picks first.
 */

import { credentialedRequest } from "./credentialed";
import { ApiError, type RequestOpts } from "./http";

// ---------------------------------------------------------------------------------- constraints

export const DRAFT_MODES = ["normal", "fearless", "ironman"] as const;
export type DraftMode = (typeof DRAFT_MODES)[number];

export const DRAFT_SERIES_STATUSES = ["creating", "ready", "failed", "uncertain"] as const;
export type DraftSeriesStatus = (typeof DRAFT_SERIES_STATUSES)[number];

export const DRAFT_RECEIPT_STATES = [
  "pending", "processing", "processed", "retry", "unmatched", "unsupported", "review",
] as const;
export type DraftReceiptState = (typeof DRAFT_RECEIPT_STATES)[number];

export const DRAFT_ROLE_STATUSES = ["unknown", "pending", "completed", "skipped"] as const;
export type DraftRoleStatus = (typeof DRAFT_ROLE_STATUSES)[number];

export const DRAFT_BATCH_STATUSES = ["created", "existing", "skipped", "failed", "uncertain"] as const;
export type DraftBatchStatus = (typeof DRAFT_BATCH_STATUSES)[number];

/** Wire suffixes of a side's role assignment columns, in lane order. */
export const DRAFT_ROLES = ["top", "jg", "mid", "bot", "sup"] as const;
export type DraftRole = (typeof DRAFT_ROLES)[number];

export const DRAFT_SIDES = ["blue", "red"] as const;
export type DraftSide = (typeof DRAFT_SIDES)[number];

export const DRAFT_TEAM_NAME_MAX = 35;
export const DRAFT_GAMES_MAX = 5;
export const DRAFT_DISABLED_CHAMPIONS_MAX = 1000;
export const DRAFT_ISSUES_LIMIT_MAX = 100;

// ---------------------------------------------------------------------------------------- types

export interface DraftSettings {
  disabledChampionIds: number[];
  firstSelection: boolean;
  /** Null for a mode this client does not know; the form refuses to save over it. */
  draftMode: DraftMode | null;
  /** Null when the server sent none, which leaves nothing to send as `expectedRevision`. */
  revision: number | null;
  updatedAt: string | null;
}

export interface DraftSettingsInput {
  disabledChampionIds: number[];
  firstSelection: boolean;
  draftMode: DraftMode;
  expectedRevision: number;
}

export interface DraftSeries {
  id: string;
  drafterSeriesId: string | null;
  url: string | null;
  scheduleMatchId: number | null;
  originalScheduleMatchId: number | null;
  conf: string;
  team1Name: string;
  team2Name: string;
  gameAmount: number | null;
  draftMode: DraftMode | null;
  firstSelection: boolean | null;
  disabledChampionIds: number[];
  settingsRevision: number | null;
  status: DraftSeriesStatus | null;
  /** Retained for operators matching an ambiguous attempt against the provider's history. */
  attemptId: string | null;
  failureCategory: string | null;
  nextFetchAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DraftCreationInput {
  team1Name: string;
  team2Name: string;
  gameAmount: number;
}

export interface DraftCreated {
  created: boolean;
  series: DraftSeries;
  fixtureMismatch: boolean;
}

export interface DraftTeamSide {
  name: string;
  /** Five slots; null is a skipped ban. */
  bans: (number | null)[];
  picks: (number | null)[];
  roles: Record<DraftRole, number | null>;
}

export interface DraftGame {
  gameNumber: number;
  url: string | null;
  patch: string | null;
  firstPick: DraftSide | null;
  blue: DraftTeamSide;
  red: DraftTeamSide;
  roleStatus: DraftRoleStatus | null;
  updatedAt: string | null;
}

export interface DraftRead {
  series: DraftSeries | null;
  fixtureMismatch: boolean;
  games: DraftGame[];
}

export interface DraftCounts {
  created: number;
  updated: number;
  unchanged: number;
}

export interface DraftImport {
  receiptId: string | null;
  state: DraftReceiptState | null;
  outcome: DraftCounts | null;
  games: DraftGame[];
}

export interface DraftBatchOutcome {
  scheduleMatchId: number;
  /** Null for a status this client does not know; the row is kept so no outcome goes unreported. */
  status: DraftBatchStatus | null;
  series: DraftSeries | null;
  fixtureMismatch: boolean;
  error: string | null;
  reason: string | null;
}

export interface DraftBatch {
  seasonDay: number;
  partial: boolean;
  outcomes: DraftBatchOutcome[];
}

export interface DraftReceiptIssue {
  id: string;
  source: "webhook" | "fetch" | null;
  providerSeriesId: string | null;
  gameNumber: number | null;
  event: string | null;
  state: DraftReceiptState | null;
  attempts: number;
  errorCategory: string | null;
  receivedAt: string | null;
  nextAttemptAt: string | null;
}

export interface DraftIssues {
  receipts: DraftReceiptIssue[];
  nextCursor: string | null;
  creations: DraftSeries[];
  nextCreationCursor: string | null;
}

export interface DraftIssueQuery {
  cursor: string | null;
  creationCursor: string | null;
  limit?: number;
}

export interface DraftRepair {
  receiptId: string | null;
  state: DraftReceiptState | null;
  outcome: DraftCounts | null;
}

export interface DraftRefusal {
  category: string;
  /** The provider may have created a room; never retry this into a second one. */
  uncertain: boolean;
  /** The registration already holding the fixture, on a creation conflict. */
  series: DraftSeries | null;
}

// ---------------------------------------------------------------------------------- normalizing

type Raw = Record<string, unknown>;

const raw = (value: unknown): Raw => value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
const string = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const integer = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const positive = (value: unknown): number | null => { const n = integer(value); return n !== null && n > 0 ? n : null; };
const bool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const rows = <T>(value: unknown, map: (value: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.flatMap(entry => { const mapped = map(entry); return mapped === null ? [] : [mapped]; }) : [];
const enumValue = <T extends string>(value: unknown, values: readonly T[]): T | null =>
  typeof value === "string" && values.includes(value as T) ? value as T : null;

/** Only an absolute HTTPS address may become a link; anything else is dropped rather than repaired. */
export function draftLink(value: unknown): string | null {
  const text = string(value);
  if (!text) return null;
  try {
    return new URL(text).protocol === "https:" ? text : null;
  } catch {
    return null;
  }
}

function countsOf(value: unknown): DraftCounts | null {
  if (value === null || typeof value !== "object") return null;
  const r = raw(value);
  return {
    created: Math.max(0, integer(r.created) ?? 0),
    updated: Math.max(0, integer(r.updated) ?? 0),
    unchanged: Math.max(0, integer(r.unchanged) ?? 0),
  };
}

function settingsOf(value: unknown): DraftSettings {
  const r = raw(value);
  return {
    disabledChampionIds: rows(r.disabledChampionIds, positive),
    firstSelection: bool(r.firstSelection) ?? false,
    draftMode: enumValue(r.draftMode, DRAFT_MODES),
    revision: positive(r.revision),
    updatedAt: string(r.updatedAt),
  };
}

function seriesOf(value: unknown): DraftSeries | null {
  const r = raw(value);
  const id = string(r.id);
  if (!id) return null;
  return {
    id,
    drafterSeriesId: string(r.drafterSeriesId),
    url: draftLink(r.url),
    scheduleMatchId: positive(r.scheduleMatchId),
    originalScheduleMatchId: positive(r.originalScheduleMatchId),
    conf: string(r.conf) ?? "",
    team1Name: string(r.team1Name) ?? "",
    team2Name: string(r.team2Name) ?? "",
    gameAmount: positive(r.gameAmount),
    draftMode: enumValue(r.draftMode, DRAFT_MODES),
    firstSelection: bool(r.firstSelection),
    disabledChampionIds: rows(r.disabledChampionIds, positive),
    settingsRevision: positive(r.settingsRevision),
    status: enumValue(r.status, DRAFT_SERIES_STATUSES),
    attemptId: string(r.attemptId),
    failureCategory: string(r.failureCategory),
    nextFetchAt: string(r.nextFetchAt),
    createdAt: string(r.createdAt),
    updatedAt: string(r.updatedAt),
  };
}

const SLOTS = [1, 2, 3, 4, 5] as const;

function sideOf(r: Raw, side: DraftSide): DraftTeamSide {
  return {
    name: string(r[`${side}_name`]) ?? "",
    bans: SLOTS.map(n => positive(r[`${side}_ban_${n}`])),
    picks: SLOTS.map(n => positive(r[`${side}_pick_${n}`])),
    roles: Object.fromEntries(
      DRAFT_ROLES.map(role => [role, positive(r[`assignment_${side}_${role}`])]),
    ) as Record<DraftRole, number | null>,
  };
}

function gameOf(value: unknown): DraftGame | null {
  const r = raw(value);
  const gameNumber = positive(r.game_number);
  if (gameNumber === null) return null;
  return {
    gameNumber,
    url: draftLink(r.url),
    patch: string(r.patch),
    firstPick: enumValue(r.firstpick, DRAFT_SIDES),
    blue: sideOf(r, "blue"),
    red: sideOf(r, "red"),
    roleStatus: enumValue(r.role_status, DRAFT_ROLE_STATUSES),
    updatedAt: string(r.updated_at),
  };
}

function importOf(value: unknown): DraftImport {
  const r = raw(value);
  return {
    receiptId: string(r.receiptId),
    state: enumValue(r.state, DRAFT_RECEIPT_STATES),
    outcome: countsOf(r.outcome),
    games: rows(r.games, gameOf),
  };
}

function batchOutcomeOf(value: unknown): DraftBatchOutcome | null {
  const r = raw(value);
  const scheduleMatchId = positive(r.scheduleMatchId);
  if (scheduleMatchId === null) return null;
  return {
    scheduleMatchId,
    status: enumValue(r.status, DRAFT_BATCH_STATUSES),
    series: r.series == null ? null : seriesOf(r.series),
    fixtureMismatch: r.fixtureMismatch === true,
    error: string(r.error),
    reason: string(r.reason),
  };
}

function receiptOf(value: unknown): DraftReceiptIssue | null {
  const r = raw(value);
  const id = string(r.id);
  if (!id) return null;
  return {
    id,
    source: enumValue(r.source, ["webhook", "fetch"] as const),
    providerSeriesId: string(r.providerSeriesId),
    gameNumber: positive(r.gameNumber),
    event: string(r.event),
    state: enumValue(r.state, DRAFT_RECEIPT_STATES),
    attempts: Math.max(0, integer(r.attempts) ?? 0),
    errorCategory: string(r.errorCategory),
    receivedAt: string(r.receivedAt),
    nextAttemptAt: string(r.nextAttemptAt),
  };
}

/** The category and any existing registration behind a refusal, or null for other failures. */
export function draftRefusal(error: unknown): DraftRefusal | null {
  if (!(error instanceof ApiError)) return null;
  const body = raw(error.body);
  const category = string(body.error);
  if (!category) return null;
  return {
    category,
    uncertain: body.uncertain === true,
    series: body.series == null ? null : seriesOf(body.series),
  };
}

// ------------------------------------------------------------------------------------ endpoints

const forMatch = (id: number) => `/tournaments/schedule/${id}/drafts`;
const ADMIN = "/admin/drafts";

export async function draftSettings(opts?: RequestOpts): Promise<DraftSettings> {
  return settingsOf(await credentialedRequest(`${ADMIN}/settings`, { cache: "no-store" }, opts));
}

export async function saveDraftSettings(input: DraftSettingsInput, opts?: RequestOpts): Promise<DraftSettings> {
  return settingsOf(await credentialedRequest(`${ADMIN}/settings`, { method: "PUT", body: input }, opts));
}

export async function fixtureDraft(scheduleMatchId: number, opts?: RequestOpts): Promise<DraftRead> {
  const r = raw(await credentialedRequest(forMatch(scheduleMatchId), { cache: "no-store" }, opts));
  return {
    series: r.series == null ? null : seriesOf(r.series),
    fixtureMismatch: r.fixtureMismatch === true,
    games: rows(r.games, gameOf),
  };
}

export async function createFixtureDraft(
  scheduleMatchId: number,
  input: DraftCreationInput,
  opts?: RequestOpts,
): Promise<DraftCreated> {
  const r = raw(await credentialedRequest(forMatch(scheduleMatchId), { method: "POST", body: input }, opts));
  const series = seriesOf(r.series);
  if (!series) throw new ApiError(200, forMatch(scheduleMatchId), "The draft room response had no registration.");
  return { created: r.created === true, series, fixtureMismatch: r.fixtureMismatch === true };
}

export async function recheckFixtureDraft(scheduleMatchId: number, opts?: RequestOpts): Promise<DraftImport> {
  return importOf(await credentialedRequest(`${forMatch(scheduleMatchId)}/recheck`, { method: "POST", body: {} }, opts));
}

/** Every fixture on the day with the server's default labels and best-of. */
export async function createDayDrafts(conf: string, seasonDay: number, opts?: RequestOpts): Promise<DraftBatch> {
  const path = `/tournaments/${encodeURIComponent(conf)}/schedule/${seasonDay}/drafts`;
  const r = raw(await credentialedRequest(path, { method: "POST", body: {} }, opts));
  return {
    seasonDay: positive(r.seasonDay) ?? seasonDay,
    partial: r.partial === true,
    outcomes: rows(r.outcomes, batchOutcomeOf),
  };
}

export async function draftIssues(query: DraftIssueQuery, opts?: RequestOpts): Promise<DraftIssues> {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.creationCursor) params.set("creationCursor", query.creationCursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const search = params.toString();
  const r = raw(await credentialedRequest(`${ADMIN}/issues${search ? `?${search}` : ""}`, { cache: "no-store" }, opts));
  return {
    receipts: rows(r.receipts, receiptOf),
    nextCursor: string(r.nextCursor),
    creations: rows(r.creations, seriesOf),
    nextCreationCursor: string(r.nextCreationCursor),
  };
}

export async function reprocessDraftReceipt(receiptId: string, opts?: RequestOpts): Promise<DraftRepair> {
  const path = `${ADMIN}/receipts/${encodeURIComponent(receiptId)}/reprocess`;
  const r = raw(await credentialedRequest(path, { method: "POST", body: {} }, opts));
  return {
    receiptId: string(r.receiptId),
    state: enumValue(r.state, DRAFT_RECEIPT_STATES),
    outcome: countsOf(r.outcome),
  };
}

export const draftsApi = {
  draftSettings,
  saveDraftSettings,
  fixtureDraft,
  createFixtureDraft,
  recheckFixtureDraft,
  createDayDrafts,
  draftIssues,
  reprocessDraftReceipt,
};
