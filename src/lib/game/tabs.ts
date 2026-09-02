/**
 * The match viewer's tab registry.
 *
 * Each tab is a URL (`/game/:matchId/:tab`) because the repo's tabs are `<Link>`s with `aria-current`,
 * and a reader who copies the address of the Builds tab should land on the Builds tab. The strip, the
 * route guard in `pages/GameDetail.tsx` and the timeline-less empty states all read this list rather
 * than carrying their own.
 *
 * `needsTimeline` is what a tab body is *made of*, not what it can show a note about: Builds renders
 * final items and runes off the match payload alone, so it stays useful without one and is not flagged.
 */

export type GameTab = "scoreboard" | "graphs" | "builds" | "timeline";

export interface GameTabEntry {
  slug: GameTab;
  label: string;
  /** The tab has nothing to draw without `GET /m/:matchId/timeline`. */
  needsTimeline: boolean;
}

export const GAME_TABS: readonly GameTabEntry[] = [
  { slug: "scoreboard", label: "Scoreboard", needsTimeline: false },
  { slug: "graphs", label: "Graphs", needsTimeline: false },
  { slug: "builds", label: "Builds", needsTimeline: false },
  { slug: "timeline", label: "Timeline", needsTimeline: true },
];

export const DEFAULT_GAME_TAB: GameTab = "scoreboard";

/** The tab a path segment names, or the default for anything else (a typo, an old link). */
export function gameTabOf(segment: string | undefined): GameTab {
  return GAME_TABS.find(t => t.slug === segment)?.slug ?? DEFAULT_GAME_TAB;
}

/** The default tab is the bare path; every other tab is a segment. */
export function gameTabPath(matchId: string, tab: GameTab): string {
  const base = `/game/${encodeURIComponent(matchId)}`;
  return tab === DEFAULT_GAME_TAB ? base : `${base}/${tab}`;
}
