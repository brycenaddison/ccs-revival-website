/**
 * The ten people in a game, with everything the viewer needs to name and link them.
 *
 * Built once by `pages/GameDetail.tsx` and passed to every tab, because the join it does is the one
 * every component would otherwise repeat: the Riot payload identifies a player by `puuid` and
 * `participantId` (the timeline's key), while the league knows them by `profileId` and their team by
 * code, and only `GET /m/:matchId/context` connects the two. When that read is absent, or a puuid is
 * not linked to a profile, the fallback to a Riot ID is decided **here and nowhere else**, so a name
 * cannot read one way on the scoreboard and another in the event list.
 *
 * Keyed by `participantId` rather than puuid: the timeline never mentions a puuid outside its own
 * participant list, and every event names players by id.
 */

import type { GameContext } from "../api";
import { normalizeRole, type Role } from "../api";
import type { RiotMatch, RiotParticipant, RiotTeamId } from "../riot/matchV5";

export interface GameParticipant {
  /** 1 to 10. The timeline's key for this player. */
  participantId: number;
  puuid: string;
  teamId: RiotTeamId;
  championId: number;
  role: Role | null;
  /** `gameName#tag`, else the legacy summoner name, else "Unknown". Always renderable. */
  riotName: string;
  /** From the context read. `null` when the puuid is unlinked or the context is absent. */
  profileId: number | null;
  /** The profile's display name when the context has one, otherwise `riotName`. */
  displayName: string;
  /** Team code from the context, otherwise `null`. */
  team: string | null;
  /** The participant row itself, for the components that read its statistics. */
  raw: RiotParticipant;
}

export type Participants = Record<number, GameParticipant>;

/** The Riot ID as a person would write it, with the fallbacks in the order Riot deprecated them. */
export function riotNameOf(p: Pick<RiotParticipant, "riotIdGameName" | "riotIdTagline" | "summonerName">): string {
  const game = p.riotIdGameName?.trim();
  if (game) {
    const tag = p.riotIdTagline?.trim();
    return tag ? `${game}#${tag}` : game;
  }
  const legacy = p.summonerName?.trim();
  return legacy || "Unknown";
}

export function buildParticipants(match: RiotMatch, context: GameContext | null): Participants {
  const byPuuid = new Map(context?.participants.map(c => [c.puuid, c] as const) ?? []);
  const out: Participants = {};

  for (const raw of match.info?.participants ?? []) {
    const linked = byPuuid.get(raw.puuid);
    const riotName = riotNameOf(raw);
    out[raw.participantId] = {
      participantId: raw.participantId,
      puuid: raw.puuid,
      teamId: raw.teamId,
      championId: raw.championId,
      role: normalizeRole(raw.teamPosition),
      riotName,
      profileId: linked?.profileId ?? null,
      displayName: linked?.name?.trim() || riotName,
      team: linked?.team ?? null,
      raw,
    };
  }

  return out;
}

/** The participants of one side, in payload order (which is lane order on a tournament game). */
export function sidePlayers(participants: Participants, teamId: RiotTeamId): GameParticipant[] {
  return Object.values(participants).filter(p => p.teamId === teamId);
}

/**
 * The team code of a side, when the context knows it.
 *
 * Read off the players rather than off `winner`/`loser`, because the context says who won and not
 * which end of the map they started on; the payload says the latter and the players are the bridge.
 */
export function sideTeamCode(participants: Participants, teamId: RiotTeamId): string | null {
  for (const p of Object.values(participants)) {
    if (p.teamId === teamId && p.team !== null) return p.team;
  }
  return null;
}
