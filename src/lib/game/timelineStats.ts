/**
 * Reductions over a Riot timeline: item builds, skill orders, and a stat's value over time.
 *
 * Everything here is a single pass over frames the page has already loaded, keyed by `participantId`
 * (the timeline's own key; the original re-keyed every result by puuid because it had nothing else to
 * join on, and that step is gone). None of it is something the API should answer instead: a build
 * path and a gold curve are presentation of one document, not statistics anybody aggregates.
 */

import type { Participants } from "./participants";
import type {
  RenderableTimeline,
  RiotParticipantFrame,
  RiotTeamId,
  RiotTimelineEvent,
} from "../riot/matchV5";

/** One player's shop visits, grouped by the minute they happened. */
export type ItemBuild = {
  minute: number;
  items: { id: number; sold: boolean; quantity: number }[];
}[];

/**
 * Drops each `ITEM_UNDO` together with the purchase or sale it undid: Riot records the transaction
 * and the undo as two events, and a build path that showed both would list an item the player never
 * left the shop with.
 */
function withoutUndos(events: RiotTimelineEvent[]): RiotTimelineEvent[] {
  const kept: RiotTimelineEvent[] = [];
  for (const event of events) {
    if (event.type === "ITEM_UNDO") {
      for (let i = kept.length - 1; i >= 0; i--) {
        const t = kept[i];
        if ((t.type === "ITEM_PURCHASED" || t.type === "ITEM_SOLD") && t.participantId === event.participantId) {
          kept.splice(i, 1);
          break;
        }
      }
    } else {
      kept.push(event);
    }
  }
  return kept;
}

/** A timeline timestamp (milliseconds) as `m:ss`. */
export function fmtTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getItemBuilds(timeline: RenderableTimeline): Record<number, ItemBuild> {
  const builds: Record<number, ItemBuild> = Object.fromEntries(
    timeline.info.participants.map(({ participantId }) => [participantId, []]),
  );

  const transactions = timeline.info.frames.flatMap(frame =>
    frame.events.filter(e => e.type === "ITEM_PURCHASED" || e.type === "ITEM_SOLD" || e.type === "ITEM_UNDO"),
  );

  for (const t of withoutUndos(transactions)) {
    if (t.type !== "ITEM_PURCHASED" && t.type !== "ITEM_SOLD") continue;
    const build = builds[t.participantId];
    if (!build) continue;

    const minute = Math.round(t.timestamp / 60_000);
    let visit = build.find(b => b.minute === minute);
    if (!visit) {
      visit = { minute, items: [] };
      build.push(visit);
    }

    const sold = t.type === "ITEM_SOLD";
    const existing = visit.items.find(i => i.id === t.itemId && i.sold === sold);
    if (existing) existing.quantity += 1;
    else visit.items.push({ id: t.itemId, sold, quantity: 1 });
  }

  return builds;
}

/** Each player's skill points in the order they were spent: 1 to 4 for Q, W, E, R. */
export function getSkillOrders(timeline: RenderableTimeline): Record<number, number[]> {
  const orders: Record<number, number[]> = Object.fromEntries(
    timeline.info.participants.map(({ participantId }) => [participantId, []]),
  );
  for (const frame of timeline.info.frames) {
    for (const event of frame.events) {
      if (event.type === "SKILL_LEVEL_UP") orders[event.participantId]?.push(event.skillSlot);
    }
  }
  return orders;
}

/** The participant frames at a given minute, or null when the game did not reach it. */
export function frameAt(timeline: RenderableTimeline, minute: number): Record<string, RiotParticipantFrame> | null {
  return timeline.info.frames[minute]?.participantFrames ?? null;
}

/** A stat's total at one timestamp. */
export interface StatPoint {
  timestamp: number;
  value: number;
}

/** A participant frame with the kill counts up to that frame, which Riot keeps in events instead. */
export type EnhancedParticipantFrame = RiotParticipantFrame & {
  kills: number;
  deaths: number;
  assists: number;
};

export interface StatSeries {
  /** Each player's value at each frame. */
  participants: Record<number, { participantId: number; teamId: RiotTeamId; points: StatPoint[] }>;
  blue: StatPoint[];
  red: StatPoint[];
  /** Blue minus red at each frame. */
  difference: StatPoint[];
}

/**
 * One stat, for every player and both teams, at every frame.
 *
 * Kill counts are accumulated from `CHAMPION_KILL` events as the frames go by, so a `stat` reading
 * `frame.kills` gets the count at that minute. Team totals are sums of the players on each side.
 */
export function getStatSeries(
  participants: Participants,
  timeline: RenderableTimeline,
  stat: (frame: EnhancedParticipantFrame) => number,
): StatSeries {
  const perPlayer: StatSeries["participants"] = {};
  const tally: Record<number, { kills: number; deaths: number; assists: number }> = {};
  for (const { participantId } of timeline.info.participants) {
    const teamId = participants[participantId]?.teamId ?? (participantId <= 5 ? 100 : 200);
    perPlayer[participantId] = { participantId, teamId, points: [] };
    tally[participantId] = { kills: 0, deaths: 0, assists: 0 };
  }

  const blue: StatPoint[] = [];
  const red: StatPoint[] = [];
  const difference: StatPoint[] = [];

  for (const { timestamp, participantFrames, events } of timeline.info.frames) {
    for (const event of events) {
      if (event.type !== "CHAMPION_KILL") continue;
      if (tally[event.victimId]) tally[event.victimId].deaths += 1;
      if (event.killerId !== undefined && tally[event.killerId]) tally[event.killerId].kills += 1;
      for (const id of event.assistingParticipantIds ?? []) if (tally[id]) tally[id].assists += 1;
    }

    let blueTotal = 0;
    let redTotal = 0;
    for (const [key, frame] of Object.entries(participantFrames)) {
      const id = Number(key);
      const entry = perPlayer[id];
      if (!entry) continue;
      const value = stat({ ...frame, ...tally[id] });
      entry.points.push({ timestamp, value });
      if (entry.teamId === 100) blueTotal += value;
      else redTotal += value;
    }
    blue.push({ timestamp, value: blueTotal });
    red.push({ timestamp, value: redTotal });
    difference.push({ timestamp, value: blueTotal - redTotal });
  }

  return { participants: perPlayer, blue, red, difference };
}

/** When the game ended, in minutes, from the `GAME_END` event; the last frame's minute otherwise. */
export function gameLengthMinutes(timeline: RenderableTimeline): number {
  const frames = timeline.info.frames;
  const end = frames[frames.length - 1]?.events.find(e => e.type === "GAME_END");
  const ms = end?.timestamp ?? frames[frames.length - 1]?.timestamp ?? 0;
  return Math.max(1, Math.round(ms / 60_000));
}
