/**
 * Auth transport for the CCS API.
 *
 * Deliberately separate from `./http` rather than a flag on it, because the two transports
 * are mutually incompatible at the CORS layer:
 *
 *  - The session is an httpOnly cookie, so these calls need `credentials: "include"`.
 *  - Upstream mounts `/auth` behind `cors({ origin: WEB_ORIGIN, credentials: true })` but
 *    leaves every other route on a wildcard `cors()`. A wildcard `Access-Control-Allow-Origin`
 *    is illegal on a credentialed request — the browser discards the response. So sending
 *    credentials on the *data* endpoints would break them.
 *
 * Absence is handled the way `./http` handles it: a deployment with OAuth unconfigured never
 * mounts the /auth router at all, so a 404 means "no auth here", not a failure.
 */

import { API_BASE, ApiError, type RequestOpts } from "./http";

export interface SessionProfile {
  id: number;
  /** Discord snowflake, as a string — it exceeds Number.MAX_SAFE_INTEGER. */
  snowflake: string;
  /**
   * The site's own name for the player, not a Discord field. Seeded from Discord when the profile
   * was created and owned by the row from then on — signing in again never rewrites it.
   */
  name: string | null;
  /** Explicit public name; `name` remains the API's compatibility alias. */
  nickname: string | null;
  /** Public player-owned presentation fields. */
  pronouns: string | null;
  pronunciation: string | null;
  /** New Discord profiles stay behind `/setup` until their presentation document is saved. */
  setupRequired: boolean;
  /**
   * The Discord `@` handle. Unlike `name` this *is* a cache, refreshed on every login, so it is
   * null for anyone who hasn't signed in since upstream added the column. There is no backfill.
   */
  handle: string | null;
  /**
   * A finished CDN url, not the hash the profile row holds — upstream applies the numbered-default
   * fallback and picks `.gif` for animated avatars (`utils/discordAvatar.ts`), so this is never
   * null from a current deployment and a client must not reimplement either rule.
   */
  avatar: string | null;
  puuids: string[];
}

/**
 * A conf the signed-in profile can administer.
 *
 * `name` is carried rather than looked up, so a conf the site hasn't loaded — or no longer lists —
 * still renders with a label instead of a bare id.
 */
export interface AdminLeague {
  conf: string;
  name: string;
}

/** Shape of `GET /auth/me`, which answers 200 for anonymous callers rather than 401. */
export interface Identity {
  authenticated: boolean;
  profile: SessionProfile | null;
  roles: string[];
  /**
   * Confs this profile administers directly.
   *
   * Empty for a site admin, whose access is implied by the role rather than enumerated — see
   * `lib/adminAccess.ts`, which is where the two are reconciled.
   */
  leagues: AdminLeague[];
}

/**
 * Site admin. Implies league admin everywhere, and satisfies every other role's guard.
 *
 * The only one that is **not assignable through the API** — `ASSIGNABLE_ROLES` omits it upstream and
 * `setRoles` preserves one already on a row, so the role editor can neither grant nor revoke it.
 * Every route that hands out authority is reachable by an admin, so an assignable one would let a
 * single compromised session mint a permanent second. It is granted by hand-written SQL.
 */
export const SITE_ADMIN_ROLE = "admin";

/**
 * Article CRUD, drafts included — the writers' portal at `/content`.
 *
 * A site admin satisfies this too, and the check is an explicit OR at every call site rather than a
 * hierarchy baked into `hasRole`. That mirrors the API, whose guard builder has no implicit ranking:
 * a route that wants an admin to pass has to say so. `content` says so, on the reasoning that an
 * admin could grant themselves the role in one request anyway.
 */
export const CONTENT_ROLE = "content";

export const ANONYMOUS: Identity = { authenticated: false, profile: null, roles: [], leagues: [] };

/**
 * Where the login control points.
 *
 * This must be used as a top-level navigation (`<a href>` or `location.assign`), never a
 * fetch. The browser has to follow the redirect chain to Discord's consent screen, and the
 * `oauth_state` cookie the callback validates against is only set on a document request.
 */
export const loginUrl = (): string => `${API_BASE}/auth/discord/login`;

/**
 * Where the Riot-link popup goes.
 *
 * Must be opened as a popup, not fetched: a popup is a top-level navigation, so the `SameSite=Lax`
 * session cookie rides along — which is why this flow needs no cookie-policy loosening. The
 * endpoint 404s on a deployment without RSO configured, and cross-origin that is indistinguishable
 * from the user closing the window.
 */
export const riotLinkUrl = (): string => `${API_BASE}/auth/riot/login`;

/** Every outcome the Riot callback reports. Only the first three are successes. */
export type RiotLinkStatus =
  | "linked"
  | "already_linked"
  | "merged"
  | "invalid_state"
  | "denied"
  | "bad_request"
  | "no_profile"
  | "bad_gateway"
  | "error";

/** What the callback page posts to `window.opener` before closing itself. */
export interface RiotLinkMessage {
  source: typeof RIOT_LINK_SOURCE;
  ok: boolean;
  status: RiotLinkStatus;
  puuid?: string | null;
  riotId?: string | null;
  /** True when another profile owned the puuid and was absorbed into this one. */
  merged?: boolean;
  error?: string | null;
}

const RIOT_LINK_SOURCE = "ccs-riot-link";

/**
 * The origin the popup posts from.
 *
 * The callback page is served by the API, so its message arrives stamped with the *API's* origin —
 * `WEB_ORIGIN` is only the target it aims at. Anything from another origin is somebody else's
 * message and is discarded.
 */
const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
})();

/** Narrows a `message` event to a trustworthy Riot-link result. */
export function isRiotLinkMessage(e: MessageEvent): e is MessageEvent<RiotLinkMessage> {
  if (e.origin !== API_ORIGIN) return false;
  const data: unknown = e.data;
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === RIOT_LINK_SOURCE
  );
}

function authFetch(path: string, init: RequestInit = {}, opts?: RequestOpts): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", ...init.headers },
    signal: opts?.signal,
  });
}

/**
 * The current session.
 *
 * Resolves to `ANONYMOUS` for every flavour of "not logged in" — a 401, or a 404 from a
 * deployment where the /auth router was never mounted. Only a genuine server or network
 * fault rejects, so callers can treat a rejection as an error worth showing.
 */
export async function me(opts?: RequestOpts): Promise<Identity> {
  const res = await authFetch("/auth/me", {}, opts);
  if (res.status === 401 || res.status === 404) return ANONYMOUS;

  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, "/auth/me", text.slice(0, 300) || res.statusText);

  let data: Partial<Identity>;
  try {
    data = JSON.parse(text) as Partial<Identity>;
  } catch {
    throw new ApiError(res.status, "/auth/me", `expected JSON, got: ${text.slice(0, 120)}`);
  }

  return {
    authenticated: data.authenticated === true,
    profile: normalizeProfile(data.profile),
    roles: Array.isArray(data.roles) ? data.roles : [],
    leagues: normalizeLeagues(data.leagues),
  };
}

/**
 * Coerces the `profile` object into the declared shape.
 *
 * The body used to be passed through as-is, which was survivable while every field was rendered as
 * text. `avatar` ends the tolerance: a deployment predating the field would put `undefined` into an
 * `<img src>`, and a broken-image glyph is worse than no picture. Each nullable field reads as
 * `null` when absent, so a component can branch on absence rather than on a value that lies about
 * its type.
 */
function normalizeProfile(value: unknown): SessionProfile | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

  return {
    id: typeof raw.id === "number" && Number.isFinite(raw.id) ? raw.id : 0,
    snowflake: str(raw.snowflake) ?? "",
    name: str(raw.name),
    nickname: str(raw.nickname) ?? str(raw.name),
    pronouns: str(raw.pronouns),
    pronunciation: str(raw.pronunciation),
    setupRequired: raw.setupRequired === true,
    handle: str(raw.handle),
    avatar: str(raw.avatar),
    puuids: Array.isArray(raw.puuids) ? raw.puuids.filter((p): p is string => typeof p === "string") : [],
  };
}

/**
 * Coerces the `leagues` field into a usable array.
 *
 * Defensive to the same degree as `roles`, and for a live reason: a deployment that hasn't shipped
 * the field yet omits it, and every consumer maps over it. Absent has to read as "administers
 * nothing", never `undefined`. An entry without a `conf` is unusable, so it's dropped rather than
 * rendered as a league you can't open.
 */
function normalizeLeagues(value: unknown): AdminLeague[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { conf, name } = entry as { conf?: unknown; name?: unknown };
    if (typeof conf !== "string" || conf === "") return [];
    return [{ conf, name: typeof name === "string" && name !== "" ? name : conf }];
  });
}

/**
 * Ends this session. Best-effort by design: the server clears the cookie and returns 204,
 * but if the call fails the caller still drops local state — a client that thinks it is
 * logged in when the server disagrees is the worse failure.
 */
export async function logout(opts?: RequestOpts): Promise<void> {
  await authFetch("/auth/logout", { method: "POST" }, opts);
}

/** Ends every session for this profile, on all devices. Requires a valid session. */
export async function logoutAll(opts?: RequestOpts): Promise<void> {
  await authFetch("/auth/logout-all", { method: "POST" }, opts);
}

/** Namespaced so `logout`/`me` don't collide with the same names in consuming components. */
export const auth = { loginUrl, riotLinkUrl, isRiotLinkMessage, me, logout, logoutAll };
