/**
 * The addresses of the draft correction editor and a fixture's game list, Site Admin > Drafts with
 * the game or fixture in the query.
 *
 * The game issues list only catches champion mismatches and missing drafts, so a draft with a missed
 * ban, a wrong pick order, first pick or roles, or one whose game was not linked by tournament code
 * is corrected by opening it directly. A game that was never delivered reaches no worklist at all and
 * is opened from its fixture's game list. The staff schedule's draft results and the game page's
 * Draft tab link here for site admins. Kept apart from the editor so those pages can link without
 * loading it.
 *
 * A game opened with `fixture` beside it returns to that fixture's list on Back.
 */

export interface DraftGameRef {
  drafterSeriesId: string;
  game: number;
}

const SERIES = "series";
const GAME = "game";
const FIXTURE = "fixture";

export function draftCorrectionPath(ref: DraftGameRef, scheduleMatchId?: number | null): string {
  const params = withDraftGame(new URLSearchParams(), ref);
  if (scheduleMatchId != null) params.set(FIXTURE, String(scheduleMatchId));
  return `/admin/drafts?${params}`;
}

export function draftFixturePath(scheduleMatchId: number): string {
  return `/admin/drafts?${withDraftFixture(new URLSearchParams(), scheduleMatchId)}`;
}

/** The fixture the query names, or null when it names none or names one malformed. */
export function draftFixtureOf(params: URLSearchParams): number | null {
  const id = Number(params.get(FIXTURE));
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

export function withDraftFixture(params: URLSearchParams, scheduleMatchId: number): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(FIXTURE, String(scheduleMatchId));
  return next;
}

export function withoutDraftFixture(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(FIXTURE);
  return next;
}

/** The game the query names, or null when it names none or names one malformed. */
export function draftGameRefOf(params: URLSearchParams): DraftGameRef | null {
  const drafterSeriesId = params.get(SERIES)?.trim();
  const game = Number(params.get(GAME));
  return drafterSeriesId && Number.isSafeInteger(game) && game >= 1 ? { drafterSeriesId, game } : null;
}

/** The same query with the editor's parameters removed, keeping anything else it carries. */
export function withoutDraftGame(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(SERIES);
  next.delete(GAME);
  return next;
}

export function withDraftGame(params: URLSearchParams, ref: DraftGameRef): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(SERIES, ref.drafterSeriesId);
  next.set(GAME, String(ref.game));
  return next;
}
