/**
 * One league's evergreen Info page: a Markdown document plus an ordered quick-link list.
 *
 * This is deliberately a separate resource from `./articles`. Articles are an ordered news feed,
 * and every published row is projected into `/articles` and `/home`; making an Info page an
 * article would therefore put evergreen navigation into the news rail. The new server surface can
 * still share article validation, publication and audit helpers without sharing that projection.
 *
 * The public read is anonymous and returns only the published document. The manage read and the
 * complete-document `PUT` are credentialed and require full admin access to the named league. A
 * missing manage document is `200 null`, not a `404`, because that is the create state of the
 * editor. The server must mount the two credentialed routes with its credentialed CORS policy.
 */

import { credentialedRequest } from "./credentialed";
import { getOne, type RequestOpts } from "./http";

/** Proposed server limits, mirrored so the League Admin form can cap its own fields. */
export const INFO_TITLE_MAX = 200;
export const INFO_LINK_MAX = 24;
export const INFO_LINK_LABEL_MAX = 80;
export const INFO_LINK_URL_MAX = 1024;
/** Same width as a quick link's URL — it is the same kind of value. */
export const INFO_RULEBOOK_URL_MAX = 1024;

export interface InfoLink {
  label: string;
  /** Either an absolute HTTP(S) URL or a site-relative path beginning with one slash. */
  url: string;
}

export interface LeagueInfo {
  conf: string;
  title: string;
  body: string | null;
  /** Displayed in this order; the client never sorts editor-owned content. */
  links: InfoLink[];
  /**
   * Where this league's rulebook lives. **Required by the editor**, and not one of the quick links.
   *
   * A first-class field rather than a well-known entry in `links` because something reads it
   * programmatically: the team application form links its "I have read the rules" confirmation
   * straight at it, so what a captain agrees to is the document the league actually published. Buried
   * in an ordered list it would be identified by matching a label, which is a string an editor can
   * rename.
   *
   * Optional on the type only because a document written before the column existed has none. The
   * editor refuses to save without it, so absence is a migration artifact rather than a state a
   * league can choose.
   */
  rulebookUrl?: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A complete replacement. One league has at most one document, so there is no create/update split.
 *
 * **Upstream matches keys exactly** — an unknown key *and* a missing one are both a `400` — so this
 * has to stay in lockstep with `BODY_KEYS` in the server's `infoValidation.ts`. `rulebookUrl` is
 * non-optional here on purpose: the editor cannot save a document without one, and making it
 * optional would let a call site omit a key the server requires.
 */
export interface LeagueInfoInput {
  title: string;
  body: string | null;
  links: InfoLink[];
  rulebookUrl: string;
  isPublished: boolean;
}

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;

function mapLink(raw: unknown): InfoLink | null {
  const link = asRaw(raw);
  const label = str(link.label).trim();
  const url = str(link.url).trim();
  return label !== "" && url !== "" ? { label, url } : null;
}

function mapLeagueInfo(raw: unknown): LeagueInfo {
  const info = asRaw(raw);
  const links = Array.isArray(info.links)
    ? info.links.map(mapLink).filter((link): link is InfoLink => link !== null)
    : [];

  return {
    conf: str(info.conf),
    title: str(info.title),
    body: strOrNull(info.body),
    links,
    // Absent stays absent rather than becoming `null`: a deployment without the column has no
    // rulebook to report, which the application form has to tell apart from a league that has one and
    // left it blank — the latter is impossible once the editor requires it.
    ...("rulebookUrl" in info ? { rulebookUrl: strOrNull(info.rulebookUrl) } : {}),
    isPublished: info.isPublished === true,
    publishedAt: strOrNull(info.publishedAt),
    createdAt: str(info.createdAt),
    updatedAt: str(info.updatedAt),
  };
}

const infoPath = (conf: string): string => `/${encodeURIComponent(conf)}/info`;

/** The published document, or `null` when this league has no live Info page. */
export function leagueInfo(conf: string, opts?: RequestOpts): Promise<LeagueInfo | null> {
  return getOne<Raw>(infoPath(conf), opts).then(raw =>
    raw === null ? null : mapLeagueInfo(raw),
  );
}

/** The draft-aware editor read. A league without a document answers `null`. */
export function manageLeagueInfo(
  conf: string,
  opts?: RequestOpts,
): Promise<LeagueInfo | null> {
  return credentialedRequest(`${infoPath(conf)}/manage`, {}, opts).then(raw =>
    raw === null ? null : mapLeagueInfo(raw),
  );
}

/** Creates or completely replaces one league's document. */
export function saveLeagueInfo(
  conf: string,
  input: LeagueInfoInput,
  opts?: RequestOpts,
): Promise<LeagueInfo> {
  return credentialedRequest(
    infoPath(conf),
    { method: "PUT", body: input },
    opts,
  ).then(mapLeagueInfo);
}

export const infoApi = { leagueInfo, manageLeagueInfo, saveLeagueInfo };
