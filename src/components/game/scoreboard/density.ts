/**
 * The scoreboard's three densities, stated once.
 *
 * The page picks one `size` from `useWindowSize()` and every row, header, footer and switcher reads
 * its numbers from this table. The same layout at every size: below `md` the icons and type shrink
 * rather than the arrangement changing.
 *
 * **The columns are a grid, and this file owns its template.** `gridTemplate` is the seven tracks a
 * team block lays out (splash, name, spells and runes, items, KDA, damage, farm). The name track is
 * the one that flexes, but it never drops below its content: a name is never ellipsized and the
 * numeric columns never crowd the icons. The three stat tracks give up their surrounding space next,
 * and only when every track is at its content does the board scroll sideways, which is the right
 * answer at that point. Every row and both header lines are
 * `grid-cols-subgrid` children of it, so the two switchers sit over the two stat columns by
 * construction.
 */

import type { ScoreboardSize } from "../GameView";

export interface Density {
  /** Row height and left border. */
  row: string;
  /** The column gap of the block's grid, so every subgrid row inherits it. */
  rowGap: string;
  /** The splash column's width, in px. */
  splash: number;
  /** The level pill on the splash tile. */
  splashLevel: string;
  spell: number;
  rune: number;
  item: number;
  /** The name's type size. Its width is the grid's flexible track, floored at its content. */
  name: string;
  /** Body text in the numeric columns. */
  text: string;
  /** The KDA, damage and farm tracks' width when the board has room, in px. Wide enough that nothing touches. */
  colPx: number;
  /** The damage meter's track. */
  bar: string;
  /** Gap between items, and between spells and runes. */
  gap: string;
  /** The team header's line. */
  header: string;
  /** The Victory / Defeat word. */
  result: string;
  /** Ban icons in the team footer. */
  ban: number;
}

export const DENSITY: Record<ScoreboardSize, Density> = {
  sm: {
    row: "h-9 border-l-2",
    rowGap: "gap-x-2",
    splash: 80,
    splashLevel: "text-[10px]",
    spell: 12,
    rune: 12,
    item: 16,
    name: "text-xs",
    text: "text-[10px]",
    colPx: 64,
    bar: "h-1 w-10",
    gap: "gap-px",
    header: "text-xs py-1.5",
    result: "text-sm",
    ban: 16,
  },
  md: {
    row: "h-12 border-l-[3px]",
    rowGap: "gap-x-2.5",
    splash: 160,
    splashLevel: "text-xs",
    spell: 18,
    rune: 18,
    item: 26,
    name: "text-sm",
    text: "text-xs",
    colPx: 96,
    bar: "h-1.5 w-14",
    gap: "gap-[3px]",
    header: "text-base py-2",
    result: "text-lg",
    ban: 22,
  },
  lg: {
    row: "h-16 border-l-4",
    rowGap: "gap-x-3",
    splash: 220,
    splashLevel: "text-sm",
    spell: 24,
    rune: 24,
    item: 34,
    name: "text-base",
    text: "text-sm",
    colPx: 120,
    bar: "h-2 w-20",
    gap: "gap-1",
    header: "text-lg py-2.5",
    result: "text-xl",
    ban: 26,
  },
};

/** Every block, row and header line spans all of these. */
export const SCOREBOARD_COLUMNS = 7;

/**
 * The seven tracks: splash, name (grows to fill, never below its content), spells and runes, items,
 * KDA, damage, farm.
 *
 * The three stat tracks are `colPx` wide when there is room and give it up before the board scrolls:
 * the name track is the flexible one, so it shrinks first, down to the longest name; then the stat
 * tracks lose their surrounding space, evenly, down to their content (the switcher in the header, a
 * meter's bar, a nowrap number); only then does the board overflow. A fixed `colPx` made that
 * padding the first thing a narrow column paid for with a scrollbar.
 */
export function gridTemplate(d: Density): string {
  const stat = `minmax(max-content, ${d.colPx}px)`;
  return `auto minmax(max-content, 1fr) auto auto ${stat} ${stat} ${stat}`;
}
