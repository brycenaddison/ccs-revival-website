/**
 * Every kill in the filtered events, placed on Summoner's Rift.
 *
 * Positions come in Riot's map units (roughly 0 to 14,900 on both axes, origin bottom-left) and are
 * placed in percent, so the map is as wide as its column and shrinks on a phone; the original drew a
 * fixed 512px square. The offsets are the ones the original settled on by eye against the client's
 * minimap. Kills involving a hovered player stay bright and the rest fade, so a reader scanning one
 * player's deaths can find them.
 */

import riftMap from "../../../assets/rift-map.png";
import { cn } from "../../../lib/cn";
import { fmtTimestamp } from "../../../lib/game/timelineStats";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { EventText } from "./EventText";
import { useTimelineView } from "./TimelineTab";

const MAP_UNITS = 14_920;
const OFFSET_X = 40;

export function RiftMap() {
  const { events, hoveredPlayer } = useTimelineView();
  const kills = events.filter(e => e.type === "CHAMPION_KILL");

  return (
    // `self-start`: the map is a flex item beside a taller chart, and a stretched item's height wins
    // over `aspect-square`, which is what squashed it. Fixed square from `lg`, fluid square below.
    <div className="relative aspect-square w-full max-w-[420px] self-start overflow-hidden rounded-lg border border-border lg:h-[420px] lg:w-[420px]">
      <img src={riftMap} alt="Summoner's Rift" className="block h-full w-full select-none object-contain" draggable={false} />
      {kills.map((event, index) => {
        if (event.type !== "CHAMPION_KILL") return null;
        const involved =
          hoveredPlayer === undefined ||
          hoveredPlayer === event.killerId ||
          hoveredPlayer === event.victimId ||
          (event.assistingParticipantIds ?? []).includes(hoveredPlayer);
        return (
          <Tooltip key={`${event.timestamp}-${index}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Kill at ${fmtTimestamp(event.timestamp)}`}
                className={cn(
                  "absolute size-3 cursor-pointer rounded-full border-2 border-bg transition-opacity",
                  event.team === 100 ? "bg-side-blue" : "bg-side-red",
                  involved ? "opacity-100" : "opacity-20",
                )}
                style={{
                  left: `${((event.position.x + OFFSET_X) / MAP_UNITS) * 100}%`,
                  bottom: `${(event.position.y / MAP_UNITS) * 100}%`,
                  translate: "-50% 50%",
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="m-0 leading-relaxed">
                <span className="font-mono text-text-bright">{fmtTimestamp(event.timestamp)}</span> <EventText event={event} />
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
