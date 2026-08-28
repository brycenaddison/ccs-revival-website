/**
 * Accolades — reusable definitions, and the occurrences issued against them.
 *
 * The split is the whole design and it is worth holding onto: a *definition* ("First Team All-Pro",
 * "🏆 Champion") is reusable and either site-wide (`conf: null`) or owned by one league; an
 * *occurrence* is one award of one definition, carrying a complete recipient list. That is what
 * makes co-winners one occurrence with several recipients, while a recurring award like player of
 * the week is several occurrences of the same definition told apart by `label`.
 *
 * A team occurrence names the team and leaves `profileIds` empty: **the server expands the team's
 * current roster** — five starters plus substitutes, deduplicated — in the same transaction. So a
 * team award is not a shortcut for typing five names, it is a different kind of record, and editing
 * one repeats the expansion against whatever the roster is now. Former roster members are never
 * included.
 *
 * Both write documents are **strict and complete** upstream: exact keys, so there is no partial
 * patch and no way to change one field without sending the rest. `active: false` is how a
 * definition is retired — it blocks new issuance while preserving every accolade already awarded.
 *
 * Two guarded surfaces, both credentialed. `/tournaments/:conf/accolades` needs full edit rights in
 * that conference; `/admin/accolades/definitions` is site-admin only and is the only API that can
 * change a global definition. A league admin *sees* active global definitions in their conference's
 * read and may issue them, but cannot edit them.
 *
 * The public side of this is already built: `profiles.ts` maps `accolades` on the profile document
 * and `components/profile/AccoladeStrip.tsx` renders it. Nothing here feeds that read directly, so
 * every write in this module invalidates the profile root as well as its own.
 */

import { credentialedRequest } from "./credentialed";
import type { RequestOpts } from "./http";

// ----------------------------------------------------------------- vocabularies

/**
 * What a definition is awarded to. Coupled to a CHECK constraint upstream, and it decides the shape
 * of every assignment made under it — a `team` definition refuses an explicit profile list and an
 * `individual` definition refuses a team, both with a `409`.
 */
export const ACCOLADE_KINDS = ["team", "individual"] as const;

export type AccoladeKind = (typeof ACCOLADE_KINDS)[number];

export function isAccoladeKind(v: unknown): v is AccoladeKind {
  return typeof v === "string" && (ACCOLADE_KINDS as readonly string[]).includes(v);
}

// ------------------------------------------------------------------ constraints

/** Mirrors of upstream's `accoladeValidation.ts`, so a field can cap its own input. */
export const ACCOLADE_NAME_MAX = 80;
export const ACCOLADE_DESCRIPTION_MAX = 500;
export const ACCOLADE_LABEL_MAX = 80;

// ------------------------------------------------------------------------ types

/**
 * A reusable award.
 *
 * `conf` is `null` for a site-wide definition every league may issue, and a conf id for one owned by
 * that league. Names are counted in code points upstream, so an emoji costs one character.
 */
export interface AccoladeDefinition {
  id: number;
  conf: string | null;
  kind: AccoladeKind;
  name: string;
  description: string | null;
  /** `false` blocks new issuance without touching accolades already awarded. */
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** One award of one definition, with its complete recipient list. */
export interface AccoladeRecord {
  id: number;
  definitionId: number;
  /** `null` on a site-wide occurrence. The schema permits them; no admin surface issues one yet. */
  conf: string | null;
  /** Tells repeat issuances of one definition apart: "Group A", "Week 4". */
  label: string | null;
  teamId: number | null;
  awardedAt: string | null;
  updatedAt: string | null;
  definition: AccoladeDefinition;
  team: { id: number; code: string; name: string } | null;
  /** Served in a stable order; the client never re-sorts a recipient list. */
  recipients: { profileId: number; nickname: string | null }[];
}

/** The conference management read: what may be issued here, and what already has been. */
export interface LeagueAccolades {
  /** Active site-wide definitions plus every definition this conference owns, name-ordered. */
  definitions: AccoladeDefinition[];
  /** This conference's occurrences, newest first. */
  accolades: AccoladeRecord[];
}

/** The complete definition document. Exactly these four keys, or upstream answers `400`. */
export interface AccoladeDefinitionInput {
  kind: AccoladeKind;
  name: string;
  description: string | null;
  active: boolean;
}

/**
 * The complete assignment document. Exactly these four keys.
 *
 * One of two shapes: a `teamId` with an empty `profileIds`, or a non-empty `profileIds` with a null
 * `teamId`. Anything else is a `400`, and a shape that disagrees with the definition's `kind` is a
 * `409`.
 */
export interface AccoladeInput {
  definitionId: number;
  label: string | null;
  teamId: number | null;
  profileIds: number[];
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

/**
 * A definition. An unrecognized `kind` falls back to `individual` rather than dropping the row.
 *
 * Dropping would hide a definition an admin can see in the database and cannot find on the page;
 * `individual` is the conservative reading, because it is the kind that cannot silently expand into
 * a whole roster.
 */
function mapDefinition(raw: unknown): AccoladeDefinition {
  const d = asRaw(raw);
  return {
    id: int(d.id),
    conf: strOrNull(d.conf),
    kind: isAccoladeKind(d.kind) ? d.kind : "individual",
    name: str(d.name),
    description: strOrNull(d.description),
    // Absent reads as active: every deployed definition predating the column was issuable.
    active: d.active !== false,
    createdAt: strOrNull(d.createdAt),
    updatedAt: strOrNull(d.updatedAt),
  };
}

function mapTeamRef(raw: unknown): AccoladeRecord["team"] {
  const t = asRaw(raw);
  const id = intOrNull(t.id);
  return id === null ? null : { id, code: str(t.code), name: str(t.name) };
}

function mapRecipients(v: unknown): AccoladeRecord["recipients"] {
  return list(v).flatMap((entry: unknown) => {
    const r = asRaw(entry);
    const profileId = intOrNull(r.profileId);
    return profileId === null ? [] : [{ profileId, nickname: strOrNull(r.nickname) }];
  });
}

function mapAccolade(raw: unknown): AccoladeRecord {
  const a = asRaw(raw);
  return {
    id: int(a.id),
    definitionId: int(a.definitionId),
    conf: strOrNull(a.conf),
    label: strOrNull(a.label),
    teamId: intOrNull(a.teamId),
    awardedAt: strOrNull(a.awardedAt),
    updatedAt: strOrNull(a.updatedAt),
    definition: mapDefinition(a.definition),
    team: mapTeamRef(a.team),
    recipients: mapRecipients(a.recipients),
  };
}

// ------------------------------------------------------------------- transport

const forConf = (conf: string): string => `/tournaments/${encodeURIComponent(conf)}/accolades`;
const GLOBAL = "/admin/accolades/definitions";

// ---------------------------------------------------------------- league admin

/** Everything one conference's accolade editor needs, in one request. */
export function leagueAccolades(conf: string, opts?: RequestOpts): Promise<LeagueAccolades> {
  return credentialedRequest(forConf(conf), {}, opts).then(raw => {
    const payload = asRaw(raw);
    return {
      definitions: list(payload.definitions).map(mapDefinition),
      accolades: list(payload.accolades).map(mapAccolade),
    };
  });
}

/** Creates a definition owned by this conference. Global ones are site-admin work. */
export function createLeagueDefinition(
  conf: string,
  input: AccoladeDefinitionInput,
  opts?: RequestOpts,
): Promise<AccoladeDefinition> {
  return credentialedRequest(
    `${forConf(conf)}/definitions`,
    { method: "POST", body: input },
    opts,
  ).then(mapDefinition);
}

/** Replaces a conf-owned definition. A `404` means it is global, or belongs to another league. */
export function updateLeagueDefinition(
  conf: string,
  definitionId: number,
  input: AccoladeDefinitionInput,
  opts?: RequestOpts,
): Promise<AccoladeDefinition> {
  return credentialedRequest(
    `${forConf(conf)}/definitions/${definitionId}`,
    { method: "PUT", body: input },
    opts,
  ).then(mapDefinition);
}

/** Issues one occurrence and its complete assignment. */
export function issueAccolade(
  conf: string,
  input: AccoladeInput,
  opts?: RequestOpts,
): Promise<AccoladeRecord> {
  return credentialedRequest(forConf(conf), { method: "POST", body: input }, opts).then(
    mapAccolade,
  );
}

/** Replaces an occurrence and its complete assignment — a team edit repeats the roster expansion. */
export function updateAccolade(
  conf: string,
  accoladeId: number,
  input: AccoladeInput,
  opts?: RequestOpts,
): Promise<AccoladeRecord> {
  return credentialedRequest(
    `${forConf(conf)}/${accoladeId}`,
    { method: "PUT", body: input },
    opts,
  ).then(mapAccolade);
}

/** Revokes an occurrence and every recipient row under it. `204`, so there is nothing to map. */
export function revokeAccolade(
  conf: string,
  accoladeId: number,
  opts?: RequestOpts,
): Promise<void> {
  return credentialedRequest(
    `${forConf(conf)}/${accoladeId}`,
    { method: "DELETE" },
    opts,
  ).then(() => undefined);
}

// ------------------------------------------------------------------ site admin

/** Every global definition, inactive ones included — this is the editor read. */
export function globalDefinitions(opts?: RequestOpts): Promise<AccoladeDefinition[]> {
  return credentialedRequest(GLOBAL, {}, opts).then(raw => list(raw).map(mapDefinition));
}

export function createGlobalDefinition(
  input: AccoladeDefinitionInput,
  opts?: RequestOpts,
): Promise<AccoladeDefinition> {
  return credentialedRequest(GLOBAL, { method: "POST", body: input }, opts).then(mapDefinition);
}

export function updateGlobalDefinition(
  definitionId: number,
  input: AccoladeDefinitionInput,
  opts?: RequestOpts,
): Promise<AccoladeDefinition> {
  return credentialedRequest(
    `${GLOBAL}/${definitionId}`,
    { method: "PUT", body: input },
    opts,
  ).then(mapDefinition);
}

/** Namespaced for call sites that want the surface in one object. */
export const accoladesApi = {
  leagueAccolades,
  createLeagueDefinition,
  updateLeagueDefinition,
  issueAccolade,
  updateAccolade,
  revokeAccolade,
  globalDefinitions,
  createGlobalDefinition,
  updateGlobalDefinition,
};
