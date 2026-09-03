/**
 * Importing a team application on somebody's behalf: the site-admin half of the application surface.
 *
 * The applicant routes in `teamApplications.ts` gate every write on `submittedByProfileId`, and they
 * are right to: a captain's draft is theirs. That is exactly what makes them useless for a migration.
 * The league ran its intake on an external form this season, so the answers exist and the applicants
 * do not know the site yet, and nothing on `/tournaments` lets anyone but the captain create their
 * draft or put a player on it. This module is the way around that, and it is **site-admin only**
 * (`/admin/leagues/:conf/applications/...`) for the same reason the intake toggle is: creating an
 * application in a hidden season and messaging a dozen Discord members is not one conference's data
 * being edited, it is the site acting on someone's behalf.
 *
 * **Three deliberate departures from the applicant routes:**
 *
 *  - Import lands the application as a **`draft` owned by the submitter**, not the admin. Control
 *    follows `submittedByProfileId` everywhere, so from the moment it exists the captain can edit,
 *    submit and withdraw it from `/my-applications` exactly as if they had started it, and the admin
 *    cannot. The admin route bypasses `applicationsOpen`, because an import routinely happens after
 *    the external form closed; the normal roster checks still gate Submit.
 *  - The roster is written **with** the application, as real `pending` invitations that are visible
 *    in every invitee's inbox at once, and **no Discord DM is attempted** (`dmStatus: "pending"`,
 *    never attempted). Sending them is `sendApplicationInvitations`, a separate command, so a batch
 *    of imports can be checked over before anybody is messaged. The submitter's own row is `pending`
 *    like everyone else's: the applicant route accepts a self-invitation because the applicant is the
 *    one person whose answer is known, and here the person writing is not the person answering.
 *  - `discardApplication` exists because withdraw is the submitter's alone. An import with the wrong
 *    submitter or the wrong league would otherwise be a draft nobody but its accidental owner could
 *    remove. Same transaction as withdraw, same `draft`/`rejected` guard.
 *
 * People are named the way an invitation names them: **exactly one of `discordUserId` or
 * `profileId`**. The guild search behind the first is `searchGuild`, a site-admin route, because the
 * applicant's search lives under an application id and is gated on its creator, and here the search
 * happens before the application exists. The second is the public `GET /profiles/search`.
 *
 * **None of these routes exist upstream yet.** The contract is `admin-application-import-api-spec.md`
 * in the deliverables folder (`API-GAP-ANALYSIS.md` §22); until they land every write here answers
 * `404`, shown verbatim.
 *
 * Every response that carries an application goes through `teamApplications.ts`'s `mapApplication`,
 * so the import page and the review queue cannot disagree about a row.
 */

import { credentialedRequest } from "./credentialed";
import type { RequestOpts } from "./http";
import {
  mapApplication,
  mapGuildCandidate,
  type GuildMemberCandidate,
  type InvitationInput,
  type TeamApplication,
  type TeamApplicationInput,
} from "./teamApplications";

// ------------------------------------------------------------------------ types

/**
 * One person, named by Discord snowflake or by profile id, never both. The same rule as
 * `InvitationInput`, lifted out because the submitter is named the same way and carries no roles.
 */
export type PersonRef =
  | { discordUserId: string; profileId?: never }
  | { profileId: number; discordUserId?: never };

/** A roster entry to import: who, and as what. Identical to an invitation body on purpose. */
export type ImportedMember = InvitationInput;

/** The whole import: who it is for, the strict application document, and the roster to stage. */
export interface ApplicationImportInput {
  submitter: PersonRef;
  application: TeamApplicationInput;
  members: ImportedMember[];
}

/**
 * What one send did. `attempted` counts the members a DM was tried for (every `pending` member whose
 * `dmStatus` was not already `sent`); `sent` and `failed` split them. The application rides along
 * with every member's `dmStatus` updated, so the card can re-render without a second read.
 */
export interface InvitationSendResult {
  attempted: number;
  sent: number;
  failed: number;
  application: TeamApplication;
}

/** Upstream's own floor for the guild search: a shorter query is a `400`, not an empty result. */
export const GUILD_SEARCH_MIN = 2;

// ------------------------------------------------------------------ normalizing

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function mapSendResult(raw: unknown): InvitationSendResult {
  const r = asRaw(raw);
  return {
    attempted: int(r.attempted),
    sent: int(r.sent),
    failed: int(r.failed),
    application: mapApplication(r.application),
  };
}

// ------------------------------------------------------------------- transport

const forConf = (conf: string): string =>
  `/admin/leagues/${encodeURIComponent(conf)}/applications`;

/**
 * Creates a `draft` application owned by `submitter`, with `members` staged as `pending` invitations
 * that have not been DMed. Answers the hydrated application, `members` included.
 *
 * Refusals come in the application surface's `{status, error, issues?}` envelope, so `refusalOf`
 * reads them: everything the applicant's own create refuses, plus `season_listed` for a public
 * season, `duplicate_member` for one person listed twice (once by snowflake and once by profile id
 * counts), and `not_in_guild` for a snowflake the configured guild does not have. A `404` names a
 * profile id nothing answers to.
 */
export function importApplication(
  conf: string,
  input: ApplicationImportInput,
  opts?: RequestOpts,
): Promise<TeamApplication> {
  return credentialedRequest(
    `${forConf(conf)}/import`,
    { method: "POST", body: input },
    opts,
  ).then(mapApplication);
}

/**
 * Attempts the Discord DM for every `pending` member whose `dmStatus` is not already `sent`.
 *
 * Idempotent in the way that matters: a second press reaches only the people the first one missed,
 * and a member who has since accepted or declined is left alone. A `failed` DM is not a failed
 * invitation, and the result says so per member rather than as an error.
 */
export function sendApplicationInvitations(
  conf: string,
  id: number,
  opts?: RequestOpts,
): Promise<InvitationSendResult> {
  return credentialedRequest(
    `${forConf(conf)}/${id}/invitations/send`,
    { method: "POST", body: {} },
    opts,
  ).then(mapSendResult);
}

/**
 * Deletes a `draft` or `rejected` application, its members and their roles, as withdraw does, but
 * on the admin's authority rather than the submitter's. `409` for any other status: once it is
 * submitted the decision belongs to the reviewer. Resolves to nothing, since nothing is left to map.
 */
export function discardApplication(conf: string, id: number, opts?: RequestOpts): Promise<void> {
  return credentialedRequest(`${forConf(conf)}/${id}`, { method: "DELETE" }, opts).then(
    () => undefined,
  );
}

/**
 * The configured guild's members, for naming a person before any application exists to search
 * under. Same projection, floor and ten-result cap as the applicant's search, and the same `503`
 * when the bot is not connected.
 */
export function searchGuild(q: string, opts?: RequestOpts): Promise<GuildMemberCandidate[]> {
  const search = new URLSearchParams({ q }).toString();
  return credentialedRequest(`/admin/guild/members/search?${search}`, {}, opts).then(raw =>
    list(raw)
      .map(mapGuildCandidate)
      .filter((c): c is GuildMemberCandidate => c !== null),
  );
}

/** Namespaced for call sites that want the surface in one object, like `adminApi`. */
export const adminApplicationsApi = {
  importApplication,
  sendApplicationInvitations,
  discardApplication,
  searchGuild,
};
