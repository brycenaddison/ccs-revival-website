/**
 * One game, as the match viewer reads it: the Riot payload, the Riot timeline, and the league's
 * context for both.
 *
 * Three reads, and the shape of each answer is the whole story:
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
 *    Nothing else reachable from a bare match id says any of that (`API-GAP-ANALYSIS.md` §20). It is
 *    mapped defensively like every other read of our own server, and **it does not exist upstream
 *    yet**: the route answers `404` today, which `getOne` resolves to `null`, so the viewer renders
 *    Riot IDs and "Blue side" / "Red side" and links nothing until it lands. No client change when it
 *    does.
 *
 * `matchData` lived in `client.ts` before the timeline read existed and moved here to sit beside it;
 * the barrel exports it under the same name.
 */

import { getOne, type RequestOpts } from "./http";
import { mapPhaseRef, mapTeamMetadata, type PhaseRef, type TeamMetadata } from "./profiles";
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
  /** Keyed by team code. A code whose team row is gone is simply absent; fall back to the code. */
  teams: Record<string, TeamMetadata>;
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
  };
}

function mapTeams(value: unknown): Record<string, TeamMetadata> {
  const out: Record<string, TeamMetadata> = {};
  const raw = asRaw(value);
  for (const [code, team] of Object.entries(raw)) {
    const mapped = mapTeamMetadata(team);
    if (mapped !== null) out[code] = { ...mapped, code: mapped.code || code };
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
    teams: mapTeams(r.teams),
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

export const gameApi = { matchData, matchTimeline, gameContext };
