/**
 * A conference's standings tiebreaker order: `GET`/`PUT /tournaments/:conf/tiebreakers`.
 *
 * Every ranked read (`/standings/:conf`, the season document's group tables, the bracket editor's
 * candidates) orders teams by this list. Criteria apply in order; teams one leaves level go on to
 * the next, head-to-head criteria count only results among the teams still level, and teams level
 * after the last one share a place. The site never ranks by it: it only names the rules and decides
 * which columns explain them.
 *
 * The read is public and also answers a league admin's session for an unlisted conference, so the
 * editor reads it credentialed and the public pages read it without the session, under separate
 * keys. A hidden or unknown conference answers the same plain-text `400` as every conference read.
 *
 * The write needs the conference `admin` grant or the site admin role and replaces the whole list.
 * Its body must be exactly `{ tiebreakers }`. Every problem comes back at once as a `422`:
 * `tiebreakers` for an empty list, `tiebreakers.<i>` for an unknown or repeated row.
 *
 * `available` is the server's catalog, labels and descriptions included, so pages render from it and
 * never from a local list. An id outside it is one the server does not recognize either and is
 * dropped; an id the site's union lacks but the catalog serves is a newer criterion and stays.
 */

import { credentialedRequest } from "./credentialed";
import { getOne, type RequestOpts } from "./http";

/** The ids this build knows, for typing constants. The served catalog is the authority. */
export type KnownTiebreakerId =
  | "series_wins"
  | "series_differential"
  | "game_win_pct"
  | "game_differential"
  | "game_wins"
  | "head_to_head_series"
  | "head_to_head_games"
  | "avg_win_time"
  | "avg_loss_time";

/** A served criterion id. Usually a `KnownTiebreakerId`, but a newer server can add one. */
export type TiebreakerId = KnownTiebreakerId | (string & {});

const HEAD_TO_HEAD: readonly TiebreakerId[] = ["head_to_head_series", "head_to_head_games"] satisfies KnownTiebreakerId[];
const TIMED: readonly TiebreakerId[] = ["avg_win_time", "avg_loss_time"] satisfies KnownTiebreakerId[];

/** Compares only the teams still tied when it is reached. */
export const isHeadToHeadTiebreaker = (id: TiebreakerId): boolean => HEAD_TO_HEAD.includes(id);
/** Ranks on average game length, which only timed games have. */
export const isTimeTiebreaker = (id: TiebreakerId): boolean => TIMED.includes(id);

/** Upstream refuses an empty list. */
export const TIEBREAKERS_MIN = 1;

export interface TiebreakerInfo {
  id: TiebreakerId;
  label: string;
  description: string;
}

export interface TiebreakerDocument {
  conf: string;
  /** The order in force, never empty. Equals `defaults` for a league that never saved one. */
  tiebreakers: TiebreakerId[];
  defaults: TiebreakerId[];
  /** Every criterion, in the server's stable catalog order. */
  available: TiebreakerInfo[];
}

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function mapInfo(raw: unknown): TiebreakerInfo | null {
  const info = asRaw(raw);
  const id = str(info.id);
  const label = str(info.label);
  return id !== "" && label !== "" ? { id, label, description: str(info.description) } : null;
}

/** Ids the catalog serves, once each, in served order. */
function mapOrder(raw: unknown, known: ReadonlySet<string>): TiebreakerId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap(id => {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) return [];
    seen.add(id);
    return [id];
  });
}

function mapDocument(conf: string, raw: unknown): TiebreakerDocument {
  const doc = asRaw(raw);
  const seen = new Set<string>();
  const available = (Array.isArray(doc.available) ? doc.available : []).flatMap(entry => {
    const info = mapInfo(entry);
    if (info === null || seen.has(info.id)) return [];
    seen.add(info.id);
    return [info];
  });
  return {
    conf: str(doc.conf) || conf,
    tiebreakers: mapOrder(doc.tiebreakers, seen),
    defaults: mapOrder(doc.defaults, seen),
    available,
  };
}

const path = (conf: string): string => `/tournaments/${encodeURIComponent(conf)}/tiebreakers`;

/** The public read, without the session. `null` from a server that predates the route. */
export function tiebreakers(conf: string, opts?: RequestOpts): Promise<TiebreakerDocument | null> {
  return getOne<unknown>(path(conf), { ...opts, anonymous: true }).then(raw =>
    raw === null ? null : mapDocument(conf, raw),
  );
}

/** The editor's read, with the session, so a league admin can open an unlisted league. */
export function manageTiebreakers(conf: string, opts?: RequestOpts): Promise<TiebreakerDocument> {
  return credentialedRequest(path(conf), { cache: "no-store" }, opts).then(raw => mapDocument(conf, raw));
}

/**
 * Replaces the saved order and answers the stored document. A `422` throws `SaveRejected` with its
 * issues; every other refusal throws `ApiError` with its status.
 */
export function saveTiebreakers(conf: string, ids: readonly TiebreakerId[]): Promise<TiebreakerDocument> {
  return credentialedRequest(path(conf), { method: "PUT", body: { tiebreakers: ids } }).then(raw =>
    mapDocument(conf, raw),
  );
}

/** Whether the order in force ranks on `id`. */
export function usesTiebreaker(doc: TiebreakerDocument | null | undefined, id: KnownTiebreakerId): boolean {
  return doc?.tiebreakers.includes(id) ?? false;
}

/** The catalog entry for each id in `order`, skipping any the catalog lacks. */
export function tiebreakerInfos(doc: TiebreakerDocument, order: readonly TiebreakerId[] = doc.tiebreakers): TiebreakerInfo[] {
  const byId = new Map(doc.available.map(info => [info.id, info]));
  return order.flatMap(id => byId.get(id) ?? []);
}
