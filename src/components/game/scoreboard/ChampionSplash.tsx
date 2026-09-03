/**
 * The scoreboard's champion cell: the centered splash as a clean tile.
 *
 * Clipped to a rounded box with the same lift the item and champion tiles carry, no fade in either
 * direction, so it reads the same on both themes and the name beside it starts on the row's own
 * surface. The level sits bottom-left on a black pill, white text, which is legible over any splash.
 * It fills the row top to bottom with no lift of its own; the rows read as one continuous column of
 * art with the numbers beside it.
 */

import { cn } from "../../../lib/cn";
import { ChampionSplashArt } from "../ChampionSplashArt";
import type { Density } from "./density";

/**
 * How much of the art's right side is chopped off. The cell narrows by the same fraction, so the art
 * keeps the scale `Density.splash` gives it and the row just gets that much of its width back; the
 * champion, who sits at the center of a centered splash, stays in frame. Set to 0 to chop nothing.
 */
const CROP_RIGHT = 0.25;

export function ChampionSplash({ championId, level, density: d }: { championId: number; level: number; density: Density }) {
  return (
    <ChampionSplashArt
      championId={championId}
      fade={false}
      cropRight={CROP_RIGHT}
      position="center 25%"
      className="h-full self-stretch border-r border-border"
      style={{ width: Math.round(d.splash * (1 - CROP_RIGHT)) }}
    >
      <span
        className={cn(
          "absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 font-heading font-bold leading-none text-white",
          d.splashLevel,
        )}
        title="Level"
      >
        {level}
      </span>
    </ChampionSplashArt>
  );
}
