/**
 * Team Discord roles and channels: the conference status read, provisioning, the staff-role
 * setting, role membership resync, esubs and end-of-season teardown.
 *
 * Upstream behavior worth knowing:
 *
 *  - Every route is session-scoped and answers no-store. `roster` staff read, provision and grant
 *    esubs; the staff-role setting and teardown need the league `admin` scope.
 *  - The status read always answers. Without Discord it serves the recorded objects with
 *    `available: false`, and `exists`, drift and preflight are then unknown rather than clean.
 *  - Once the conference category exists, a background worker keeps every team in step with roster,
 *    name, code, color and logo changes. Roster writes already enqueue their own sync.
 *  - Provision preflights the whole request and answers `409 not_ready` with every blocker before
 *    any Discord write. Its outcomes are per team, and an unfinished team is queued for the worker.
 *  - Repeated provision updates recorded resources in place. Membership resync only reconciles
 *    existing roles; missing roles require provision. Membership and resource retries are separate.
 *  - Uncertain resource diagnostics require inspection; absence is only confirmed by an exact read.
 *  - The bot only removes the role from people it recorded granting it to, so a role given by hand
 *    in Discord never appears as a member here.
 *  - A role holder is named by the saved profile with their Discord account, otherwise by their
 *    server username. Neither is guaranteed: an esub granted with `/esub` usually has no profile,
 *    and without Discord a holder with no profile has no handle.
 *  - Staff roles are saved as Discord role ids. The status read names them from the server (null
 *    when a role has gone or Discord is unavailable) and lists the roles a picker can offer, which
 *    leave out `@everyone`, integration-managed roles and this conference's team roles.
 *  - The per-person warnings `no_discord_account` and `not_in_guild` list the roster profiles
 *    concerned. An esub not in the server is counted in the message but has no profile to list.
 *  - Writes answer `503` while Discord is not connected; nothing was changed.
 */

import { credentialedRequest } from "./credentialed";
import { ApiError, type RequestOpts } from "./http";
import { mapPlayerSummary, type PlayerSummary } from "./playerSummary";

// ---------------------------------------------------------------------------------- constraints

/** A Discord user or role id. Kept as a string: snowflakes exceed `Number.MAX_SAFE_INTEGER`. */
export const DISCORD_SNOWFLAKE = /^\d{17,20}$/;
/** Matches `league_discord_settings_staff_roles_check`. */
export const TEAM_DISCORD_STAFF_ROLES_MAX = 10;
/** An esub lasts 1 to 60 days, or until removed. */
export const ESUB_DAYS_MIN = 1;
export const ESUB_DAYS_MAX = 60;

export const TEAM_DISCORD_RESOURCE_KINDS = [
  "category", "voice_category", "archive_category", "role", "text", "voice",
] as const;
export type TeamDiscordResourceKind = (typeof TEAM_DISCORD_RESOURCE_KINDS)[number];

export const TEAM_DISCORD_RESOURCE_STATUSES = ["pending", "created", "archived"] as const;
export type TeamDiscordResourceStatus = (typeof TEAM_DISCORD_RESOURCE_STATUSES)[number];

export const TEAM_DISCORD_MEMBER_SOURCES = ["roster", "esub"] as const;
export type TeamDiscordMemberSource = (typeof TEAM_DISCORD_MEMBER_SOURCES)[number];

/** What the next sync would change on one team. */
export const TEAM_DISCORD_DRIFT = [
  "role_missing", "role_name", "role_color", "role_icon",
  "text_missing", "text_name", "text_parent", "text_permissions",
  "voice_missing", "voice_name", "voice_parent", "voice_permissions",
] as const;
export type TeamDiscordDrift = (typeof TEAM_DISCORD_DRIFT)[number];

export const TEAM_DISCORD_PROVISION_STATUSES = ["provisioned", "in_progress", "queued", "failed"] as const;
export type TeamDiscordProvisionStatus = (typeof TEAM_DISCORD_PROVISION_STATUSES)[number];

export const TEAM_DISCORD_ROLE_RESYNC_STATUSES = ["synced", "queued", "in_progress", "failed", "not_provisioned"] as const;
export type TeamDiscordRoleResyncStatus = (typeof TEAM_DISCORD_ROLE_RESYNC_STATUSES)[number];

export const TEAM_DISCORD_RESOURCE_DIAGNOSTICS = ["present", "missing", "uncertain", "pending"] as const;
export type TeamDiscordResourceDiagnostic = (typeof TEAM_DISCORD_RESOURCE_DIAGNOSTICS)[number];

export const TEAM_DISCORD_TEARDOWN_MODES = ["archive", "delete"] as const;
export type TeamDiscordTeardownMode = (typeof TEAM_DISCORD_TEARDOWN_MODES)[number];

export const TEAM_DISCORD_TEARDOWN_RESULTS = ["deleted", "gone", "archived", "released", "failed"] as const;
export type TeamDiscordTeardownResult = (typeof TEAM_DISCORD_TEARDOWN_RESULTS)[number];

// ---------------------------------------------------------------------------------------- types

/** A Discord object the bot recorded creating. */
export interface TeamDiscordResource {
  id: number;
  kind: TeamDiscordResourceKind;
  status: TeamDiscordResourceStatus;
  /** Null while a create is pending. */
  snowflake: string | null;
  /** Whether the object is still in Discord; null when Discord could not be asked. */
  exists: boolean | null;
  diagnostic: TeamDiscordResourceDiagnostic | null;
}

/** One preflight blocker or warning. `message` is written to be shown. */
export interface TeamDiscordIssue {
  code: string;
  message: string;
  teamId: number | null;
  /** The roster profiles a per-person warning concerns; empty otherwise. */
  profileIds: number[];
}

/** Someone the bot gave a team role to, and why. One person appears once per source. */
export interface TeamDiscordMember {
  snowflake: string;
  source: TeamDiscordMemberSource;
  /** Null for a roster grant and an esub without an end. */
  expiresAt: string | null;
  /** The profile that granted an esub. */
  grantedBy: number | null;
  grantedAt: string | null;
  /** The saved profile with this Discord account. */
  profile: PlayerSummary | null;
  /** The profile's saved Discord username, otherwise the server member's. */
  handle: string | null;
  /** The profile behind `grantedBy`. */
  grantedByProfile: PlayerSummary | null;
}

/** A saved staff role. `name` and `color` are null when the role has gone or Discord is unavailable. */
export interface TeamDiscordStaffRole {
  id: string;
  name: string | null;
  /** RGB integer; 0 means no color. */
  color: number | null;
}

/** A server role a staff-role picker can offer. */
export interface TeamDiscordRoleOption {
  id: string;
  name: string;
  /** RGB integer; 0 means no color. */
  color: number;
}

export interface TeamDiscordQueued {
  attempts: number;
  retryAt: string | null;
  lastError: string | null;
  membership: boolean | null;
  resources: boolean | null;
}

export interface TeamDiscordTeam {
  teamId: number;
  code: string;
  name: string;
  role: TeamDiscordResource | null;
  text: TeamDiscordResource | null;
  voice: TeamDiscordResource | null;
  drift: TeamDiscordDrift[];
  warnings: TeamDiscordIssue[];
  members: TeamDiscordMember[];
  queued: TeamDiscordQueued | null;
}

export interface TeamDiscordPreflight {
  blockers: TeamDiscordIssue[];
  warnings: TeamDiscordIssue[];
}

export interface TeamDiscordStatus {
  conf: string;
  /** Discord answered; drift and preflight are only computed when true. */
  available: boolean;
  /** The conference has a live category, so the worker keeps its teams in step. */
  provisioned: boolean;
  staffRoleIds: string[];
  /** One per `staffRoleIds` id, in the same order. */
  staffRoles: TeamDiscordStaffRole[];
  /** Highest first. Empty when Discord is unavailable. */
  assignableRoles: TeamDiscordRoleOption[];
  categories: TeamDiscordResource[];
  /** In served order. */
  teams: TeamDiscordTeam[];
  /** Recorded objects whose team was deleted or moved conference. Teardown removes them. */
  orphans: TeamDiscordResource[];
  /** Null when Discord was unavailable. */
  preflight: TeamDiscordPreflight | null;
  teardown: { remove: number; archive: number; pending: number };
  queue: { depth: number };
  cleanupIssues: TeamDiscordIssue[];
}

export interface TeamDiscordProvisionTeam {
  teamId: number;
  code: string;
  name: string;
  status: TeamDiscordProvisionStatus | null;
  created: TeamDiscordResourceKind[];
  granted: number | null;
  revoked: number | null;
  membershipError: string | null;
  resourceError: string | null;
  warnings: TeamDiscordIssue[];
  error: string | null;
}

export interface TeamDiscordProvisionReport {
  warnings: TeamDiscordIssue[];
  teams: TeamDiscordProvisionTeam[];
}

export interface TeamDiscordRoleResyncTeam {
  teamId: number;
  code: string;
  name: string;
  status: TeamDiscordRoleResyncStatus | null;
  granted: number | null;
  revoked: number | null;
  warnings: TeamDiscordIssue[];
  error: string | null;
}

export interface TeamDiscordRoleResyncReport {
  warnings: TeamDiscordIssue[];
  teams: TeamDiscordRoleResyncTeam[];
}

export interface TeamDiscordEsub {
  snowflake: string;
  expiresAt: string | null;
}

export interface TeamDiscordTeardownRow {
  id: number;
  kind: TeamDiscordResourceKind | null;
  teamId: number | null;
  snowflake: string | null;
  result: TeamDiscordTeardownResult | null;
  error: string | null;
}

export interface TeamDiscordTeardownReport {
  mode: TeamDiscordTeardownMode | null;
  results: TeamDiscordTeardownRow[];
}

/**
 * A `409` from these routes. Provision lists preflight issues; the staff-role save lists the role
 * ids it rejected.
 */
export interface TeamDiscordRefusal {
  status: string;
  error: string;
  issues: TeamDiscordIssue[];
  roleIds: string[];
}

// -------------------------------------------------------------------------------------- mapping

type Raw = Record<string, unknown>;
const raw = (value: unknown): Raw => value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
const string = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const integer = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const count = (value: unknown): number => Math.max(0, integer(value) ?? 0);
const countOrNull = (value: unknown): number | null => {
  const n = integer(value);
  return n !== null && n >= 0 ? n : null;
};
const snowflake = (value: unknown): string | null =>
  typeof value === "string" && DISCORD_SNOWFLAKE.test(value) ? value : null;
const rows = <T>(value: unknown, map: (value: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.flatMap(entry => { const mapped = map(entry); return mapped === null ? [] : [mapped]; }) : [];
const enumValue = <T extends string>(value: unknown, values: readonly T[]): T | null =>
  typeof value === "string" && values.includes(value as T) ? value as T : null;

function resourceOf(value: unknown): TeamDiscordResource | null {
  const r = raw(value);
  const id = integer(r.id);
  const kind = enumValue(r.kind, TEAM_DISCORD_RESOURCE_KINDS);
  const status = enumValue(r.status, TEAM_DISCORD_RESOURCE_STATUSES);
  if (id === null || !kind || !status) return null;
  return {
    id, kind, status,
    snowflake: snowflake(r.snowflake),
    exists: typeof r.exists === "boolean" ? r.exists : null,
    diagnostic: enumValue(r.diagnostic, TEAM_DISCORD_RESOURCE_DIAGNOSTICS),
  };
}

function issueOf(value: unknown): TeamDiscordIssue | null {
  const r = raw(value);
  const message = string(r.message);
  if (!message) return null;
  return {
    code: string(r.code) ?? "unknown",
    message,
    teamId: integer(r.teamId),
    profileIds: rows(r.profileIds, entry => { const id = integer(entry); return id !== null && id > 0 ? id : null; }),
  };
}

function memberOf(value: unknown): TeamDiscordMember | null {
  const r = raw(value);
  const id = snowflake(r.snowflake);
  const source = enumValue(r.source, TEAM_DISCORD_MEMBER_SOURCES);
  if (!id || !source) return null;
  return {
    snowflake: id,
    source,
    expiresAt: string(r.expiresAt),
    grantedBy: integer(r.grantedBy),
    grantedAt: string(r.grantedAt),
    profile: mapPlayerSummary(r.profile),
    handle: string(r.handle),
    grantedByProfile: mapPlayerSummary(r.grantedByProfile),
  };
}

function staffRoleOf(value: unknown): TeamDiscordStaffRole | null {
  const r = raw(value);
  const id = snowflake(r.id);
  if (!id) return null;
  const name = string(r.name);
  return { id, name, color: name === null ? null : integer(r.color) };
}

function roleOptionOf(value: unknown): TeamDiscordRoleOption | null {
  const r = raw(value);
  const id = snowflake(r.id);
  const name = string(r.name);
  if (!id || name === null) return null;
  return { id, name, color: integer(r.color) ?? 0 };
}

function queuedOf(value: unknown): TeamDiscordQueued | null {
  if (value == null) return null;
  const r = raw(value);
  return {
    attempts: count(r.attempts), retryAt: string(r.retryAt), lastError: string(r.lastError),
    membership: typeof r.membership === "boolean" ? r.membership : null,
    resources: typeof r.resources === "boolean" ? r.resources : null,
  };
}

function teamOf(value: unknown): TeamDiscordTeam | null {
  const r = raw(value);
  const teamId = integer(r.teamId);
  if (teamId === null) return null;
  return {
    teamId,
    code: string(r.code) ?? "",
    name: string(r.name) ?? "",
    role: resourceOf(r.role),
    text: resourceOf(r.text),
    voice: resourceOf(r.voice),
    drift: rows(r.drift, entry => enumValue(entry, TEAM_DISCORD_DRIFT)),
    warnings: rows(r.warnings, issueOf),
    members: rows(r.members, memberOf),
    queued: queuedOf(r.queued),
  };
}

function statusOf(value: unknown, conf: string): TeamDiscordStatus {
  const r = raw(value);
  const preflight = r.preflight == null ? null : raw(r.preflight);
  const teardown = raw(r.teardown);
  return {
    conf: string(r.conf) ?? conf,
    available: r.available === true,
    provisioned: r.provisioned === true,
    staffRoleIds: rows(r.staffRoleIds, snowflake),
    staffRoles: rows(r.staffRoles, staffRoleOf),
    assignableRoles: rows(r.assignableRoles, roleOptionOf),
    categories: rows(r.categories, resourceOf),
    teams: rows(r.teams, teamOf),
    orphans: rows(r.orphans, resourceOf),
    preflight: preflight && {
      blockers: rows(preflight.blockers, issueOf),
      warnings: rows(preflight.warnings, issueOf),
    },
    teardown: { remove: count(teardown.remove), archive: count(teardown.archive), pending: count(teardown.pending) },
    queue: { depth: count(raw(r.queue).depth) },
    cleanupIssues: rows(r.cleanupIssues, issueOf),
  };
}

function provisionTeamOf(value: unknown): TeamDiscordProvisionTeam | null {
  const r = raw(value);
  const teamId = integer(r.teamId);
  if (teamId === null) return null;
  return {
    teamId,
    code: string(r.code) ?? "",
    name: string(r.name) ?? "",
    status: enumValue(r.status, TEAM_DISCORD_PROVISION_STATUSES),
    created: rows(r.created, entry => enumValue(entry, TEAM_DISCORD_RESOURCE_KINDS)),
    granted: countOrNull(r.granted),
    revoked: countOrNull(r.revoked),
    membershipError: string(r.membershipError),
    resourceError: string(r.resourceError),
    warnings: rows(r.warnings, issueOf),
    error: string(r.error),
  };
}

function roleResyncTeamOf(value: unknown): TeamDiscordRoleResyncTeam | null {
  const r = raw(value);
  const teamId = integer(r.teamId);
  if (teamId === null) return null;
  return {
    teamId,
    code: string(r.code) ?? "",
    name: string(r.name) ?? "",
    status: enumValue(r.status, TEAM_DISCORD_ROLE_RESYNC_STATUSES),
    granted: countOrNull(r.granted),
    revoked: countOrNull(r.revoked),
    warnings: rows(r.warnings, issueOf),
    error: string(r.error),
  };
}

function teardownRowOf(value: unknown): TeamDiscordTeardownRow | null {
  const r = raw(value);
  const id = integer(r.id);
  if (id === null) return null;
  return {
    id,
    kind: enumValue(r.kind, TEAM_DISCORD_RESOURCE_KINDS),
    teamId: integer(r.teamId),
    snowflake: snowflake(r.snowflake),
    result: enumValue(r.result, TEAM_DISCORD_TEARDOWN_RESULTS),
    error: string(r.error),
  };
}

/** The refusal carried by a `409`, or null when the failure was something else. */
export function teamDiscordRefusal(error: unknown): TeamDiscordRefusal | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = raw(error.body);
  const status = string(body.status);
  if (!status) return null;
  const issues = Array.isArray(body.issues) ? body.issues : [];
  return {
    status,
    error: string(body.error) ?? error.detail,
    issues: rows(issues, entry => typeof entry === "string" ? null : issueOf(entry)),
    roleIds: rows(issues, snowflake),
  };
}

// ------------------------------------------------------------------------------------ endpoints

const forConf = (conf: string) => `/tournaments/${encodeURIComponent(conf)}/teams`;

export async function teamDiscordStatus(conf: string, opts?: RequestOpts): Promise<TeamDiscordStatus> {
  return statusOf(await credentialedRequest(`${forConf(conf)}/discord`, { cache: "no-store" }, opts), conf);
}

/** Without `teamIds`, every team in the conference is provisioned. */
export async function provisionTeamDiscord(
  conf: string, teamIds?: readonly number[], opts?: RequestOpts,
): Promise<TeamDiscordProvisionReport> {
  const r = raw(await credentialedRequest(
    `${forConf(conf)}/discord/provision`,
    { method: "POST", body: teamIds ? { teamIds } : {}, cache: "no-store" },
    opts,
  ));
  return { warnings: rows(r.warnings, issueOf), teams: rows(r.teams, provisionTeamOf) };
}

/** Reconciles membership on existing roles, without changing roles, channels or categories. */
export async function resyncTeamDiscordRoles(
  conf: string, teamIds?: readonly number[], opts?: RequestOpts,
): Promise<TeamDiscordRoleResyncReport> {
  const r = raw(await credentialedRequest(
    `${forConf(conf)}/discord/roles/resync`,
    { method: "POST", body: teamIds ? { teamIds } : {}, cache: "no-store" },
    opts,
  ));
  return { warnings: rows(r.warnings, issueOf), teams: rows(r.teams, roleResyncTeamOf) };
}

/** Replaces the whole list. In a provisioned conference the worker then re-permissions every channel. */
export async function saveTeamDiscordStaffRoles(
  conf: string, staffRoleIds: readonly string[], opts?: RequestOpts,
): Promise<string[]> {
  const r = raw(await credentialedRequest(
    `${forConf(conf)}/discord/settings`,
    { method: "PUT", body: { staffRoleIds }, cache: "no-store" },
    opts,
  ));
  return rows(r.staffRoleIds, snowflake);
}

/** `days` null keeps the role until removed. A second grant replaces the expiry. */
export async function grantEsub(
  conf: string, teamId: number, discordUserId: string, days: number | null, opts?: RequestOpts,
): Promise<TeamDiscordEsub> {
  const r = raw(await credentialedRequest(
    `${forConf(conf)}/${teamId}/discord/esubs`,
    { method: "POST", body: { snowflake: discordUserId, days }, cache: "no-store" },
    opts,
  ));
  const id = snowflake(r.snowflake);
  if (!id) throw new Error("The esub grant returned an invalid Discord account.");
  return { snowflake: id, expiresAt: string(r.expiresAt) };
}

/** Someone who is also on the roster keeps the role. */
export async function removeEsub(
  conf: string, teamId: number, discordUserId: string, opts?: RequestOpts,
): Promise<void> {
  await credentialedRequest(
    `${forConf(conf)}/${teamId}/discord/esubs/${encodeURIComponent(discordUserId)}`,
    { method: "DELETE", cache: "no-store" },
    opts,
  );
}

export interface TeamDiscordTeardownInput {
  /** What the person typed. Upstream refuses anything but the conference code, so send it as typed. */
  confirm: string;
  mode: TeamDiscordTeardownMode;
  /** Required while the conference is active. */
  force: boolean;
}

export async function teardownTeamDiscord(
  conf: string, { confirm, mode, force }: TeamDiscordTeardownInput, opts?: RequestOpts,
): Promise<TeamDiscordTeardownReport> {
  const r = raw(await credentialedRequest(
    `${forConf(conf)}/discord/teardown`,
    { method: "POST", body: { confirm, mode, ...(force ? { force } : {}) }, cache: "no-store" },
    opts,
  ));
  return {
    mode: enumValue(r.mode, TEAM_DISCORD_TEARDOWN_MODES),
    results: rows(r.results, teardownRowOf),
  };
}

/** Namespaced for parity with the other modules' aggregates. */
export const teamDiscordApi = {
  teamDiscordStatus, provisionTeamDiscord, resyncTeamDiscordRoles, saveTeamDiscordStaffRoles, grantEsub, removeEsub, teardownTeamDiscord,
};
