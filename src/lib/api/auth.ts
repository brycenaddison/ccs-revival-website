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
  name: string | null;
  puuids: string[];
}

/** Shape of `GET /auth/me`, which answers 200 for anonymous callers rather than 401. */
export interface Identity {
  authenticated: boolean;
  profile: SessionProfile | null;
  roles: string[];
}

export const ANONYMOUS: Identity = { authenticated: false, profile: null, roles: [] };

/**
 * Where the login control points.
 *
 * This must be used as a top-level navigation (`<a href>` or `location.assign`), never a
 * fetch. The browser has to follow the redirect chain to Discord's consent screen, and the
 * `oauth_state` cookie the callback validates against is only set on a document request.
 */
export const loginUrl = (): string => `${API_BASE}/auth/discord/login`;

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
    profile: data.profile ?? null,
    roles: Array.isArray(data.roles) ? data.roles : [],
  };
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
export const auth = { loginUrl, me, logout, logoutAll };
