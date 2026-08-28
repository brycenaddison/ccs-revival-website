/**
 * Team applications — the controlled path a hidden conference uses to build next season.
 *
 * Three flags on a conference are independent and must not be conflated: `listed` decides whether
 * it appears in ordinary site selectors, `applicationsOpen` decides intake, and `active` decides
 * the default schedule feed. Recruiting is a *pre-publication* operation, so the database refuses
 * open intake on a listed conference. Publication is one server transaction that inserts every
 * approved team and sets `listed`, `active` and `teamsPublishedAt` together — there is no partially
 * published field of teams, and approval alone writes no team rows.
 *
 * **The applicant and invitee reads are hydrated now.** Upstream serves `members` with their role
 * assignments, `submittedBy`/`reviewedBy`, and — on an invitation — `conf`, `application`,
 * `invitedBy` and `roles`. The hydration is *additive*: every persisted column keeps its own name
 * and place and the resolved people sit beside it, which is why nothing in this file changed when
 * it landed. The fields stay **optional** regardless, because absent means the deployed API is
 * older than this client, which is a different thing from an application with no members.
 *
 * That unblocks the applicant page and the invitation inbox. Neither can be reconstructed
 * client-side: an invitee's team name would mean fanning a per-conf read across every open
 * conference, and that read disappears the moment intake closes — which is exactly when a pending
 * invitation still needs answering.
 *
 * Everything here is credentialed — there is no anonymous route in this module.
 */

import { mapTournament } from "./client";
import { credentialedRequest } from "./credentialed";
import { ApiError, type RequestOpts } from "./http";
import type { Tournament } from "./types";

// ----------------------------------------------------------------- vocabularies

/**
 * An application's lifecycle. Coupled to a CHECK constraint upstream, so an unrecognized member is
 * a deploy skew. `published` and `withdrawn` are terminal.
 */
export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "withdrawn",
  "published",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return typeof v === "string" && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

/** One person's invitation state. A member's whole role set is accepted or declined together. */
export const INVITATION_STATUSES = ["pending", "accepted", "declined", "revoked"] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export function isInvitationStatus(v: unknown): v is InvitationStatus {
  return typeof v === "string" && (INVITATION_STATUSES as readonly string[]).includes(v);
}

/**
 * Discord delivery state — **notification is not authority.**
 *
 * The invitation is committed before its DM is attempted, so `failed` means the recipient was not
 * messaged while the invitation is still live in their website inbox. A user with DMs disabled is
 * the ordinary case, not an error.
 */
export const DM_STATUSES = ["pending", "sent", "failed"] as const;

export type DmStatus = (typeof DM_STATUSES)[number];

export function isDmStatus(v: unknown): v is DmStatus {
  return typeof v === "string" && (DM_STATUSES as readonly string[]).includes(v);
}

/**
 * Every role a proposed team member may hold.
 *
 * `owner` and `contact` are administrative and coexist with a playing role — the same person may be
 * the owner and the mid laner. Only the mutually exclusive *playing* assignments are refused.
 */
export const TEAM_MEMBER_ROLES = [
  "owner",
  "contact",
  "top",
  "jg",
  "mid",
  "bot",
  "sup",
  "sub",
] as const;

export type TeamMemberRole = (typeof TEAM_MEMBER_ROLES)[number];

export function isTeamMemberRole(v: unknown): v is TeamMemberRole {
  return typeof v === "string" && (TEAM_MEMBER_ROLES as readonly string[]).includes(v);
}

// ------------------------------------------------------------------ constraints

/** Mirrors of upstream's `teamApplicationValidation.ts`, so a field can cap its own input. */
export const APPLICATION_NAME_MAX = 80;
export const APPLICATION_CODE_MAX = 8;
export const APPLICATION_LOGO_MAX = 256;
export const APPLICATION_MESSAGE_MAX = 4000;
export const APPLICATION_METADATA_MAX_BYTES = 32768;
/** Both colors are RGB integers in the inclusive range 0..16777215. */
export const COLOR_MAX = 0xffffff;
/** Only substitutes take a nonzero ordinal, and it stops at four — five subs, 0..4. */
export const SUB_ORDINAL_MAX = 4;

// ------------------------------------------------------------------------ types

/** A person, as one of these payloads names them. `name` is presentation; `profileId` is identity. */
export interface ProfileRef {
  profileId: number;
  name: string | null;
}

export interface MemberRoleAssignment {
  role: TeamMemberRole;
  ordinal: number;
}

/** One invited profile on one proposed team. Includes declined and revoked people: invitation
 * history is what a reviewer reads, and an outstanding `pending` row is the only kind that blocks
 * submission. */
export interface ApplicationMember {
  id: number;
  profileId: number;
  /** Flattened, not nested: a member *is* a person, so upstream keeps these beside the row. */
  name: string | null;
  /** Cached Discord handle. Often null — it has only been recorded at login since the column existed. */
  handle: string | null;
  /** A finished Discord CDN url, not the hash: upstream resolves the numbered default. */
  avatar: string | null;
  status: InvitationStatus;
  roles: MemberRoleAssignment[];
  invitedAt: string | null;
  respondedAt: string | null;
  revokedAt: string | null;
  dmStatus: DmStatus;
  invitedBy: ProfileRef | null;
}

/**
 * One proposed team for one conference.
 *
 * `members`, `submittedBy` and `reviewedBy` are **optional** rather than nullable: absent means the
 * deployed API does not serve them yet, which is a different thing from an application with no
 * members — impossible, since the submitter is seeded as an accepted owner and contact.
 */
export interface TeamApplication {
  id: number;
  conf: string;
  /**
   * The conference's display name, flat beside its code.
   *
   * It has to be served rather than looked up: an application only exists while its conference is
   * **hidden**, so the public tournament list cannot name it, and neither can
   * `/tournaments/applications/open` once intake closes with staff review still pending. `null` for a
   * conference that has since been deleted.
   */
  confName: string | null;
  confShortname: string | null;
  submittedByProfileId: number;
  teamName: string;
  teamCode: string;
  logo: string | null;
  color: number | null;
  colorSecondary: number | null;
  /** Opaque supplementary answers. Never a place for a field involved in publication or filtering. */
  applicationMetadata: Record<string, unknown>;
  status: ApplicationStatus;
  applicantMessage: string | null;
  /** The reviewer's response, written to be read by the applicant. */
  decisionMessage: string | null;
  reviewedByProfileId: number | null;
  reviewedAt: string | null;
  publishedTeamId: number | null;
  createdAt: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  members?: ApplicationMember[];
  submittedBy?: ProfileRef;
  reviewedBy?: ProfileRef | null;
}

/** One row of the signed-in profile's invitation inbox. */
export interface TeamInvitation {
  id: number;
  applicationId: number;
  profileId: number;
  invitedByProfileId: number;
  status: InvitationStatus;
  invitedAt: string | null;
  respondedAt: string | null;
  revokedAt: string | null;
  dmStatus: DmStatus;
  conf: string | null;
  /** Flat beside the code, and served for the same reason as on an application. */
  confName: string | null;
  confShortname: string | null;
  /**
   * Enough of the application to say whose team is asking — **not** the whole thing. An invitee is
   * not entitled to the rest of the proposed roster, so upstream projects only these fields.
   *
   * `status` matters to the recipient: an invitation on a `submitted` application can no longer be
   * revised by its owner, so declining it is the only way to change the answer.
   */
  application?: {
    id: number;
    status: ApplicationStatus;
    teamName: string;
    teamCode: string;
    logo: string | null;
    color: number | null;
    colorSecondary: number | null;
    submittedBy: ProfileRef | null;
  };
  invitedBy?: ProfileRef | null;
  roles?: MemberRoleAssignment[];
}

/** A hidden conference currently accepting applications. Deliberately not the public selector. */
export interface ApplicationSeason {
  conf: string;
  name: string;
  shortname: string | null;
}

/** A Discord guild member the applicant may invite. Identity is `userId`, never the label. */
export interface GuildMemberCandidate {
  userId: string;
  displayName: string;
  username: string;
  /** Raw Discord avatar hash, or null. Not a finished CDN url, unlike `/auth/me`'s. */
  avatar: string | null;
}

/** The complete application document. Strict upstream: an unknown key is a `400`. */
export interface TeamApplicationInput {
  name: string;
  code: string;
  logo: string | null;
  color: number | null;
  colorSecondary: number | null;
  applicationMetadata: Record<string, unknown>;
  message: string | null;
}

/**
 * Who to invite, and as what.
 *
 * **Exactly one of `discordUserId` or `profileId`** — both, or neither, is a `400`. They are not
 * interchangeable and the choice is not an optimization:
 *
 *  - `discordUserId` is for somebody found through the guild search. It rechecks exact guild
 *    membership and creates the profile if this is the first the site has heard of them.
 *  - `profileId` is for somebody already on the roster panel — changing their position, or resending.
 *    Rechecking guild membership only means anything for a *new* invitee, and a member projection
 *    carries no snowflake, so this is the only way to aim the upsert at a person the client is
 *    looking at.
 */
export type InvitationInput = { roles: MemberRoleAssignment[] } & (
  | { discordUserId: string; profileId?: never }
  | { profileId: number; discordUserId?: never }
);

// ----------------------------------------------------- the metadata document

/**
 * The supplementary application questions, as they live inside `applicationMetadata`.
 *
 * **This shape is the client's, not the server's.** `application_metadata` is an opaque JSONB object
 * upstream — it validates that the value is an object under 32 KiB and nothing else — so there is no
 * wire contract to mirror here and no server-side validation to lean on. Which makes this the one
 * place the schema is written down, and the reason it lives in the API layer rather than in the form:
 * two components read it (the applicant's own card and the roster-staff review queue) and a third
 * writes it, and three private copies of the same key names is how a field silently stops appearing.
 *
 * The upstream limit is generous enough not to think about: the caps below total a little over 4 KB
 * of text, well inside 32 KiB even after JSON escaping, so nothing here has to measure the document.
 *
 * Everything is optional except the acknowledgement, which gates **submission** rather than saving —
 * a draft is allowed to be half-finished, an application sent to staff is not.
 */
export interface ApplicationDetails {
  /** The organization behind the team, when it is not simply the team. */
  organizationName: string | null;
  /** An absolute URL. A bare handle typed into the form is normalized into one — see `twitterUrl`. */
  twitter: string | null;
  /** Whether the applicant confirmed they have read the league's rules. */
  rulesAcknowledged: boolean;
  /** Free text: other leagues played, placements, how long the org has been around. */
  experience: string | null;
}

export const ORGANIZATION_NAME_MAX = 120;
export const TWITTER_URL_MAX = 200;
export const EXPERIENCE_MAX = 4000;

/**
 * Turn what somebody typed into a Twitter/X profile URL.
 *
 * A captain asked for a "link" will type any of `@team`, `team`, `x.com/team` or the full URL, and
 * refusing three of those four to be pedantic about a field nobody validates is worse than
 * normalizing. Anything already carrying a scheme is left exactly as it is — including a link to some
 * other site, because a team that puts its Bluesky there has told us something true and this field is
 * not worth an argument.
 */
export function twitterUrl(input: string): string | null {
  const raw = input.trim().replace(/^@/, "");
  if (raw === "") return null;
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, TWITTER_URL_MAX);
  // A dot means they typed a domain without the scheme; no dot means it is a handle.
  const url = raw.includes(".") ? `https://${raw}` : `https://x.com/${raw}`;
  return url.slice(0, TWITTER_URL_MAX);
}

/**
 * Read the details out of a metadata document, defensively.
 *
 * Same posture as every mapper in this layer: a document written by an older build, by a script, or
 * by hand answers absent rather than throwing. An absent `rulesAcknowledged` is **false** — the one
 * field where guessing generously would be a lie about what somebody agreed to.
 */
export function readApplicationDetails(metadata: Record<string, unknown>): ApplicationDetails {
  return {
    organizationName: strOrNull(metadata.organizationName),
    twitter: strOrNull(metadata.twitter),
    rulesAcknowledged: metadata.rulesAcknowledged === true,
    experience: strOrNull(metadata.experience),
  };
}

/**
 * Merge details back into a metadata document, **preserving keys this build doesn't know about**.
 *
 * That preservation is the whole point of taking `existing`. `PUT` replaces the entire application
 * document, so a form that rebuilt `applicationMetadata` from its own fields would silently delete
 * any question added after it — including one a newer deployment is already collecting. Spreading
 * over the existing object means an unknown key survives a save by somebody on an older client.
 *
 * A `null` is written as an absent key rather than as `null`, so a cleared field leaves no residue in
 * the document to be read back as "answered with nothing".
 */
export function writeApplicationDetails(
  existing: Record<string, unknown>,
  details: ApplicationDetails,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };

  const put = (key: keyof ApplicationDetails, value: string | null) => {
    if (value === null) delete merged[key];
    else merged[key] = value;
  };

  put("organizationName", details.organizationName);
  put("twitter", details.twitter);
  put("experience", details.experience);
  merged.rulesAcknowledged = details.rulesAcknowledged;

  return merged;
}

/** A team row as the publication transaction returns it. Not the hydrated `/teams` projection. */
export interface PublishedTeam {
  id: number;
  conf: string;
  code: string;
  name: string;
  logo: string | null;
  color: number | null;
  colorSecondary: number | null;
}

export interface PublicationResult {
  /** `published` on the first success, `already_published` on an idempotent retry. */
  status: "published" | "already_published";
  teams: PublishedTeam[];
}

// ------------------------------------------------------------------ normalizing

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** An object, or `{}` — the metadata document is never an array or a scalar upstream. */
function metadataOf(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function mapProfileRef(raw: unknown): ProfileRef | null {
  const p = asRaw(raw);
  const profileId = intOrNull(p.profileId ?? p.id);
  return profileId === null ? null : { profileId, name: strOrNull(p.name) };
}

function mapRoles(v: unknown): MemberRoleAssignment[] {
  return list(v).flatMap((entry: unknown) => {
    // A bare string is accepted as well as a `{role, ordinal}` object: the ordinal is zero for
    // everything except substitutes, so a server that serves only the vocabulary is not wrong.
    if (isTeamMemberRole(entry)) return [{ role: entry, ordinal: 0 }];
    const r = asRaw(entry);
    if (!isTeamMemberRole(r.role)) return [];
    return [{ role: r.role, ordinal: int(r.ordinal) }];
  });
}

function mapMember(raw: unknown): ApplicationMember | null {
  const m = asRaw(raw);
  const id = intOrNull(m.id);
  const profileId = intOrNull(m.profileId);
  if (id === null || profileId === null) return null;
  return {
    id,
    profileId,
    name: strOrNull(m.name),
    handle: strOrNull(m.handle),
    avatar: strOrNull(m.avatar),
    status: isInvitationStatus(m.status) ? m.status : "pending",
    roles: mapRoles(m.roles),
    invitedAt: strOrNull(m.invitedAt),
    respondedAt: strOrNull(m.respondedAt),
    revokedAt: strOrNull(m.revokedAt),
    dmStatus: isDmStatus(m.dmStatus) ? m.dmStatus : "pending",
    invitedBy: mapProfileRef(m.invitedBy),
  };
}

function mapApplication(raw: unknown): TeamApplication {
  const a = asRaw(raw);
  const members = Array.isArray(a.members)
    ? a.members.map(mapMember).filter((m): m is ApplicationMember => m !== null)
    : null;
  const submittedBy = mapProfileRef(a.submittedBy);

  return {
    id: int(a.id),
    conf: str(a.conf),
    confName: strOrNull(a.confName),
    confShortname: strOrNull(a.confShortname),
    submittedByProfileId: int(a.submittedByProfileId),
    teamName: str(a.teamName),
    teamCode: str(a.teamCode),
    logo: strOrNull(a.logo),
    color: intOrNull(a.color),
    colorSecondary: intOrNull(a.colorSecondary),
    applicationMetadata: metadataOf(a.applicationMetadata),
    // An unrecognized status reads as `draft` rather than being dropped: the row exists, and a
    // queue that silently omitted it would hide work. `draft` is the state with no staff action.
    status: isApplicationStatus(a.status) ? a.status : "draft",
    applicantMessage: strOrNull(a.applicantMessage),
    decisionMessage: strOrNull(a.decisionMessage),
    reviewedByProfileId: intOrNull(a.reviewedByProfileId),
    reviewedAt: strOrNull(a.reviewedAt),
    publishedTeamId: intOrNull(a.publishedTeamId),
    createdAt: strOrNull(a.createdAt),
    submittedAt: strOrNull(a.submittedAt),
    updatedAt: strOrNull(a.updatedAt),
    ...(members ? { members } : {}),
    ...(submittedBy ? { submittedBy } : {}),
    ...("reviewedBy" in a ? { reviewedBy: mapProfileRef(a.reviewedBy) } : {}),
  };
}

function mapInvitation(raw: unknown): TeamInvitation {
  const i = asRaw(raw);
  const application = asRaw(i.application);
  const applicationId = intOrNull(application.id);

  return {
    id: int(i.id),
    applicationId: int(i.applicationId),
    profileId: int(i.profileId),
    invitedByProfileId: int(i.invitedByProfileId),
    status: isInvitationStatus(i.status) ? i.status : "pending",
    invitedAt: strOrNull(i.invitedAt),
    respondedAt: strOrNull(i.respondedAt),
    revokedAt: strOrNull(i.revokedAt),
    dmStatus: isDmStatus(i.dmStatus) ? i.dmStatus : "pending",
    conf: strOrNull(i.conf),
    confName: strOrNull(i.confName),
    confShortname: strOrNull(i.confShortname),
    ...(applicationId !== null
      ? {
          application: {
            id: applicationId,
            status: isApplicationStatus(application.status) ? application.status : "draft",
            teamName: str(application.teamName),
            teamCode: str(application.teamCode),
            logo: strOrNull(application.logo),
            color: intOrNull(application.color),
            colorSecondary: intOrNull(application.colorSecondary),
            submittedBy: mapProfileRef(application.submittedBy),
          },
        }
      : {}),
    ...("invitedBy" in i ? { invitedBy: mapProfileRef(i.invitedBy) } : {}),
    ...(Array.isArray(i.roles) ? { roles: mapRoles(i.roles) } : {}),
  };
}

function mapApplicationSeason(raw: unknown): ApplicationSeason {
  const t = asRaw(raw);
  return { conf: str(t.conf), name: str(t.name), shortname: strOrNull(t.shortname) };
}

function mapCandidate(raw: unknown): GuildMemberCandidate | null {
  const c = asRaw(raw);
  const userId = strOrNull(c.userId);
  if (userId === null) return null;
  return {
    userId,
    displayName: str(c.displayName, userId),
    username: str(c.username),
    avatar: strOrNull(c.avatar),
  };
}

function mapPublishedTeam(raw: unknown): PublishedTeam {
  const t = asRaw(raw);
  return {
    id: int(t.id),
    conf: str(t.conf),
    code: str(t.code),
    name: str(t.name),
    logo: strOrNull(t.logo),
    color: intOrNull(t.color),
    colorSecondary: intOrNull(t.colorSecondary),
  };
}

// -------------------------------------------------------------------- refusals

/**
 * A `409` from this router, as data.
 *
 * **Every refusal on this surface now answers one shape** — `{status, error, issues?}` — where
 * `status` is the token to branch on, `error` is the sentence to show, and `issues` is present only
 * when the refusal carries a list. `error` is the same key the auth and role guards use, so
 * `credentialed.ts`'s `detailOf` already lifts it into `ApiError.detail` and the message needs no
 * work here.
 *
 * This used to hold a lookup table translating bare state tokens into English — the one place in the
 * API layer that rewrote a server message, because three different shapes coexisted on these routes
 * and one of them put `applications_open` in front of a league admin. That table is gone: the only
 * thing left worth extracting is `issues`, which is a list rather than a sentence and so cannot ride
 * in `detail`.
 */
export interface Refusal {
  /** The upstream token, for a call site that wants to branch rather than print. */
  status: string;
  /** The server's own sentence. Shown verbatim, like every other error on the site. */
  message: string;
  /**
   * Per-item validation failures. `[]` when the refusal carried none — upstream omits the key
   * rather than sending an empty array, so absent and empty are the same thing to a caller.
   */
  issues: string[];
}

/** The refusal this failure carries, or `null` when it was something else entirely. */
export function refusalOf(e: unknown): Refusal | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;

  const body = asRaw(e.body);
  return {
    status: strOrNull(body.status) ?? "",
    message: e.detail,
    issues: list(body.issues).filter((i): i is string => typeof i === "string"),
  };
}

// ------------------------------------------------------------------- transport

const forConf = (conf: string): string => `/tournaments/${encodeURIComponent(conf)}/applications`;

// ------------------------------------------------------------- applicant reads

/**
 * Hidden conferences a signed-in member may apply to.
 *
 * Separate from `GET /tournaments` on purpose: these conferences are deliberately absent from
 * ordinary navigation, and folding them into the season selector would publish them early.
 */
export function openApplicationSeasons(opts?: RequestOpts): Promise<ApplicationSeason[]> {
  return credentialedRequest("/tournaments/applications/open", {}, opts).then(raw =>
    list(raw).map(mapApplicationSeason),
  );
}

/** The caller's own applications in one conference — filtered by profile in the server's query. */
export function myApplications(conf: string, opts?: RequestOpts): Promise<TeamApplication[]> {
  return credentialedRequest(forConf(conf), {}, opts).then(raw => list(raw).map(mapApplication));
}

/** The caller's invitation inbox. Authoritative even when the Discord DM failed. */
export function myInvitations(opts?: RequestOpts): Promise<TeamInvitation[]> {
  return credentialedRequest("/tournaments/invitations", {}, opts).then(raw =>
    list(raw).map(mapInvitation),
  );
}

// ------------------------------------------------------------ applicant writes

/** Creates a draft and seeds the caller as its accepted owner and contact. */
export function createApplication(
  conf: string,
  input: TeamApplicationInput,
  opts?: RequestOpts,
): Promise<TeamApplication> {
  return credentialedRequest(forConf(conf), { method: "POST", body: input }, opts).then(
    mapApplication,
  );
}

/** Replaces a draft's whole document. Editing a rejected application returns it to `draft`. */
export function replaceApplication(
  conf: string,
  id: number,
  input: TeamApplicationInput,
  opts?: RequestOpts,
): Promise<TeamApplication> {
  return credentialedRequest(
    `${forConf(conf)}/${id}`,
    { method: "PUT", body: input },
    opts,
  ).then(mapApplication);
}

/** Submits for review. A `409` carrying `issues` names what is still missing from the roster. */
export function submitApplication(
  conf: string,
  id: number,
  opts?: RequestOpts,
): Promise<TeamApplication> {
  return credentialedRequest(
    `${forConf(conf)}/${id}/submit`,
    { method: "POST", body: {} },
    opts,
  ).then(mapApplication);
}

/**
 * Withdraws an application. **Terminal** — `withdrawn` has no transition out of it, so the applicant
 * starts a fresh application rather than reviving this one. The confirmation this needs is the
 * caller's job.
 */
export function withdrawApplication(
  conf: string,
  id: number,
  opts?: RequestOpts,
): Promise<TeamApplication> {
  return credentialedRequest(
    `${forConf(conf)}/${id}/withdraw`,
    { method: "POST", body: {} },
    opts,
  ).then(mapApplication);
}

/**
 * Guild member search, for choosing whom to invite.
 *
 * Owner-only and capped at ten results upstream, against the one configured guild. A `503` means
 * the bot is not connected — the rest of the API does not depend on Discord readiness, so this is
 * the one call that can be unavailable on its own.
 */
export function searchGuildMembers(
  conf: string,
  id: number,
  q: string,
  opts?: RequestOpts,
): Promise<GuildMemberCandidate[]> {
  const search = new URLSearchParams({ q }).toString();
  return credentialedRequest(`${forConf(conf)}/${id}/members/search?${search}`, {}, opts).then(
    raw => list(raw).map(mapCandidate).filter((c): c is GuildMemberCandidate => c !== null),
  );
}

/**
 * Sends or replaces one member's invitation.
 *
 * Upserts: re-posting the same Discord member replaces their role set and returns the invitation to
 * `pending`, which is how both a role change and a resend are expressed — there is no separate
 * route for either. The server re-fetches the member from the guild before writing, so a candidate
 * value cannot be edited into an invitation for an arbitrary Discord user.
 */
export function inviteMember(
  conf: string,
  id: number,
  input: InvitationInput,
  opts?: RequestOpts,
): Promise<ApplicationMember> {
  return credentialedRequest(
    `${forConf(conf)}/${id}/invitations`,
    { method: "POST", body: input },
    opts,
  ).then(raw => {
    const member = mapMember(raw);
    if (!member) throw new Error("The invitation response carried no member id");
    return member;
  });
}

/** Revokes an invitation. Persisted first; the follow-up DM is best-effort. */
export function revokeInvitation(
  conf: string,
  applicationId: number,
  memberId: number,
  opts?: RequestOpts,
): Promise<ApplicationMember> {
  return credentialedRequest(
    `${forConf(conf)}/${applicationId}/invitations/${memberId}`,
    { method: "DELETE" },
    opts,
  ).then(raw => {
    const member = mapMember(raw);
    if (!member) throw new Error("The revocation response carried no member id");
    return member;
  });
}

/** Accepts or declines one of the caller's own pending invitations. */
export function respondToInvitation(
  invitationId: number,
  response: "accepted" | "declined",
  opts?: RequestOpts,
): Promise<TeamInvitation> {
  return credentialedRequest(
    `/tournaments/invitations/${invitationId}`,
    { method: "PATCH", body: { response } },
    opts,
  ).then(mapInvitation);
}

// ------------------------------------------------------------------ staff side

/** Every application in one conference, oldest submission first. Needs the `roster` scope. */
export function applicationQueue(conf: string, opts?: RequestOpts): Promise<TeamApplication[]> {
  return credentialedRequest(`${forConf(conf)}/review`, {}, opts).then(raw =>
    list(raw).map(mapApplication),
  );
}

/**
 * Approves or rejects a submitted application. **Approval writes no team rows** — every approved
 * team is created by the publication transaction, and only there.
 */
export function reviewApplication(
  conf: string,
  id: number,
  decision: "approved" | "rejected",
  message: string | null,
  opts?: RequestOpts,
): Promise<TeamApplication> {
  return credentialedRequest(
    `${forConf(conf)}/${id}/review`,
    { method: "PATCH", body: { decision, message } },
    opts,
  ).then(mapApplication);
}

/**
 * Opens or closes intake. Needs the full conference `admin` scope, not `roster`.
 *
 * A `409` means the conference is already listed: the database enforces
 * `NOT applications_open OR NOT listed`, which is what keeps recruiting a hidden operation.
 */
export function setApplicationsOpen(
  conf: string,
  open: boolean,
  opts?: RequestOpts,
): Promise<Tournament> {
  return credentialedRequest(
    `${forConf(conf)}/open`,
    { method: "PATCH", body: { open } },
    opts,
  ).then(mapTournament);
}

/**
 * Publishes every approved team, lists the conference and activates it — one transaction.
 *
 * Idempotent: a retry after success answers `already_published` with the same rows rather than
 * inserting duplicates. Any failure rolls back every team, every application status and every
 * tournament flag, so there is no state in which half a season exists.
 */
export function publishTeams(conf: string, opts?: RequestOpts): Promise<PublicationResult> {
  return credentialedRequest(`${forConf(conf)}/publish`, { method: "POST", body: {} }, opts).then(
    raw => {
      const result = asRaw(raw);
      return {
        status: result.status === "already_published" ? "already_published" : "published",
        teams: list(result.teams).map(mapPublishedTeam),
      };
    },
  );
}

/** Namespaced for call sites that want the surface in one object, like `api` and `adminApi`. */
export const teamApplicationsApi = {
  openApplicationSeasons,
  myApplications,
  myInvitations,
  createApplication,
  replaceApplication,
  submitApplication,
  withdrawApplication,
  searchGuildMembers,
  inviteMember,
  revokeInvitation,
  respondToInvitation,
  applicationQueue,
  reviewApplication,
  setApplicationsOpen,
  publishTeams,
};
