/**
 * The address of the draft correction editor, Site Admin > Drafts with the game in the query.
 *
 * The game issues list only catches champion mismatches and missing drafts, so a draft with a missed
 * ban, a wrong pick order, first pick or roles, or one whose game was not linked by tournament code
 * is corrected by opening it directly. The staff schedule's draft results and the game page's Draft
 * tab link here for site admins. Kept apart from the editor so those pages can link without loading
 * it.
 */

export interface DraftGameRef {
  drafterSeriesId: string;
  game: number;
}

const SERIES = "series";
const GAME = "game";

export function draftCorrectionPath(ref: DraftGameRef): string {
  return `/admin/drafts?${new URLSearchParams({ [SERIES]: ref.drafterSeriesId, [GAME]: String(ref.game) })}`;
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
