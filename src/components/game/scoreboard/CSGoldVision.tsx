/**
 * A player's gold, farm or vision: a total over a rate, or the ward counts with a tooltip.
 *
 * Rates are per minute of *this player's* time in the game (`timePlayed`), falling back to the game's
 * length: a player who disconnected early has a rate over the time they were there.
 */

import { cn } from "../../../lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { Density } from "./density";
import type { FarmStat } from "./StatSwitcher";

export function CSGoldVision({
  stat,
  gold,
  cs,
  seconds,
  controlWards,
  wardsPlaced,
  wardsKilled,
  visionScore,
  density: d,
}: {
  stat: FarmStat;
  gold: number;
  cs: number;
  /** Time in the game, seconds. Null only on a payload with no duration at all. */
  seconds: number | null;
  controlWards: number;
  wardsPlaced: number;
  wardsKilled: number;
  visionScore: number;
  density: Density;
}) {
  const cell = cn("flex w-full min-w-0 flex-col items-center justify-center text-text-secondary", d.text);

  if (stat === "vision") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn(cell, "cursor-default rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/60")}>
            <span>
              <span className="font-mono font-semibold text-text-bright">{visionScore}</span> VS
            </span>
            <span className="text-[0.85em]">
              <span className="font-mono text-text">{wardsPlaced}</span> P{" / "}
              <span className="font-mono text-text">{wardsKilled}</span> K
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0.5 text-text-secondary">
            <div><span className="font-mono text-text-bright">{visionScore}</span> vision score</div>
            <div><span className="font-mono text-text-bright">{controlWards}</span> control wards bought</div>
            <div><span className="font-mono text-text-bright">{wardsPlaced}</span> wards placed</div>
            <div><span className="font-mono text-text-bright">{wardsKilled}</span> wards killed</div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  const total = stat === "gold" ? gold : cs;
  const rate = seconds && seconds > 0 ? (total * 60) / seconds : null;

  return (
    <span className={cell}>
      <span className="font-mono font-semibold text-text-bright">{total.toLocaleString()}</span>
      <span className="text-[0.85em]">
        {rate === null ? "—" : `${rate.toFixed(stat === "gold" ? 0 : 1)} / min`}
      </span>
    </span>
  );
}
