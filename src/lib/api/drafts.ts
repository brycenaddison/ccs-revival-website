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
 *  - The issues inbox lists failed (`retry`) receipts, which wait for a reprocess or recheck rather
 *    than a timer, and `processing` receipts whose lease expired. Both take the same reprocess.
 *  - Game issues are computed on read: `champion_mismatch` is a code-linked game whose champions
 *    differ from its draft, so no statistic uses that draft; `missing_draft` is a played game on a
 *    drafted fixture with no draft game for its number. Their cursor is opaque and passed back verbatim.
 *  - A correction replaces one game's picks, bans and first pick, revision-checked against the
 *    editor read's `draft.updatedAt` (sent verbatim) or null to create a missing game. There is no
 *    revert, and later provider deliveries never overwrite a stored game. All ten role assignments
 *    are required and the save completes role confirmation, so nothing is left for a later delivery
 *    to fill. Fearless repeats save and come back as warnings. Statistics pick the change up on their
 *    next refresh, about 30 seconds later.
 */

import { credentialedRequest } from "./credentialed";
import { ApiError, type RequestOpts } from "./http";
import { normalizeRole, type Role } from "./normalize";

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

export const DRAFT_GAME_ISSUE_KINDS = ["champion_mismatch", "missing_draft"] as const;
export type DraftGameIssueKind = (typeof DRAFT_GAME_ISSUE_KINDS)[number];

/** Each side drafts this many picks and ban slots. */
export const DRAFT_SIDE_SLOTS = 5;
export const DRAFT_CORRECTION_REASON_MAX = 500;

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
  /** Whether red could take first pick. Without it blue always picks first. */
  firstSelection: boolean | null;
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

/** One draft side mapped to the played team that shares most of its picks. */
export interface DraftSideDifference {
  side: DraftSide;
  /** `teams.id` of that played team. */
  teamId: number | null;
  /** Drafted on this side but not played by its team. */
  draftOnly: number[];
  /** Played by this side's team but not drafted. */
  playedOnly: number[];
}

export interface DraftGameIssue {
  /** Null for a kind this client does not know; the row is kept so no issue goes unlisted. */
  kind: DraftGameIssueKind | null;
  matchId: string;
  conf: string | null;
  scheduleMatchId: number | null;
  game: number;
  drafterSeriesId: string;
  /** Set when a correction was saved and the champions still differ. */
  correctedAt: string | null;
  /** Empty for `missing_draft`. */
  difference: DraftSideDifference[];
}

export interface DraftGameIssues {
  issues: DraftGameIssue[];
  nextCursor: string | null;
}

export type DraftRoleAssignment = Record<DraftRole, number>;

export interface DraftStoredSide {
  /** The draft's side label. */
  name: string;
  picks: number[];
  /** Null is a skipped ban. */
  bans: (number | null)[];
  roles: DraftRoleAssignment | null;
}

export interface DraftCorrectionMark {
  correctedAt: string | null;
  correctedBy: number | null;
  reason: string | null;
}

export interface DraftStored {
  firstPick: DraftSide | null;
  blue: DraftStoredSide;
  red: DraftStoredSide;
  roleStatus: DraftRoleStatus | null;
  patch: string | null;
  fearless: boolean;
  ironman: boolean;
  /** The revision a correction sends back verbatim. Null leaves nothing to send, so saving is refused. */
  updatedAt: string | null;
  correction: DraftCorrectionMark | null;
}

export interface DraftPlayedChampion {
  championId: number | null;
  role: Role | null;
}

export interface DraftPlayedTeam {
  teamId: number | null;
  champions: DraftPlayedChampion[];
}

export interface DraftPlayed {
  matchId: string;
  championsMatch: boolean;
  teams: DraftPlayedTeam[];
}

export interface DraftEditor {
  drafterSeriesId: string;
  game: number;
  url: string | null;
  conf: string;
  scheduleMatchId: number | null;
  gameAmount: number | null;
  draftMode: DraftMode | null;
  /** Whether red may take first pick in this series. */
  firstSelection: boolean;
  /** Null when nothing is stored for this game. */
  draft: DraftStored | null;
  /** The game linked by code, else the longest recorded for the fixture and game number. */
  played: DraftPlayed | null;
  difference: DraftSideDifference[];
}

export interface DraftCorrectionSideInput {
  /** In this side's pick order. */
  picks: number[];
  /** In slot order; null is a skipped ban. */
  bans: (number | null)[];
}

export interface DraftCorrectionInput {
  expectedUpdatedAt: string | null;
  reason: string;
  firstPick: DraftSide;
  blue: DraftCorrectionSideInput;
  red: DraftCorrectionSideInput;
  /** All ten, each side a permutation of its picks. Required: the save completes role confirmation. */
  roles: Record<DraftSide, DraftRoleAssignment>;
}

export interface DraftCorrectionWarning {
  kind: "fearless_repeat";
  championId: number;
  /** The other game of the series that also picked it. */
  game: number;
}

export interface DraftCorrectionSaved {
  editor: DraftEditor;
  warnings: DraftCorrectionWarning[];
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
    firstSelection: bool(r.firstselection),
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
  };
}

function differenceOf(value: unknown): DraftSideDifference | null {
  const r = raw(value);
  const side = enumValue(r.side, DRAFT_SIDES);
  if (side === null) return null;
  return {
    side,
    teamId: positive(r.teamId),
    draftOnly: rows(r.draftOnly, positive),
    playedOnly: rows(r.playedOnly, positive),
  };
}

function gameIssueOf(value: unknown): DraftGameIssue | null {
  const r = raw(value);
  const matchId = string(r.matchId);
  const drafterSeriesId = string(r.drafterSeriesId);
  const game = positive(r.game);
  if (!matchId || !drafterSeriesId || game === null) return null;
  return {
    kind: enumValue(r.kind, DRAFT_GAME_ISSUE_KINDS),
    matchId,
    conf: string(r.conf),
    scheduleMatchId: positive(r.scheduleMatchId),
    game,
    drafterSeriesId,
    correctedAt: string(r.correctedAt),
    difference: rows(r.difference, differenceOf),
  };
}

function roleAssignmentOf(value: unknown): DraftRoleAssignment | null {
  if (value === null || typeof value !== "object") return null;
  const r = raw(value);
  const out = {} as DraftRoleAssignment;
  for (const role of DRAFT_ROLES) {
    const id = positive(r[role]);
    // A partial assignment is not one; treat it as unconfirmed rather than inventing slots.
    if (id === null) return null;
    out[role] = id;
  }
  return out;
}

function storedSideOf(value: unknown): DraftStoredSide {
  const r = raw(value);
  return {
    name: string(r.name) ?? "",
    picks: rows(r.picks, positive),
    // Slots keep their position, so a skipped ban stays where it was rather than collapsing.
    bans: Array.isArray(r.bans) ? r.bans.map(positive) : [],
    roles: roleAssignmentOf(r.roles),
  };
}

function storedDraftOf(value: unknown): DraftStored | null {
  if (value === null || typeof value !== "object") return null;
  const r = raw(value);
  const correction = r.correction === null || typeof r.correction !== "object" ? null : raw(r.correction);
  return {
    firstPick: enumValue(r.firstPick, DRAFT_SIDES),
    blue: storedSideOf(r.blue),
    red: storedSideOf(r.red),
    roleStatus: enumValue(r.roleStatus, DRAFT_ROLE_STATUSES),
    patch: string(r.patch),
    fearless: r.fearless === true,
    ironman: r.ironman === true,
    updatedAt: string(r.updatedAt),
    correction: correction && {
      correctedAt: string(correction.correctedAt),
      correctedBy: positive(correction.correctedBy),
      reason: string(correction.reason),
    },
  };
}

function playedOf(value: unknown): DraftPlayed | null {
  if (value === null || typeof value !== "object") return null;
  const r = raw(value);
  const matchId = string(r.matchId);
  if (!matchId) return null;
  return {
    matchId,
    championsMatch: r.championsMatch === true,
    teams: rows(r.teams, team => {
      const t = raw(team);
      return {
        teamId: positive(t.teamId),
        champions: rows(t.champions, champion => {
          const c = raw(champion);
          return { championId: positive(c.championId), role: normalizeRole(string(c.role)) };
        }),
      };
    }),
  };
}

function editorOf(value: unknown): DraftEditor | null {
  const r = raw(value);
  const drafterSeriesId = string(r.drafterSeriesId);
  const game = positive(r.game);
  if (!drafterSeriesId || game === null) return null;
  return {
    drafterSeriesId,
    game,
    url: draftLink(r.url),
    conf: string(r.conf) ?? "",
    scheduleMatchId: positive(r.scheduleMatchId),
    gameAmount: positive(r.gameAmount),
    draftMode: enumValue(r.draftMode, DRAFT_MODES),
    firstSelection: r.firstSelection === true,
    draft: storedDraftOf(r.draft),
    played: playedOf(r.played),
    difference: rows(r.difference, differenceOf),
  };
}

function warningOf(value: unknown): DraftCorrectionWarning | null {
  const r = raw(value);
  const championId = positive(r.championId);
  const game = positive(r.game);
  if (r.kind !== "fearless_repeat" || championId === null || game === null) return null;
  return { kind: "fearless_repeat", championId, game };
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

export async function draftGameIssues(cursor: string | null, opts?: RequestOpts): Promise<DraftGameIssues> {
  const search = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  const r = raw(await credentialedRequest(`${ADMIN}/games/issues${search}`, { cache: "no-store" }, opts));
  return { issues: rows(r.issues, gameIssueOf), nextCursor: string(r.nextCursor) };
}

const editorPath = (drafterSeriesId: string, game: number) =>
  `${ADMIN}/games/${encodeURIComponent(drafterSeriesId)}/${game}`;

export async function draftEditor(drafterSeriesId: string, game: number, opts?: RequestOpts): Promise<DraftEditor> {
  const path = editorPath(drafterSeriesId, game);
  const editor = editorOf(await credentialedRequest(path, { cache: "no-store" }, opts));
  if (!editor) throw new ApiError(200, path, "The draft editor response had no game.");
  return editor;
}

export async function saveDraftCorrection(
  drafterSeriesId: string,
  game: number,
  input: DraftCorrectionInput,
  opts?: RequestOpts,
): Promise<DraftCorrectionSaved> {
  const path = editorPath(drafterSeriesId, game);
  const r = raw(await credentialedRequest(path, { method: "PUT", body: input }, opts));
  const editor = editorOf(r.editor);
  if (!editor) throw new ApiError(200, path, "The correction response had no game.");
  return { editor, warnings: rows(r.warnings, warningOf) };
}

export const draftsApi = {
  draftGameIssues,
  draftEditor,
  saveDraftCorrection,
  draftSettings,
  saveDraftSettings,
  fixtureDraft,
  createFixtureDraft,
  recheckFixtureDraft,
  createDayDrafts,
  draftIssues,
  reprocessDraftReceipt,
};
