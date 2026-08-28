/**
 * The home page's own two reads — `GET /home` and `GET /home/live`.
 *
 * Two endpoints rather than one, and the split is the whole design: `/home` carries the banner,
 * the article rail and the social feed at `max-age=300`, while `/home/live` carries the Twitch
 * check at `max-age=30`. Bundling them would pull everything down to the live TTL for the sake of
 * one badge. `lib/queries.ts` mirrors both numbers, so the client caches for exactly as long as
 * the server says it may.
 *
 * Both are **public and session-independent** — no drafts, no unpublished anything — which is what
 * lets them be `Cache-Control: public`. They go through `./http` rather than `./credentialed` for
 * that reason. Anything signed-in belongs on a different route, per the note upstream.
 *
 * Every source behind `/home` **fails soft**: a dead YouTube or X bridge serves the last good copy,
 * and with nothing cached the field is simply empty. So an empty `feed` means "nothing to show",
 * never "something broke", and nothing here should render a failure state for one. The upstream
 * consequence is that a misconfigured source is invisible in production — it looks like a quiet
 * week — which is a server-side problem (`npm run home-smoke`) and not one the client can detect.
 */

import { getOne, type RequestOpts } from "./http";
import { httpsUrl } from "./normalize";

// ---------------------------------------------------------------------- types

/** Banner severity. `info` is the default upstream. */
export const ANNOUNCEMENT_LEVELS = ["info", "warning", "critical"] as const;

export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number];

export function isAnnouncementLevel(v: unknown): v is AnnouncementLevel {
  return typeof v === "string" && (ANNOUNCEMENT_LEVELS as readonly string[]).includes(v);
}

/**
 * One home-page banner.
 *
 * The public read serves only the *current* one — the newest active row inside its window,
 * preferring a conf-specific banner over a site-wide one posted the same day. The full list,
 * retired rows included, is site-admin only and lives in `./announcements`.
 */
export interface Announcement {
  id: number;
  message: string;
  level: AnnouncementLevel;
  linkUrl: string | null;
  linkLabel: string | null;
  /** `null` means site-wide. */
  conf: string | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  /** `profiles.id` of the last editor. Not resolved to a name by this endpoint. */
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** What an article looks like on a home page or an index — the list projection, no body. */
export const ARTICLE_KINDS = ["link", "native"] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

/**
 * The home page's layout slot, newest-first within each.
 *
 * Not a category — `tag` is that. Deliberately not unique upstream: several rows may be `hero`
 * and the newest wins, so promoting an article is one write rather than a demote-then-promote
 * pair. Choosing between them is this client's job — see `lib/articleTiers.ts`.
 */
export const ARTICLE_TYPES = ["hero", "feature", "news"] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export function isArticleType(v: unknown): v is ArticleType {
  return typeof v === "string" && (ARTICLE_TYPES as readonly string[]).includes(v);
}

export interface ArticleCard {
  slug: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  imageUrl: string | null;
  /**
   * Where the article lives: the external URL for a link article, and `null` for a native one,
   * where the site routes by `slug` and only the frontend knows the path. Don't read this to
   * decide which — read `kind`, which says so directly.
   */
  url: string | null;
  kind: ArticleKind;
  tag: string | null;
  conf: string | null;
  publishedAt: string | null;
  articleType: ArticleType;
}

/** One item in the merged YouTube/X rail. */
export interface FeedItem {
  id: string;
  /**
   * Left a plain string rather than a union.
   *
   * The doc names YouTube and X, but X is read through a third-party RSS bridge whose whole URL is
   * the config — swapping providers, or adding a third source, is a config change upstream and not
   * a deploy. A union here would turn that into a client bug: the rail drops rows it can't name.
   * It renders an unknown source with a generic icon instead.
   */
  source: string;
  title: string;
  url: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  author: string | null;
}

export interface HomePayload {
  /** `null` when no banner is active. */
  announcement: Announcement | null;
  articles: ArticleCard[];
  feed: FeedItem[];
  /**
   * Whether **anybody** is taking team applications — and the only signed-out signal there is.
   *
   * `GET /tournaments/applications/open` sits behind `auth`, so before this the nav could not know
   * until a visitor signed in, and its call to action had to say "join" when it could have said "we
   * are recruiting right now". A bare boolean, not a count and not the list: the conference *names*
   * stay behind auth, because a conference taking applications is deliberately hidden.
   *
   * Site-wide operational state like the banner beside it, and **not narrowed by `?conf=`** — a
   * hidden conference appears in no conf-scoped view anyway.
   */
  applicationsOpen: boolean;
}

/** The featured Twitch stream. When both channels are live, upstream features the busier one. */
export interface LiveStream {
  login: string;
  displayName: string;
  title: string;
  gameName: string;
  viewers: number;
  startedAt: string | null;
  thumbnailUrl: string | null;
  url: string;
}

// ----------------------------------------------------------------- normalizing

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function mapAnnouncement(raw: unknown): Announcement {
  const a = asRaw(raw);
  return {
    id: int(a.id),
    message: str(a.message),
    // An unrecognized level reads as `info` rather than being dropped. Unlike a league scope — where
    // an unknown value means a grant this build can't edit — the message is still the point, and
    // showing it in the default tone beats hiding a banner an admin deliberately posted.
    level: isAnnouncementLevel(a.level) ? a.level : "info",
    linkUrl: strOrNull(a.linkUrl),
    linkLabel: strOrNull(a.linkLabel),
    conf: strOrNull(a.conf),
    active: a.active !== false,
    startsAt: strOrNull(a.startsAt),
    endsAt: strOrNull(a.endsAt),
    updatedBy: typeof a.updatedBy === "number" ? a.updatedBy : null,
    createdAt: str(a.createdAt),
    updatedAt: str(a.updatedAt),
  };
}

/**
 * `imageUrl` goes through `httpsUrl` for the reason team logos do: the media host stores `http://`
 * and serves a 301 to https, but a browser blocks mixed content *before* following the redirect.
 */
export function mapArticleCard(raw: unknown): ArticleCard {
  const a = asRaw(raw);
  const kind: ArticleKind = a.kind === "native" ? "native" : "link";
  return {
    slug: str(a.slug),
    title: str(a.title),
    subtitle: strOrNull(a.subtitle),
    author: strOrNull(a.author),
    imageUrl: httpsUrl(strOrNull(a.imageUrl)) ?? null,
    url: strOrNull(a.url),
    kind,
    tag: strOrNull(a.tag),
    conf: strOrNull(a.conf),
    publishedAt: strOrNull(a.publishedAt),
    // Defaults to the small tier when the deployed API predates the column, which is also what the
    // column's own default is. `lib/articleTiers.ts` treats an all-`news` response as "not tiered
    // yet" and falls back to position, so the rail looks right either way.
    articleType: isArticleType(a.articleType) ? a.articleType : "news",
  };
}

function mapFeedItem(raw: unknown): FeedItem | null {
  const f = asRaw(raw);
  const url = strOrNull(f.url);
  // A row with no destination is not a rail item — it would render as an unclickable card.
  if (url === null) return null;
  return {
    id: str(f.id, url),
    source: str(f.source, "unknown"),
    title: str(f.title),
    url,
    publishedAt: strOrNull(f.publishedAt),
    thumbnailUrl: httpsUrl(strOrNull(f.thumbnailUrl)) ?? null,
    author: strOrNull(f.author),
  };
}

function mapStream(raw: unknown): LiveStream | null {
  const s = asRaw(raw);
  const login = strOrNull(s.login);
  if (login === null) return null;
  return {
    login,
    displayName: str(s.displayName, login),
    title: str(s.title),
    gameName: str(s.gameName),
    viewers: int(s.viewers),
    startedAt: strOrNull(s.startedAt),
    thumbnailUrl: httpsUrl(strOrNull(s.thumbnailUrl)) ?? null,
    url: str(s.url, `https://twitch.tv/${login}`),
  };
}

// ------------------------------------------------------------------ endpoints

export interface HomeQuery {
  /**
   * Optional, and it **widens rather than narrows**: passing one returns that conf's rows *plus*
   * the site-wide (`conf: null`) ones, because most news belongs to no single league.
   *
   * Not validated against `tournaments` upstream — that would cost a query on every page load to
   * distinguish two answers that are both "nothing to show" — so a junk value is an empty result
   * rather than a `400`.
   */
  conf?: string;
  limit?: number;
  feedLimit?: number;
}

function search(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * Banner, article rail and social feed in one call. Never rejects for an empty section.
 *
 * `revalidate` because this route is `Cache-Control: public, max-age=300` and it is the surface the
 * content editors write to. Without it, publishing an article invalidates the query, refetches, and
 * the browser answers from its own five-minute-old copy — so the writer's change is invisible on
 * the page they wrote it for. The ETag makes the revalidation a `304` whenever nothing moved.
 */
export function home(query: HomeQuery = {}, opts?: RequestOpts): Promise<HomePayload> {
  return getOne<Raw>(`/home${search({ ...query })}`, { ...opts, revalidate: true }).then(raw => {
    const p = asRaw(raw);
    return {
      announcement: p.announcement ? mapAnnouncement(p.announcement) : null,
      articles: Array.isArray(p.articles) ? p.articles.map(mapArticleCard) : [],
      feed: Array.isArray(p.feed) ? p.feed.flatMap(f => mapFeedItem(f) ?? []) : [],
      // Absent reads as closed, which is the safe direction: a deployment older than the field shows
      // no call to action rather than one that lands on "nothing is open right now".
      applicationsOpen: p.applicationsOpen === true,
    };
  });
}

/**
 * The featured stream, or `null`.
 *
 * The route is always mounted upstream, even with no Twitch credentials configured — "nobody is
 * streaming" and "we cannot ask" are the same answer to the page. So there is no deployment in
 * which this 404s, and no special case for one here.
 */
export function homeLive(opts?: RequestOpts): Promise<LiveStream | null> {
  return getOne<Raw>("/home/live", opts).then(raw => mapStream(asRaw(raw).stream));
}

/** Namespaced for call sites that want the surface in one object, like `api` and `auth`. */
export const homeApi = { home, homeLive };
