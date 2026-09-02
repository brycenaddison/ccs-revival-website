/**
 * A player's damage, damage taken or crowd control, as a number over a bar.
 *
 * The bar is relative to the best value in the game, so the leader's is full and everyone else's
 * reads as a share of it; the leader also gets a star, which is what the client does. One hue per
 * stat so a reader who flips the column knows which they are looking at without reading the header:
 * blue for damage dealt, green for damage taken, purple for crowd control.
 */

import { Star } from "lucide-react";
import { cn } from "../../../lib/cn";
import type { Density } from "./density";
import type { DamageStat } from "./StatSwitcher";

const TRACK: Record<DamageStat, string> = {
  damage: "bg-ccs-blue/20",
  damageTaken: "bg-ccs-green/20",
  cc: "bg-ccs-purple/20",
};

const FILL: Record<DamageStat, string> = {
  damage: "bg-ccs-blue",
  damageTaken: "bg-ccs-green",
  cc: "bg-ccs-purple",
};

export function DamageMeter({
  stat,
  value,
  max,
  density: d,
}: {
  stat: DamageStat;
  value: number;
  max: number;
  density: Density;
}) {
  const leader = value === max && max > 0;
  return (
    <span className={cn("flex w-full min-w-0 flex-col items-center justify-center", d.gap)}>
      <span className={cn("flex items-center gap-1 font-mono", d.text, leader ? "font-semibold text-text-bright" : "text-text")}>
        {leader && <Star className="h-[0.9em] w-[0.9em] fill-ccs-gold text-ccs-gold" strokeWidth={0} aria-label="Most in the game" />}
        {value.toLocaleString()}
      </span>
      <span className={cn("relative overflow-hidden rounded-full", d.bar, TRACK[stat])} role="presentation">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", FILL[stat])}
          style={{ width: `${Math.min(100, (value * 100) / max)}%` }}
        />
      </span>
    </span>
  );
}
