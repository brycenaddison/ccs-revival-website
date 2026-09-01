/**
 * The league-admin team write surface: create a team, edit any attribute of one.
 *
 * **These routes do not exist upstream yet.** The contract below is the one proposed in
 * `league-admin-teams-api-spec.md` (see `C:\Users\baddison\Claude\ccs-revival-website\`), written
 * here first so the editor could be built against something concrete — the same order §14's
 * `rulebookUrl` shipped in. Until the server answers them, League Admin → Teams reads fine and
 * every save returns a `404`. Nothing else on the site imports this module.
 *
 * There is no read here on purpose. Public `GET /teams/:conf` already serves the whole editable row
 * — id, code, name, logo, both colors, owner, contacts, the five starters and the bench — and a
 * team only exists after publication, which is also what lists the conference. A second credentialed
 * projection of the same row would be one more thing to keep in step for no answer the public read
 * cannot give. `queries.teamsForConf` is the read; this file is the writes.
 *
 * Both writes answer with the team row in exactly the shape `GET /teams/:conf` serves it, so they
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

/** Namespaced for parity with the other modules' aggregates. */
export const teamAdminApi = { createTeam, updateTeam };
