/**
 * News posts — the public reads and the `content`-gated writes.
 *
 * One module for both because it is one API area, the way `./admin` holds its reads and writes
 * together. The transports differ and have to: the two public reads go through `./http`, which
 * must not send credentials, while the four writes go through `./credentialed`, which must. See
 * that file for why the two cannot be merged.
 *
 * **An article is normally a link.** Writers work in Google Docs, so `kind: "link"` with an
 * `externalUrl` is the common row and `kind: "native"` with a `body` is the same table once
 * content moves in-house. Nothing here assumes one — the editor offers both and the cards branch
 * on `kind`.
 *
 * `slug` is the primary key *and* the public URL, derived from the title when a create doesn't
 * name one. It cannot be changed by `PATCH`: that is a new article, and upstream refuses it.
 */

import { credentialedRequest } from "./credentialed";
import {
  mapArticleCard,
  type ArticleCard,
  type ArticleKind,
  type ArticleType,
} from "./home";
import { getList, getOne, type RequestOpts } from "./http";

// ---------------------------------------------------------------------- types

/**
 * One article in full — the single read and every manage read.
 *
 * The extra fields over `ArticleCard` are exactly the ones a public list must not carry: the body,
 * the draft flag and the audit columns. Keeping them on a separate type is what stops a list view
 * from rendering a `body` it was never served.
 */
export interface ArticleRecord extends ArticleCard {
  body: string | null;
  isPublished: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Column widths, enforced upstream and mirrored here so a field can cap its own input.
 * From `articleValidation.ts` and the `articles` table.
 */
export const SLUG_MAX = 256;
export const TITLE_MAX = 200;
export const SUBTITLE_MAX = 300;
export const AUTHOR_MAX = 80;
export const TAG_MAX = 40;
export const EXTERNAL_URL_MAX = 1024;
export const IMAGE_URL_MAX = 512;

/** The list defaults upstream. A request over `MAX_LIMIT` is clamped, not refused. */
export const DEFAULT_LIMIT = 12;
export const MAX_LIMIT = 50;

/**
 * Slugs that would save and then be permanently unreachable.
 *
 * `/articles/view/:slug` and `/articles/manage` are both registered ahead of `/articles/:slug`, so
 * an article holding either name is shadowed by the route forever. Upstream's own reserved set
 * currently holds only `view` while its documentation claims both — flagged in the API deliverable
 * — so this list is the one that has to be right. It costs nothing to refuse both here.
 */
export const RESERVED_SLUGS: readonly string[] = ["view", "manage"];

// ----------------------------------------------------------------- normalizing

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function mapRecord(raw: unknown): ArticleRecord {
  const a = asRaw(raw);
  return {
    ...mapArticleCard(raw),
    body: strOrNull(a.body),
    isPublished: a.isPublished === true,
    createdBy: typeof a.createdBy === "number" ? a.createdBy : null,
    createdAt: str(a.createdAt),
    updatedAt: str(a.updatedAt),
  };
}

/**
 * The slug a title *will* get — a preview, not the value that gets stored.
 *
 * The server derives the real one in `articleValidation.slugify` and is the authority; this exists
 * so the create form can show what it is about to ask for rather than revealing it after the save.
 * Kept deliberately in step with that function: lowercase, non-alphanumerics to hyphens, collapsed
 * and trimmed. If the two ever drift the preview is wrong and the save still succeeds, which is the
 * right way round for a mismatch to fail.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}

/** True when a slug would be shadowed by a route. The editor blocks on this before saving. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}

// -------------------------------------------------------------- write payloads

export interface ArticleCreate {
  title: string;
  /** Omit to have the server derive it from the title. */
  slug?: string;
  subtitle?: string | null;
  author?: string | null;
  imageUrl?: string | null;
  /** Required when `kind` is `"link"`, which is the default. */
  externalUrl?: string | null;
  /** Required when `kind` is `"native"`. */
  body?: string | null;
  kind?: ArticleKind;
  articleType?: ArticleType;
  tag?: string | null;
  conf?: string | null;
  isPublished?: boolean;
  /** Publishing without one stamps the current time upstream. */
  publishedAt?: string | null;
}

/**
 * A subset of an article. An absent key leaves that field alone; an explicit `null` clears a
 * nullable one. `slug` is absent by construction — it is the primary key and the public URL.
 */
export type ArticleUpdate = Omit<ArticleCreate, "title" | "slug"> & { title?: string };

// ------------------------------------------------------------ public endpoints

export interface ArticleQuery {
  /** Widens to include site-wide rows, exactly as on `/home`. */
  conf?: string;
  limit?: number;
  offset?: number;
}

function search(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Published articles, newest first. Ordering is the server's; never re-sort it. */
export function articles(query: ArticleQuery = {}, opts?: RequestOpts): Promise<ArticleCard[]> {
  return getList<Raw>(`/articles${search({ ...query })}`, opts).then(rows =>
    rows.map(mapArticleCard),
  );
}

/**
 * One published article, or `null`.
 *
 * A draft is a `404` upstream and therefore indistinguishable from a slug that was never used —
 * deliberately, so an anonymous visitor can't discover that a slug is spoken for. Both read as
 * "no such article" here, which is the honest thing for the page to say.
 */
export function article(slug: string, opts?: RequestOpts): Promise<ArticleRecord | null> {
  return getOne<Raw>(`/articles/${encodeURIComponent(slug)}`, opts).then(raw =>
    raw === null ? null : mapRecord(raw),
  );
}

// ----------------------------------------------------------- content endpoints

export interface ManageQuery extends ArticleQuery {
  /** `all` is the default — the writers' list shows drafts alongside posts. */
  status?: "all" | "published" | "draft";
}

/**
 * The writers' list. **The only read that returns drafts**, and the only one ordered by
 * `updatedAt` rather than `publishedAt` — a draft has no publish date, and "what I was last
 * working on" is the useful order for an editor.
 */
export function manageArticles(
  query: ManageQuery = {},
  opts?: RequestOpts,
): Promise<ArticleRecord[]> {
  return credentialedRequest(`/articles/manage${search({ ...query })}`, {}, opts).then(raw =>
    Array.isArray(raw) ? raw.map(mapRecord) : [],
  );
}

/** Creates an article. Rejects with a `409` `ApiError` when the slug is taken. */
export function createArticle(input: ArticleCreate, opts?: RequestOpts): Promise<ArticleRecord> {
  return credentialedRequest("/articles", { method: "POST", body: input }, opts).then(mapRecord);
}

export function updateArticle(
  slug: string,
  changes: ArticleUpdate,
  opts?: RequestOpts,
): Promise<ArticleRecord> {
  return credentialedRequest(
    `/articles/${encodeURIComponent(slug)}`,
    { method: "PATCH", body: changes },
    opts,
  ).then(mapRecord);
}

export function deleteArticle(slug: string, opts?: RequestOpts): Promise<boolean> {
  return credentialedRequest(
    `/articles/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
    opts,
  ).then(raw => asRaw(raw).success === true);
}

/** Namespaced for call sites that want the surface in one object. */
export const articlesApi = {
  articles,
  article,
  manageArticles,
  createArticle,
  updateArticle,
  deleteArticle,
};
