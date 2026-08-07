/**
 * The site-admin write surface: `/admin/leagues` and `/admin/users`.
 *
 * The transport is `./credentialed` — shared with the season editors, and the file to read for why
 * these calls carry cookies and a JSON content type when `./http` must not. Nothing under `/admin`
 * returns a `422`, so nothing here handles `SaveRejected`; the guards' JSON envelope and the
 * plain-text param errors both land in `ApiError.detail`, which is the string the page shows.
 *
 * Every route here is site-admin only. There is no client-side check for that — `RequireAuth` gates
 * the page, and the API is the authority regardless.
 */

import { mapTournament } from "./client";
import { credentialedRequest } from "./credentialed";
import { ApiError, type RequestOpts } from "./http";
import type { Tournament } from "./types";

// ---------------------------------------------------------------------- types

/**
 * Every scope a league grant may carry, mirroring `LEAGUE_SCOPES` upstream.
 *
 * `admin` implies the other three **within its own conf**. Granular grants are separate rows because
 * `league_admins` is keyed by scope, which is why the editor offers all four.
 */
export const LEAGUE_SCOPES = ["admin", "schedule", "roster", "stats"] as const;

export type LeagueScope = (typeof LEAGUE_SCOPES)[number];

/** The scope that implies all the others. */
export const LEAGUE_ADMIN_SCOPE: LeagueScope = "admin";

export function isLeagueScope(value: unknown): value is LeagueScope {
  return typeof value === "string" && (LEAGUE_SCOPES as readonly string[]).includes(value);
}

/** Site-wide roles the admin API may grant. `admin` is deliberately absent and remains SQL-only. */
export const ASSIGNABLE_SITE_ROLES = ["content", "viewer"] as const;

export type AssignableSiteRole = (typeof ASSIGNABLE_SITE_ROLES)[number];

export function isAssignableSiteRole(value: unknown): value is AssignableSiteRole {
  return (
    typeof value === "string" &&
    (ASSIGNABLE_SITE_ROLES as readonly string[]).includes(value)
  );
}

/** One `league_admins` row, joined to the conf's display name. */
export interface LeagueGrant {
  conf: string;
  name: string;
  scope: LeagueScope;
}

/**
 * A profile as the admin directory sees it.
 *
 * `avatar` is never null — with no hash upstream resolves the Discord default from the snowflake —
 * so there is no fallback to write here. `handle` *is* often null: it has been cached at login
 * since the column was added and was never backfilled, so anyone who hasn't signed in since has
 * none.
 */
export interface DirectoryUser {
  profileId: number;
  /** Discord snowflake, as a string — it exceeds Number.MAX_SAFE_INTEGER. */
  snowflake: string;
  name: string | null;
  handle: string | null;
  avatar: string;
  /** Site-wide roles. `content` and `viewer` are assignable; `admin` remains hand-written SQL. */
  roles: string[];
  leagues: LeagueGrant[];
  /** How many Riot accounts are linked. */
  accounts: number;
  /** ISO timestamp of the newest session, or null if they have never signed in. */
  lastLogin: string | null;
}

export interface DirectoryPage {
  /** Unpaginated total, so the page can render "1–50 of 128" without asking twice. */
  total: number;
  limit: number;
  offset: number;
  users: DirectoryUser[];
}

export interface LeagueCreate {
  conf: string;
  name: string;
  shortname?: string;
  active?: boolean;
}

/**
 * A subset of a league's metadata. An absent key leaves that field alone; an explicit `null`
 * shortname clears it. Sending none of the three is a `400` upstream.
 */
export interface LeagueEdit {
  name?: string;
  shortname?: string | null;
  active?: boolean;
}

/** What upstream accepts as a conf: `varchar(3)`, and every existing one is lowercase. */
export const CONF_PATTERN = /^[a-z0-9]{1,3}$/;

/** Database column widths, enforced upstream. Mirrored so a field can cap its own input. */
export const NAME_MAX = 255;
export const SHORTNAME_MAX = 16;

// ------------------------------------------------------------------ transport

/** Named locally so the call sites below still read as what they are. */
const adminRequest = credentialedRequest;

// ----------------------------------------------------------------- normalizing

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const mapRoles = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((role): role is string => typeof role === "string") : [];

/**
 * Grants are dropped rather than repaired when the scope is unrecognised.
 *
 * The vocabulary is coupled to a CHECK constraint upstream, so a scope this build doesn't know is
 * a deploy skew — rendering it as an unlabelled checkbox that PUT would then reject is worse than
 * not showing it. Upstream warns about the same case in `toGrants`.
 */
function mapGrants(v: unknown): LeagueGrant[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((entry: unknown) => {
    const g = asRaw(entry);
    if (typeof g.conf !== "string" || g.conf === "" || !isLeagueScope(g.scope)) return [];
    return [{ conf: g.conf, name: typeof g.name === "string" && g.name !== "" ? g.name : g.conf, scope: g.scope }];
  });
}

function mapUser(raw: unknown): DirectoryUser {
  const u = asRaw(raw);
  return {
    profileId: int(u.profileId),
    snowflake: typeof u.snowflake === "string" ? u.snowflake : String(u.snowflake ?? ""),
    name: strOrNull(u.name),
    handle: strOrNull(u.handle),
    avatar: typeof u.avatar === "string" ? u.avatar : "",
    roles: mapRoles(u.roles),
    leagues: mapGrants(u.leagues),
    accounts: int(u.accounts),
    lastLogin: strOrNull(u.lastLogin),
  };
}

// ------------------------------------------------------------------ endpoints

export interface UserSearch {
  /** Matches name and Discord handle case-insensitively; an all-digit term matches the snowflake exactly. */
  q?: string;
  /** Defaults to 50 upstream and is clamped to 200. */
  limit?: number;
  offset?: number;
}

/**
 * The directory behind the search bar. Lists **only profiles with a Discord account**, because
 * only those can hold a role.
 *
 * `limit` and `offset` echo back from the server after clamping, so the pager reads them from the
 * response rather than from what it asked for.
 */
export function searchUsers(params: UserSearch = {}, opts?: RequestOpts): Promise<DirectoryPage> {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const search = q.toString();

  return adminRequest(`/admin/users${search ? `?${search}` : ""}`, {}, opts).then(raw => {
    const page = asRaw(raw);
    const users = Array.isArray(page.users) ? page.users.map(mapUser) : [];
    return {
      total: int(page.total, users.length),
      limit: int(page.limit, params.limit ?? users.length),
      offset: int(page.offset, params.offset ?? 0),
      users,
    };
  });
}

/**
 * One user, kept fresh independently of the list they were picked from.
 *
 * `null` for a profile that does not exist — and, indistinguishably, for a deployment where the
 * `/admin` router was never mounted, since it is only registered when Discord OAuth is configured.
 * Both mean "nothing to edit here", and the page is unreachable without a session anyway.
 */
export function adminUser(profileId: number, opts?: RequestOpts): Promise<DirectoryUser | null> {
  return adminRequest(`/admin/users/${profileId}`, {}, opts)
    .then(mapUser)
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
}

/**
 * Sets every API-assignable site role on a profile. The server preserves an existing `admin` role,
 * so this editor can neither grant nor accidentally revoke the SQL-only authority above it.
 */
export function setSiteRoles(
  profileId: number,
  roles: readonly AssignableSiteRole[],
  opts?: RequestOpts,
): Promise<string[]> {
  return adminRequest(
    `/admin/users/${profileId}/roles`,
    { method: "PUT", body: { roles } },
    opts,
  ).then(raw => mapRoles(asRaw(raw).roles));
}

/**
 * Sets the profile's scopes in one conf. **Set semantics, not a patch** — the body is the complete
 * list, and `[]` revokes. Idempotent: a scope already held keeps its original `granted_at`.
 *
 * Answers with the profile's full grant list afterwards, across every conf.
 */
export function setLeagueScopes(
  profileId: number,
  conf: string,
  scopes: readonly LeagueScope[],
  opts?: RequestOpts,
): Promise<LeagueGrant[]> {
  return adminRequest(
    `/admin/users/${profileId}/leagues/${encodeURIComponent(conf)}`,
    { method: "PUT", body: { scopes } },
    opts,
  ).then(raw => mapGrants(asRaw(raw).leagues));
}

/** Revokes every scope in one conf. Not an error when there was nothing to remove. */
export function revokeLeague(
  profileId: number,
  conf: string,
  opts?: RequestOpts,
): Promise<LeagueGrant[]> {
  return adminRequest(
    `/admin/users/${profileId}/leagues/${encodeURIComponent(conf)}`,
    { method: "DELETE" },
    opts,
  ).then(raw => mapGrants(asRaw(raw).leagues));
}

/**
 * Creates a league. Rejects with a `409` `ApiError` when the conf is taken.
 *
 * A new league starts with an empty `layout` — the per-week best-of structure belongs to the
 * season config rather than a metadata editor, and this endpoint does not accept it.
 */
export function createLeague(input: LeagueCreate, opts?: RequestOpts): Promise<Tournament> {
  return adminRequest("/admin/leagues", { method: "POST", body: input }, opts).then(mapTournament);
}

/**
 * Updates a league's metadata. `conf` is not editable: it is the primary key, and `matchlist`,
 * `teams`, `forfeits`, `league_admins` and the stats views all reference it by value.
 */
export function updateLeague(
  conf: string,
  changes: LeagueEdit,
  opts?: RequestOpts,
): Promise<Tournament> {
  return adminRequest(
    `/admin/leagues/${encodeURIComponent(conf)}`,
    { method: "PATCH", body: changes },
    opts,
  ).then(mapTournament);
}

/** Namespaced for call sites that want the surface in one object, like `api` and `auth`. */
export const adminApi = {
  searchUsers,
  adminUser,
  setSiteRoles,
  setLeagueScopes,
  revokeLeague,
  createLeague,
  updateLeague,
};
