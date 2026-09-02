/**
 * The post-game scoreboard: two team cards, five rows each, in the client's arrangement.
 *
 * Blue side first, red second, as the client draws it and as the payload orders it. The last two
 * columns of every row rotate through three stats each (damage, damage taken, crowd control; gold,
 * farm, vision) from the switchers in the blue team's header, and both team cards follow the same
 * choice. That state is two `useState`s here and nothing more.
 *
 * **One grid for the whole board**, at every size, and each team card is a nested subgrid of it: the
 * card, its header, its rows and its footer all lay out in the same seven tracks (`density.ts`), which
 * is what puts the switchers over the columns they drive and lines the two cards' columns up with each
 * other. The name track grows to fill the container and never shrinks below a name; a board wider than
 * its container breaks out to the window edges and scrolls, the way the bracket does
 * (`layout/FullBleedScroller.tsx`).
 */

import { useState } from "react";
import { cn } from "../../../lib/cn";
import type { RiotTeamId } from "../../../lib/riot/matchV5";
import { sidePlayers } from "../../../lib/game/participants";
import { FullBleedScroller } from "../../layout/FullBleedScroller";
import { useGameView } from "../GameView";
import { DENSITY, gridTemplate } from "./density";
import { PlayerRow } from "./PlayerRow";
import type { DamageStat, FarmStat } from "./StatSwitcher";
import { TeamFooter } from "./TeamFooter";
import { TeamHeader } from "./TeamHeader";

export function Scoreboard() {
  const { match, participants, size } = useGameView();
  const density = DENSITY[size];
  const [damageStat, setDamageStat] = useState<DamageStat>("damage");
  const [farmStat, setFarmStat] = useState<FarmStat>("gold");

  const all = match.info.participants;
  // Each meter is relative to the best value in the game, on both teams, so the longest bar is always
  // the game's leader and not a team's.
  const maxima = {
    damage: Math.max(1, ...all.map(p => p.totalDamageDealtToChampions)),
    damageTaken: Math.max(1, ...all.map(p => p.totalDamageTaken)),
    cc: Math.max(1, ...all.map(p => p.timeCCingOthers)),
  };

  const card = (teamId: RiotTeamId, withSwitchers: boolean) => (
    <section className="col-span-7 grid grid-cols-subgrid overflow-hidden rounded-lg border border-border bg-bg2">
      <TeamHeader
        teamId={teamId}
        density={density}
        switchers={withSwitchers ? { damage: [damageStat, setDamageStat], farm: [farmStat, setFarmStat] } : null}
      />
      {sidePlayers(participants, teamId).map(p => (
        <PlayerRow key={p.participantId} player={p} density={density} damageStat={damageStat} farmStat={farmStat} maxima={maxima} />
      ))}
      <TeamFooter teamId={teamId} density={density} className="col-span-7" />
    </section>
  );

  return (
    <FullBleedScroller label="Scroll the scoreboard">
      {/* `min-w-min`, not `min-w-max`: the stat tracks are allowed to compact toward their content
          before the board overflows (see `gridTemplate`), and a max-content floor would hold them at
          their full width and spend the difference on a scrollbar. */}
      <div className={cn("grid w-full min-w-min", density.rowGap)} style={{ gridTemplateColumns: gridTemplate(density) }}>
        {card(100, true)}
        <div className="col-span-7 h-3" aria-hidden="true" />
        {card(200, false)}
      </div>
    </FullBleedScroller>
  );
}
