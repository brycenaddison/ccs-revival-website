/**
 * One game, as the match viewer reads it: the Riot payload, the Riot timeline, and the league's
 * context for both.
 *
 * Four reads, and the shape of each answer is the whole story:
 *
 *  - `GET /m/:matchId` and `GET /m/:matchId/timeline` are **pass-throughs**. Upstream stores Riot's
 *    document as jsonb and serves it verbatim, so there is nothing to map: the types in
 *    `lib/riot/matchV5.ts` describe Riot's schema, and the viewer checks the envelope once
 *    (`isRenderableMatch`) rather than coercing every column. Both answer JSON `null` for a game that
 *    is not stored, which `getOne` already resolves to `null`. A payload with no timeline is normal:
 *    Riot keeps timelines for a shorter window than matches, and a game ingested after its timeline
 *    aged out has one row and not the other.
 *  - `GET /m/:matchId/context` is **ours**, and it is what makes a Riot payload a league game: the
 *    conference, the fixture, the two teams' metadata, and which profile each puuid belongs to.
 *    Nothing else reachable from a bare match id says any of that. It is mapped defensively like
 *    every other read of our own server. When a deployment lacks this route, `getOne` resolves its
 *    `404` to `null`, so the viewer falls back to Riot IDs and "Blue side" / "Red side" without links.
 *  - `GET /m/:matchId/draft` is the stored Drafter draft, with the same visibility and session rule
 *    as the context read. Its `404` (plain text) means the game has no draft, never an error.
 *
 * `matchData` lived in `client.ts` before the timeline read existed and moved here to sit beside it;
 * the barrel exports it under the same name.
 */

import { getOne, type RequestOpts } from "./http";
import { mapPhaseRef, mapTeamMetadata, type PhaseRef, type TeamMetadata } from "./profiles";
import { httpsUrl, normalizeRole, teamIdOf, type Role } from "./normalize";
import { DRAFT_MODES, DRAFT_ROLES, DRAFT_SIDES, draftLink, type DraftMode, type DraftRole, type DraftSide } from "./drafts";
import type { RiotMatch, RiotTimeline } from "../riot/matchV5";

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function matchData(matchId: string, opts?: RequestOpts): Promise<RiotMatch | null> {
  return getOne<RiotMatch>(`/m/${encodeURIComponent(matchId)}`, opts);
}

export function matchTimeline(matchId: string, opts?: RequestOpts): Promise<RiotTimeline | null> {
  return getOne<RiotTimeline>(`/m/${encodeURIComponent(matchId)}/timeline`, opts);
}

// ---------------------------------------------------------------------------------------- context

/** One puuid the league knows something about. A puuid with no profile keeps its row, nulled. */
export interface GameContextParticipant {
  puuid: string;
  profileId: number | null;
  /** The profile's display name. `null` when unlinked; the viewer falls back to the Riot ID. */
  name: string | null;
  /** Team code, from the performance row. `null` if upstream could not attribute the line. */
  team: string | null;
  /** `teams.id` of that line, and the key into `GameContext.teamsById`. Not Riot's 100/200 side. */
  teamId: number | null;
}

export interface GameContext {
  matchId: string;
  conf: string;
  /** `tournaments.name`. */
  league: string;
  /** `tournaments.codename`, the division label every selector shows. Null when unset. */
  codename: string | null;
  /** The fixture, when the game was linked to one. Null on legacy rows. */
  scheduleMatchId: number | null;
  /** 1-based game within that fixture. Null with `scheduleMatchId`. */
  game: number | null;
  bestOf: number | null;
  phase: PhaseRef | null;
  winner: string | null;
  loser: string | null;
  winnerTeamId: number | null;
  loserTeamId: number | null;
  /**
   * Keyed by `teams.id`. A team whose row is gone is simply absent; fall back to the recorded code.
   * The code-keyed `teams` the wire also carries is not read: a code can pass to another team.
   */
  teamsById: Record<number, TeamMetadata>;
  participants: GameContextParticipant[];
}

function mapParticipant(value: unknown): GameContextParticipant | null {
  const r = asRaw(value);
  const puuid = strOrNull(r.puuid);
  if (puuid === null) return null;
  return {
    puuid,
    profileId: intOrNull(r.profileId),
    name: strOrNull(r.name),
    team: strOrNull(r.team),
    teamId: teamIdOf(r.teamId),
  };
}

function mapTeamsById(value: unknown): Record<number, TeamMetadata> {
  const out: Record<number, TeamMetadata> = {};
  // Keyed by each value's own `id` rather than the object key, which arrives as a string.
  for (const team of Object.values(asRaw(value))) {
    const mapped = mapTeamMetadata(team);
    if (mapped !== null) out[mapped.id] = mapped;
  }
  return out;
}

export function mapGameContext(value: unknown): GameContext | null {
  const r = asRaw(value);
  const matchId = strOrNull(r.matchId);
  const conf = strOrNull(r.conf);
  // A context with no conference places the game nowhere, which is what `null` already means.
  if (matchId === null || conf === null) return null;
  return {
    matchId,
    conf,
    league: strOrNull(r.league) ?? conf,
    codename: strOrNull(r.codename),
    scheduleMatchId: intOrNull(r.scheduleMatchId),
    game: intOrNull(r.game),
    bestOf: intOrNull(r.bestOf),
    phase: mapPhaseRef(r.phase),
    winner: strOrNull(r.winner),
    loser: strOrNull(r.loser),
    winnerTeamId: teamIdOf(r.winnerTeamId),
    loserTeamId: teamIdOf(r.loserTeamId),
    teamsById: mapTeamsById(r.teamsById),
    participants: arr(r.participants)
      .map(mapParticipant)
      .filter((p): p is GameContextParticipant => p !== null),
  };
}

export function gameContext(matchId: string, opts?: RequestOpts): Promise<GameContext | null> {
  return getOne<Raw>(`/m/${encodeURIComponent(matchId)}/context`, opts).then(raw =>
    raw === null ? null : mapGameContext(raw),
  );
}

// ------------------------------------------------------------------------------------------ draft

export const GAME_DRAFT_LOCKOUT_REASONS = ["disabled", "fearless", "ironman"] as const;
export type GameDraftLockoutReason = (typeof GAME_DRAFT_LOCKOUT_REASONS)[number];

/** Turns are global within each kind, 1–10 for bans and 1–10 for picks, owned upstream. */
export const DRAFT_TURN_MAX = 10;

export interface GameDraftBan {
  turn: number;
  /** Null for a skipped ban, which keeps its slot. */
  championId: number | null;
  champion: string | null;
  icon: string | null;
}

export interface GameDraftPick {
  turn: number;
  championId: number;
  champion: string | null;
  icon: string | null;
  /** The role confirmed in the draft room; null without role confirmation. */
  assignedRole: DraftRole | null;
  /** Riot's role for whoever played the champion. */
  playedRole: Role | null;
  profileId: number | null;
  name: string | null;
  blind: boolean | null;
}

export interface GameDraftSide {
  /** The draft's side, which need not be the lobby side. */
  side: DraftSide;
  teamId: number | null;
  /** Null only when the team row has been removed. */
  team: TeamMetadata | null;
  firstPick: boolean;
  bans: GameDraftBan[];
  picks: GameDraftPick[];
}

export interface GameDraftLockout {
  championId: number;
  champion: string | null;
  icon: string | null;
  reason: GameDraftLockoutReason;
  /** The earlier game that locked it; null for the series' disabled list. */
  game: number | null;
}

export interface GameDraft {
  matchId: string;
  conf: string | null;
  drafterSeriesId: string;
  /** The Drafter room. */
  url: string | null;
  game: number;
  mode: DraftMode | null;
  /**
   * Whether red could take first pick. Without it blue always picks first, so first pick says
   * nothing. Null on an older deployment.
   */
  firstSelection: boolean | null;
  patch: string | null;
  /** Blue then red, by the draft's own sides. */
  sides: GameDraftSide[];
  unavailable: GameDraftLockout[];
}

const turnOf = (value: unknown): number | null => {
  const turn = intOrNull(value);
  return turn !== null && turn >= 1 && turn <= DRAFT_TURN_MAX ? turn : null;
};
const enumOf = <T extends string>(value: unknown, values: readonly T[]): T | null =>
  typeof value === "string" && values.includes(value as T) ? value as T : null;

function mapDraftBan(value: unknown): GameDraftBan | null {
  const r = asRaw(value);
  const turn = turnOf(r.turn);
  if (turn === null) return null;
  return { turn, championId: intOrNull(r.championId), champion: strOrNull(r.champion), icon: httpsUrl(strOrNull(r.icon)) ?? null };
}

function mapDraftPick(value: unknown): GameDraftPick | null {
  const r = asRaw(value);
  const turn = turnOf(r.turn);
  const championId = intOrNull(r.championId);
  if (turn === null || championId === null) return null;
  return {
    turn,
    championId,
    champion: strOrNull(r.champion),
    icon: httpsUrl(strOrNull(r.icon)) ?? null,
    assignedRole: enumOf(r.assignedRole, DRAFT_ROLES),
    playedRole: normalizeRole(strOrNull(r.playedRole)),
    profileId: intOrNull(r.profileId),
    name: strOrNull(r.name),
    blind: typeof r.blind === "boolean" ? r.blind : null,
  };
}

function mapDraftSide(value: unknown): GameDraftSide | null {
  const r = asRaw(value);
  const side = enumOf(r.side, DRAFT_SIDES);
  if (side === null) return null;
  return {
    side,
    teamId: teamIdOf(r.teamId),
    team: mapTeamMetadata(r.team),
    firstPick: r.firstPick === true,
    bans: arr(r.bans).flatMap(b => mapDraftBan(b) ?? []),
    picks: arr(r.picks).flatMap(p => mapDraftPick(p) ?? []),
  };
}

function mapLockout(value: unknown): GameDraftLockout | null {
  const r = asRaw(value);
  const championId = intOrNull(r.championId);
  const reason = enumOf(r.reason, GAME_DRAFT_LOCKOUT_REASONS);
  if (championId === null || reason === null) return null;
  return { championId, champion: strOrNull(r.champion), icon: httpsUrl(strOrNull(r.icon)) ?? null, reason, game: intOrNull(r.game) };
}

function mapGameDraft(value: unknown): GameDraft | null {
  const r = asRaw(value);
  const matchId = strOrNull(r.matchId);
  const drafterSeriesId = strOrNull(r.drafterSeriesId);
  const game = intOrNull(r.game);
  const sides = arr(r.sides).flatMap(s => mapDraftSide(s) ?? []);
  // A board needs both sides; anything less is not the payload.
  if (matchId === null || drafterSeriesId === null || game === null || sides.length !== 2) return null;
  return {
    matchId,
    conf: strOrNull(r.conf),
    drafterSeriesId,
    url: draftLink(r.url),
    game,
    mode: enumOf(r.mode, DRAFT_MODES),
    firstSelection: typeof r.firstSelection === "boolean" ? r.firstSelection : null,
    patch: strOrNull(r.patch),
    sides: [...sides].sort((a, b) => DRAFT_SIDES.indexOf(a.side) - DRAFT_SIDES.indexOf(b.side)),
    unavailable: arr(r.unavailable).flatMap(u => mapLockout(u) ?? []),
  };
}

/**
 * The stored draft for one played game, or null when it has none. Upstream answers 404 for any game
 * whose tournament code does not link it to a draft with exactly its ten champions, which `getOne`
 * resolves to null. A hidden conference is the same 400 the context read answers.
 */
export function gameDraft(matchId: string, opts?: RequestOpts): Promise<GameDraft | null> {
  return getOne<Raw>(`/m/${encodeURIComponent(matchId)}/draft`, opts).then(raw =>
    raw === null ? null : mapGameDraft(raw),
  );
}

export const gameApi = { matchData, matchTimeline, gameContext, gameDraft };
