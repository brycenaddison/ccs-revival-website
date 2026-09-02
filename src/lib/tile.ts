/**
 * The tile treatment every standalone game icon wears: a corner radius and a lift that both scale
 * with the icon.
 *
 * One shadow for a 16px ban chip and a 48px item well cannot be right for both: what lifts the large
 * one smudges the small one. So the lift comes in three steps keyed off the size, and the radius
 * follows the same steps. `ChampionIcon`'s `tile` mode and every icon in `components/game/RiotIcons.tsx`
 * read this and nothing else, which is what keeps a row of mixed icons reading as one set.
 *
 * The three shadows are theme tokens (`--shadow-tile-*` in `index.css`), deliberately subtle: enough
 * to separate a dark icon from a dark surface, not enough to read as a card.
 */

export function tileShadow(size: number): string {
  return size >= 40 ? "shadow-tile-lg" : size >= 24 ? "shadow-tile" : "shadow-tile-sm";
}

export function tileRadius(size: number): string {
  return size >= 40 ? "rounded-md" : size >= 24 ? "rounded" : "rounded-sm";
}

/** Radius and lift together, or a circle with the lift for a minor rune. */
export function tileClass(size: number, round = false): string {
  return `${round ? "rounded-full" : tileRadius(size)} ${tileShadow(size)}`;
}
