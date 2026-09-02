/**
 * One timeline event as a sentence.
 *
 * Templates from the original viewer, with the player tokens rendered by `PlayerChip`. Riot's own
 * vocabulary is translated where a reader would not know it: `EARTH_DRAGON` is the Mountain Drake,
 * `INNER_TURRET` is the tier-two tower, a `killerId` of 0 is a minion or a monster.
 */

import { Fragment, type ReactNode } from "react";
import type { ListEvent } from "../../../lib/game/events";
import { fmtTimestamp } from "../../../lib/game/timelineStats";
import type { RiotDragonType, RiotLaneType, RiotTeamId, RiotWardType } from "../../../lib/riot/matchV5";
import { PlayerChip } from "./PlayerChip";

const MULTI_KILL: Record<number, string> = { 2: "double kill", 3: "triple kill", 4: "quadra kill", 5: "PENTAKILL" };

const SPREE: Record<number, string> = {
  3: "is on a killing spree",
  4: "is on a rampage",
  5: "is unstoppable",
  6: "is dominating",
  7: "is godlike",
  8: "is legendary",
};

const WARDS: Record<RiotWardType, string> = {
  YELLOW_TRINKET: "stealth ward",
  SIGHT_WARD: "stealth ward",
  BLUE_TRINKET: "farsight ward",
  CONTROL_WARD: "control ward",
  TEEMO_MUSHROOM: "Noxious Trap",
  UNDEFINED: "ward",
};

const DRAKES: Record<RiotDragonType, string> = {
  EARTH_DRAGON: "Mountain",
  FIRE_DRAGON: "Infernal",
  AIR_DRAGON: "Cloud",
  WATER_DRAGON: "Ocean",
  HEXTECH_DRAGON: "Hextech",
  CHEMTECH_DRAGON: "Chemtech",
  ELDER_DRAGON: "Elder",
};

const LANES: Record<RiotLaneType, string> = { BOT_LANE: "bot lane", MID_LANE: "mid lane", TOP_LANE: "top lane" };

const TOWER_TIER = { OUTER_TURRET: "tier-one", INNER_TURRET: "tier-two", BASE_TURRET: "tier-three" } as const;

const SIDE: Record<RiotTeamId, string> = { 100: "blue", 200: "red" };

/** A killer of 0 or none is a minion, a monster or a tower: Riot has no participant for those. */
function Killer({ id }: { id: number | undefined }) {
  return id === undefined || id === 0 ? <span className="text-text-secondary">A minion or monster</span> : <PlayerChip id={id} />;
}

/**
 * A chip that ends a sentence, with the period glued to it.
 *
 * A player chip is an inline block, and a full stop after one is its own word to the line breaker, so
 * on a narrow card the period alone could wrap to the next line. Keeping the two in one non-breaking
 * span is the fix; the chip's name still ellipsizes inside it if it must.
 */
function Last({ id }: { id: number }) {
  return (
    <span className="whitespace-nowrap">
      <PlayerChip id={id} />.
    </span>
  );
}

function AssistedBy({ ids }: { ids: number[] | undefined }) {
  if (!ids || ids.length === 0) return null;
  return (
    <>
      , assisted by{" "}
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && (i === ids.length - 1 ? " and " : ", ")}
          {i === ids.length - 1 ? <Last id={id} /> : <PlayerChip id={id} />}
        </Fragment>
      ))}
    </>
  );
}

export function EventText({ event }: { event: ListEvent }): ReactNode {
  switch (event.type) {
    case "CHAMPION_KILL": {
      const special = event.specialKill;
      const streak =
        event.killStreakLength > 8
          ? `, extending the streak to ${event.killStreakLength}`
          : event.killStreakLength >= 3
            ? ` and ${SPREE[event.killStreakLength]}`
            : null;
      const assists = event.assistingParticipantIds ?? [];
      // Whether the sentence ends on the victim's chip. When it does, the period rides inside `Last`
      // so it can't wrap alone; when a streak or the assists follow, the period follows text.
      const endsOnVictim = streak === null && assists.length === 0;
      const victim = endsOnVictim ? <Last id={event.victimId} /> : <PlayerChip id={event.victimId} />;

      let core: ReactNode;
      if (special?.killType === "KILL_MULTI") {
        core = (
          <>
            <PlayerChip id={special.killerId} /> gets a {MULTI_KILL[special.multiKillLength] ?? `${special.multiKillLength}-kill`} on{" "}
            {victim}
          </>
        );
      } else if (special?.killType === "KILL_ACE") {
        core = (
          <>
            <PlayerChip id={special.killerId} /> aces the enemy team by killing {victim}
          </>
        );
      } else if (special?.killType === "KILL_FIRST_BLOOD") {
        core = (
          <>
            <PlayerChip id={special.killerId} /> draws first blood against {victim}
          </>
        );
      } else if (event.killerId === undefined || event.killerId === 0) {
        core = (
          <>
            <PlayerChip id={event.victimId} /> is executed
          </>
        );
      } else {
        core = (
          <>
            <PlayerChip id={event.killerId} /> kills {victim}
          </>
        );
      }
      const executed = event.killerId === undefined || event.killerId === 0;
      return (
        <>
          {core}
          {streak}
          <AssistedBy ids={event.assistingParticipantIds} />
          {endsOnVictim && !executed ? null : assists.length > 0 ? null : "."}
        </>
      );
    }
    case "LEVEL_UP":
      return (
        <>
          <PlayerChip id={event.participantId} /> reaches level {event.level}.
        </>
      );
    case "SKILL_LEVEL_UP":
      return (
        <>
          <PlayerChip id={event.participantId} /> puts a point in {["Q", "W", "E", "R"][event.skillSlot - 1] ?? "an ability"}.
        </>
      );
    case "WARD_PLACED":
      return (
        <>
          <PlayerChip id={event.creatorId} /> places a {WARDS[event.wardType] ?? "ward"}.
        </>
      );
    case "WARD_KILL":
      return (
        <>
          <PlayerChip id={event.killerId} /> clears a {WARDS[event.wardType] ?? "ward"}.
        </>
      );
    case "ELITE_MONSTER_KILL": {
      const what =
        event.monsterType === "DRAGON"
          ? `the ${DRAKES[event.monsterSubType] ?? ""} Drake`.replace("  ", " ")
          : event.monsterType === "BARON_NASHOR"
            ? "Baron Nashor"
            : event.monsterType === "RIFTHERALD"
              ? "the Rift Herald"
              : event.monsterType === "ATAKHAN"
                ? "Atakhan"
                : "a Voidgrub";
      return (
        <>
          <Killer id={event.killerId} /> slays {what}
          <AssistedBy ids={event.assistingParticipantIds} />
          {(event.assistingParticipantIds?.length ?? 0) > 0 ? null : "."}
        </>
      );
    }
    case "TURRET_PLATE_DESTROYED":
      return (
        <>
          <Killer id={event.killerId} /> breaks a plate on the {SIDE[event.teamId]} side&apos;s {LANES[event.laneType]} tower.
        </>
      );
    case "BUILDING_KILL": {
      const name =
        event.buildingType === "INHIBITOR_BUILDING"
          ? `${LANES[event.laneType]} inhibitor`
          : event.towerType === "NEXUS_TURRET"
            ? "Nexus tower"
            : `${LANES[event.laneType]} ${TOWER_TIER[event.towerType]} tower`;
      return (
        <>
          <Killer id={event.killerId} /> destroys the {SIDE[event.teamId]} side&apos;s {name}
          <AssistedBy ids={event.assistingParticipantIds} />
          {(event.assistingParticipantIds?.length ?? 0) > 0 ? null : "."}
        </>
      );
    }
    case "OBJECTIVE_BOUNTY_PRESTART":
      return <>An objective bounty for the {SIDE[event.teamId]} side starts at {fmtTimestamp(event.actualStartTime)}.</>;
    case "OBJECTIVE_BOUNTY_FINISH":
      return <>The objective bounty for the {SIDE[event.teamId]} side ends.</>;
    case "DRAGON_SOUL_GIVEN":
      return <>The {SIDE[event.teamId]} side claims the {event.name} Soul.</>;
    case "GAME_END":
      return <>The game ends with the {SIDE[event.winningTeam]} side victorious.</>;
    case "PAUSE_END":
      return <>The game begins.</>;
    case "ITEM_PURCHASED":
    case "ITEM_SOLD":
    case "ITEM_DESTROYED":
    case "ITEM_UNDO":
      return (
        <>
          <PlayerChip id={event.participantId} />{" "}
          {event.type === "ITEM_PURCHASED"
            ? "buys an item"
            : event.type === "ITEM_SOLD"
              ? "sells an item"
              : event.type === "ITEM_DESTROYED"
                ? "uses an item"
                : "undoes a purchase"}
          .
        </>
      );
    default:
      return <span className="text-text-muted">{event.type.toLowerCase().replace(/_/g, " ")}.</span>;
  }
}
