/**
 * The league-admin team write surface: create a team, edit one, and resolve roster players.
 *
 * The sibling API implements create/edit, Riot preview/acceptance and Discord selection.
 * Frontend contracts and remaining metadata requirements are in docs/player-picker-api.md.
 *
 * There is no read here on purpose. Public `GET /teams/:conf` already serves the whole editable row
 * — id, code, name, logo, both colors, owner, contacts, the five starters and the bench — and a
 * team only exists after publication, which is also what lists the conference. A second credentialed
 * projection of the same row would be one more thing to keep in step for no answer the public read
 * cannot give. `queries.teamsForConf` is the read; this file is the writes.
 *
 * Create and edit answer with the team row in exactly the shape `GET /teams/:conf` serves it, so they
 * go through `mapTeamRecord` rather than a second mapper — an editor that normalized its own
 * response differently from the list it writes into would show the two disagreeing about the row
 * that was just saved.
 */

import { mapTeamRecord } from "./client";
import { credentialedRequest } from "./credentialed";
import type { RequestOpts } from "./http";
import {
  APPLICATION_CODE_MAX,
  APPLICATION_LOGO_MAX,
  APPLICATION_NAME_MAX,
  SUB_ORDINAL_MAX,
} from "./teamApplications";
import { mapAccount, type LinkedAccount, type RiotAccountInput } from "./profiles";
import { mapPlayerSummary, type PlayerSummary } from "./playerSummary";
import { mapGuildCandidate, type GuildMemberCandidate } from "./teamApplications";
import type { TeamRecord } from "./types";

// --------------------------------------------------------------- constraints

/**
 * The same column widths the application document already mirrors, aliased rather than restated.
 *
 * They are not merely equal — they are the *same columns*. Publication copies an approved
 * application straight into `teams`, so a team name that fit an application always fits a team, and
 * two sets of numbers here would be two things to update when one column grows.
 */
export const TEAM_NAME_MAX = APPLICATION_NAME_MAX;
export const TEAM_CODE_MAX = APPLICATION_CODE_MAX;
export const TEAM_LOGO_MAX = APPLICATION_LOGO_MAX;
/** `COLOR_MAX` is the same 24-bit ceiling and is already exported from `./teamApplications`. */

/** The bench cap, from the same rule `publicationIssues` applies to an application's substitutes. */
export const TEAM_SUBS_MAX = SUB_ORDINAL_MAX + 1;

// --------------------------------------------------------------------- types

/**
 * A team's roster, as profile ids.
 *
 * Ids, not slots: the read hydrates each position into `{profileId, name}` for display, but the
 * column holds a `profiles.id` and sending the hydrated object back would invite the server to
 * believe a stale name. `null` is an empty starting position and `[]` an empty bench — neither is
 * an error, and a team mid-signing legitimately has both.
 */
export interface TeamRosterInput {
  owner: number | null;
  /** Deduplicated by the server. Order is not meaningful. */
  contacts: number[];
  top: number | null;
  jg: number | null;
  mid: number | null;
  bot: number | null;
  sup: number | null;
  /** In bench order, capped at `TEAM_SUBS_MAX`. */
  subs: number[];
}

/** Everything a viewer sees before the roster: the team's identity and its colors. */
export interface TeamBrandingInput {
  /** Unique within the conference, compared case-insensitively upstream. */
  code: string;
  name: string;
  /** A URL — uploaded or pasted. `null` clears it; upstream refuses an empty string. */
  logo: string | null;
  /** Raw integer. `0` reads as unset upstream, the same trap the application form nudges around. */
  color: number | null;
  colorSecondary: number | null;
}

/** The complete team document. Create sends all of it — there is no half-specified new team. */
export type TeamCreate = TeamBrandingInput & TeamRosterInput;

/**
 * A patch. An absent key leaves that column alone; an explicit `null` clears it.
 *
 * Partial rather than a complete document, unlike create, because the two halves of this editor are
 * saved separately and on wildly different schedules: a roster moves weekly and branding once a
 * season. A whole-document `PUT` would make every roster save carry — and be able to clobber —
 * branding the person editing was not looking at.
 */
export type TeamEdit = Partial<TeamCreate>;

/** The profile returned after Riot confirms an ID, ready for one roster slot. */
export type ResolvedRosterPlayer = PlayerSummary;

/** New pickers always accept either a profile or a preview with explicit identity expectations. */
export type RosterRiotAcceptance =
  | { profileId: number }
  | (RiotAccountInput & { expectedPuuid: string; expectedProfileId: number | null });

export interface RosterRiotPreview {
  account: LinkedAccount;
  profile: PlayerSummary | null;
}

export type RosterDiscordAcceptance = { profileId: number } | { discordUserId: string };
export interface RosterDiscordProfile extends PlayerSummary {
  discordUserId: string;
  handle: string | null;
}
export interface RosterDiscordMember extends GuildMemberCandidate {
  profileId: number | null;
  profile: PlayerSummary | null;
  verified: boolean;
}
export type PlayerSearchSource<T> =
  | { status: "ok"; results: T[] }
  | { status: "unavailable"; error: string };
export interface RosterDiscordSearch {
  profiles: PlayerSearchSource<RosterDiscordProfile>;
  guild: PlayerSearchSource<RosterDiscordMember>;
}

// ----------------------------------------------------------------- endpoints

const forConf = (conf: string): string => `/tournaments/${encodeURIComponent(conf)}/teams`;

/**
 * Creates a team in one conference. `409` when the code is already taken there.
 *
 * This is the path *around* the application workflow, for the teams a league seeds by hand — a
 * carry-over roster, a late replacement, a division that never ran intake. Publication remains the
 * only way an *approved application* becomes a team; nothing here touches one.
 */
export function createTeam(
  conf: string,
  input: TeamCreate,
  opts?: RequestOpts,
): Promise<TeamRecord> {
  return credentialedRequest(forConf(conf), { method: "POST", body: input }, opts).then(raw =>
    mapTeamRecord(raw as Record<string, unknown>),
  );
}

/**
 * Edits one team. Identified by `id` rather than by code, because the code is itself editable and a
 * route key you can rename is a route key that renames the thing it points at mid-request.
 */
export function updateTeam(
  conf: string,
  id: number,
  input: TeamEdit,
  opts?: RequestOpts,
): Promise<TeamRecord> {
  return credentialedRequest(`${forConf(conf)}/${id}`, { method: "PATCH", body: input }, opts).then(
    raw => mapTeamRecord(raw as Record<string, unknown>),
  );
}

/**
 * Resolve a Riot ID for roster staff and create its profile when it has never visited the site.
 *
 * The legacy ID-only request exists upstream. New callers supply the preview expectations;
 * there is deliberately no fallback to the legacy request if the server rejects that shape.
 */
export async function resolveRosterPlayer(
  conf: string,
  input: RosterRiotAcceptance | RiotAccountInput,
  opts?: RequestOpts,
): Promise<ResolvedRosterPlayer> {
  const raw = await credentialedRequest(
    `${forConf(conf)}/players/resolve`,
    { method: "POST", body: input, cache: "no-store" },
    opts,
  );
  const player = requirePlayer(raw);
  const expected = "profileId" in input ? input.profileId
    : "expectedProfileId" in input ? input.expectedProfileId : null;
  if (expected !== null && player.profileId !== expected) {
    throw new Error("The profile changed after preview. Preview the player again.");
  }
  return player;
}

function requirePlayer(raw: unknown): PlayerSummary {
  const player = mapPlayerSummary(raw);
  if (!player) throw new Error("Player lookup returned an invalid profile");
  return player;
}

const object = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" ? raw as Record<string, unknown> : {};

/** Read-only identity preview: this may refresh metadata, but never creates an attribution profile. */
export async function previewRosterPlayer(
  conf: string, input: RiotAccountInput, opts?: RequestOpts,
): Promise<RosterRiotPreview> {
  const raw = object(await credentialedRequest(
    `${forConf(conf)}/players/preview`, { method: "POST", body: input, cache: "no-store" }, opts,
  ));
  const account = mapAccount(raw.account)[0];
  if (!account?.riotId || !(raw.profile === null || mapPlayerSummary(raw.profile))) {
    throw new Error("Riot account preview returned an invalid identity");
  }
  return { account, profile: raw.profile === null ? null : requirePlayer(raw.profile) };
}

function searchSource<T>(raw: unknown, map: (row: unknown) => T | null): PlayerSearchSource<T> {
  const source = object(raw);
  if (source.status === "unavailable" && typeof source.error === "string") {
    return { status: "unavailable", error: source.error };
  }
  if (source.status !== "ok" || !Array.isArray(source.results)) {
    return { status: "unavailable", error: "Player search returned an invalid response" };
  }
  return { status: "ok", results: source.results.map(map).filter((row): row is T => row !== null) };
}

/** Private, server-filtered and server-deduplicated sources. Snowflakes never become numbers. */
export async function searchRosterDiscord(
  conf: string, q: string, opts?: RequestOpts,
): Promise<RosterDiscordSearch> {
  const raw = object(await credentialedRequest(
    `${forConf(conf)}/discord/search?${new URLSearchParams({ q })}`, { cache: "no-store" }, opts,
  ));
  return {
    profiles: searchSource(raw.website ?? raw.profiles, value => {
      const row = object(value);
      const player = mapPlayerSummary(row);
      if (!player || typeof row.discordUserId !== "string" || !/^\d+$/.test(row.discordUserId)) return null;
      return { ...player, discordUserId: row.discordUserId, handle: typeof row.handle === "string" ? row.handle : null };
    }),
    guild: searchSource(raw.guild, value => {
      const row = object(value);
      const member = mapGuildCandidate(row);
      if (!member || row.bot === true || !/^\d+$/.test(member.userId)) return null;
      const profile = mapPlayerSummary(row.profile);
      return {
        ...member,
        profileId: profile?.profileId ?? mapPlayerSummary(row)?.profileId ?? null,
        profile,
        verified: profile?.verified ?? row.verified === true,
      };
    }),
  };
}

export async function resolveRosterDiscord(
  conf: string, input: RosterDiscordAcceptance, opts?: RequestOpts,
): Promise<PlayerSummary> {
  const player = requirePlayer(await credentialedRequest(
    `${forConf(conf)}/discord/resolve`, { method: "POST", body: input, cache: "no-store" }, opts,
  ));
  if ("profileId" in input && input.profileId !== player.profileId) {
    throw new Error("The Discord profile changed. Search for the player again.");
  }
  return player;
}

/** Namespaced for parity with the other modules' aggregates. */
export const teamAdminApi = {
  createTeam, updateTeam, resolveRosterPlayer, previewRosterPlayer, searchRosterDiscord, resolveRosterDiscord,
};
