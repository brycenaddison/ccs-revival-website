/**
 * A player named inline in a sentence: champion, then name, in the side's color, linking to the
 * profile when there is one. The one way an event mentions a person.
 */

import { cn } from "../../../lib/cn";
import { ChampionIcon } from "../../ChampionIcon";
import { PlayerLink } from "../../profile/PlayerLink";
import { useGameView } from "../GameView";

export function PlayerChip({ id }: { id: number | undefined }) {
  const { participants, lookups } = useGameView();
  const player = id === undefined ? undefined : participants[id];

  if (!player) return <span className="font-semibold text-text-secondary">an unknown player</span>;

  return (
    <PlayerLink
      profileId={player.profileId}
      title={player.riotName}
      className={cn(
        "inline-flex items-baseline gap-1 align-baseline font-semibold no-underline hover:underline",
        player.teamId === 100 ? "text-side-blue" : "text-side-red",
      )}
    >
      <ChampionIcon champion={player.championId} lookup={lookups.champions} size={16} tile decorative className="inline-flex self-center" />
      {player.displayName}
    </PlayerLink>
  );
}
