/**
 * Ten champion icons to narrow the timeline to some players. Hover previews, click toggles, and
 * selecting everyone is the same as selecting nobody, so the selection clears itself at nine.
 */

import { X } from "lucide-react";
import { cn } from "../../../lib/cn";
import { ChampionIcon } from "../../ChampionIcon";
import { Button } from "../../ui/button";
import { useGameView } from "../GameView";
import { useTimelineView } from "./TimelineTab";

export function PlayerSelector() {
  const { lookups } = useGameView();
  const { participants, selectedPlayers, hoveredPlayer, setHoveredPlayer, setSelectedPlayers } = useTimelineView();
  const players = Object.values(participants);

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1" role="group" aria-label="Filter by player">
      {players.map((player, i) => {
        const id = player.participantId;
        const active = selectedPlayers.length === 0 || selectedPlayers.includes(id);
        const hovered = hoveredPlayer === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selectedPlayers.includes(id)}
            aria-label={player.displayName}
            title={player.displayName}
            onMouseEnter={() => setHoveredPlayer(id)}
            onMouseLeave={() => setHoveredPlayer(undefined)}
            onFocus={() => setHoveredPlayer(id)}
            onBlur={() => setHoveredPlayer(undefined)}
            onClick={() =>
              setSelectedPlayers(ids => {
                if (ids.includes(id)) return ids.filter(other => other !== id);
                const next = [...ids, id];
                return next.length >= players.length ? [] : next;
              })
            }
            className={cn(
              "cursor-pointer rounded-md p-0.5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              !active && !hovered && "opacity-40 grayscale",
              i === 4 && "mr-3",
            )}
          >
            <ChampionIcon
              champion={player.championId}
              lookup={lookups.champions}
              size={36}
              decorative
              tile
                    className="flex"
            />
          </button>
        );
      })}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Clear player selection"
        disabled={selectedPlayers.length === 0}
        onClick={() => setSelectedPlayers([])}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
