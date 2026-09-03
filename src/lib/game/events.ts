/**
 * The timeline's events as a list a reader can filter: who was involved, which side it belonged to,
 * and the special-kill annotation folded onto the kill it describes.
 *
 * Riot emits a `CHAMPION_SPECIAL_KILL` (first blood, multi kill, ace) as a separate event right after
 * the `CHAMPION_KILL` it qualifies. The two are one sentence to a reader, so the list carries the
 * special kill on the kill event and never as a row of its own.
 */

import type { Participants } from "./participants";
import type { RenderableTimeline, RiotEventType, RiotTeamId, RiotTimelineEvent } from "../riot/matchV5";

export type ListEvent = RiotTimelineEvent & {
  /** The side the event most belongs to; undefined for a pause or an unknown type. */
  team?: RiotTeamId;
  /** Only on a `CHAMPION_KILL`: the first-blood, multi-kill or ace annotation Riot emitted after it. */
  specialKill?: RiotTimelineEvent<"CHAMPION_SPECIAL_KILL">;
};

/** The event types the list can show, with the words a reader would use for them. */
export const EVENT_NAMES: Partial<Record<RiotEventType, string>> = {
  CHAMPION_KILL: "Champion kills",
  ELITE_MONSTER_KILL: "Epic monster kills",
  BUILDING_KILL: "Building kills",
  TURRET_PLATE_DESTROYED: "Turret plates",
  DRAGON_SOUL_GIVEN: "Dragon souls",
  OBJECTIVE_BOUNTY_PRESTART: "Objective bounties starting",
  OBJECTIVE_BOUNTY_FINISH: "Objective bounties ending",
  LEVEL_UP: "Level ups",
  WARD_PLACED: "Wards placed",
  WARD_KILL: "Wards killed",
  PAUSE_START: "Game pauses",
  GAME_END: "Game end",
};

/** Off by default: the list opens on fights and objectives, not every ward and level. */
export const DEFAULT_EXCLUDED: readonly RiotEventType[] = [
  "PAUSE_END",
  "ITEM_DESTROYED",
  "ITEM_PURCHASED",
  "ITEM_SOLD",
  "ITEM_UNDO",
  "SKILL_LEVEL_UP",
  "LEVEL_UP",
  "WARD_KILL",
  "WARD_PLACED",
  "FEAT_UPDATE",
];

function includesAny(ids: readonly number[], ...candidates: (number | undefined | number[])[]): boolean {
  const related = candidates.flat().filter((v): v is number => v !== undefined);
  return ids.some(id => related.includes(id));
}

/** Whether any of the selected players took part. An empty selection means everyone. */
export function arePlayersInvolved(participants: Participants, ids: readonly number[], event: RiotTimelineEvent): boolean {
  if (ids.length === 0) return true;
  switch (event.type) {
    case "BUILDING_KILL":
    case "TURRET_PLATE_DESTROYED":
    case "WARD_KILL":
    case "CHAMPION_SPECIAL_KILL":
      return includesAny(ids, event.killerId, "assistingParticipantIds" in event ? event.assistingParticipantIds : undefined);
    case "CHAMPION_KILL":
      return includesAny(ids, event.victimId, event.killerId, event.assistingParticipantIds);
    case "ELITE_MONSTER_KILL":
      return includesAny(ids, event.killerId, event.assistingParticipantIds) ||
        ids.some(id => participants[id]?.teamId === event.killerTeamId);
    case "LEVEL_UP":
    case "SKILL_LEVEL_UP":
    case "ITEM_PURCHASED":
    case "ITEM_SOLD":
    case "ITEM_DESTROYED":
    case "ITEM_UNDO":
      return includesAny(ids, event.participantId);
    case "WARD_PLACED":
      return includesAny(ids, event.creatorId);
    default:
      return false;
  }
}

/**
 * The side an event belongs to. A kill belongs to the killer's side, so the victim's side inverted; a
 * building kill is recorded against the team that lost it, so that inverts too.
 */
export function associatedTeam(participants: Participants, event: RiotTimelineEvent): RiotTeamId | undefined {
  const teamOf = (id: number | undefined): RiotTeamId | undefined =>
    id === undefined ? undefined : participants[id]?.teamId;
  const other = (team: RiotTeamId | undefined): RiotTeamId | undefined =>
    team === undefined ? undefined : team === 100 ? 200 : 100;

  switch (event.type) {
    case "BUILDING_KILL":
    case "TURRET_PLATE_DESTROYED":
      return other(event.teamId);
    case "CHAMPION_KILL":
      return teamOf(event.killerId) ?? other(teamOf(event.victimId));
    case "CHAMPION_SPECIAL_KILL":
    case "WARD_KILL":
      return teamOf(event.killerId);
    case "ELITE_MONSTER_KILL":
      return event.killerTeamId ?? teamOf(event.killerId);
    case "GAME_END":
      return event.winningTeam;
    case "ITEM_DESTROYED":
    case "ITEM_PURCHASED":
    case "ITEM_SOLD":
    case "ITEM_UNDO":
    case "LEVEL_UP":
    case "SKILL_LEVEL_UP":
      return teamOf(event.participantId);
    case "OBJECTIVE_BOUNTY_FINISH":
    case "OBJECTIVE_BOUNTY_PRESTART":
    case "DRAGON_SOUL_GIVEN":
    case "FEAT_UPDATE":
      return event.teamId;
    case "WARD_PLACED":
      return teamOf(event.creatorId);
    default:
      return undefined;
  }
}

/**
 * Every event the filters allow, in order, with special kills folded onto their kills.
 *
 * Teemo's mushrooms are `WARD_PLACED` events too, dozens of them a game, and are dropped: nobody
 * reading a match timeline wants them listed as wards.
 */
export function buildEventList(
  timeline: RenderableTimeline,
  participants: Participants,
  excluded: readonly RiotEventType[],
  selectedPlayers: readonly number[],
): ListEvent[] {
  const out: ListEvent[] = [];
  let lastKill: ListEvent | undefined;

  for (const frame of timeline.info.frames) {
    for (const raw of frame.events) {
      if (raw.type === "CHAMPION_SPECIAL_KILL") {
        if (lastKill && lastKill.type === "CHAMPION_KILL") lastKill.specialKill = raw;
        continue;
      }
      if (excluded.includes(raw.type)) continue;
      if (raw.type === "WARD_PLACED" && raw.wardType === "TEEMO_MUSHROOM") continue;

      const event: ListEvent = { ...raw, team: associatedTeam(participants, raw) };
      if (event.type === "CHAMPION_KILL") lastKill = event;
      if (arePlayersInvolved(participants, selectedPlayers, raw)) out.push(event);
    }
  }

  return out;
}
