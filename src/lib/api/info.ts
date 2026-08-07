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
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A complete replacement. One league has at most one document, so there is no create/update split. */
export interface LeagueInfoInput {
  title: string;
  body: string | null;
  links: InfoLink[];
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
