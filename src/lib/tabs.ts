/**
 * The site's top-level sections, each with its own URL.
 *
 * One list, because four things have to agree on it: the router (which paths mount `Home`), the
 * desktop nav, the mobile bottom bar, and `Home` itself (which view to render). Adding a section
 * should mean editing this array and the switch in `Home`, not four files.
 *
 * `/teams` is the Teams tab; `/teams/:conf/:code` is a single team's page and a separate route.
 * Static segments outrank dynamic ones in React Router, so the two don't compete.
 */

import {
  CalendarDays,
  ChartColumn,
  ClipboardList,
  House,
  Newspaper,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface SiteTab {
  /** Display label, and the value `Home` switches on. */
  label: string;
  path: string;
  /**
   * Bottom-bar icon. A component rather than a glyph: an emoji renders in the platform's own font,
   * so it can't take the active colour and looks different on every OS.
   */
  icon: LucideIcon;
  /** The bottom bar is narrower and carries a subset — Schedule lives in the nav only. */
  inBottomBar: boolean;
  /**
   * True when the tab has its own page component instead of being a section of `Home`.
   *
   * It still belongs in this list, because the nav and the bottom bar should show it exactly like
   * any other tab. What differs is the routing: `main.tsx` mounts `Home` for every tab *except*
   * these, which declare their own `<Route>`. Without the flag, adding a standalone page would
   * either mean a second nav list to keep in step or a `Home` route that shadows it.
   */
  standalone?: boolean;
}

export const TABS: readonly SiteTab[] = [
  { label: "Home", path: "/", icon: House, inBottomBar: true },
  // Scores and Schedule are standalone for the same reason Stats is: both read `GET /schedule` alone,
  // so as sections of `Home` they waited on a whole-league load neither uses — and sat behind its
  // empty-team-list gate, which would hide a results page that had results.
  { label: "Scores", path: "/scores", icon: ClipboardList, inBottomBar: true, standalone: true },
  { label: "Schedule", path: "/schedule", icon: CalendarDays, inBottomBar: false, standalone: true },
  { label: "Standings", path: "/standings", icon: Trophy, inBottomBar: true },
  // Stats is its own page rather than a section of `Home`: it carries five sub-tabs and a totals
  // bar, and none of the league data `Home` loads for its other sections is any use to it.
  { label: "Stats", path: "/stats", icon: ChartColumn, inBottomBar: true, standalone: true },
  { label: "Teams", path: "/teams", icon: Users, inBottomBar: true },
  // Standalone for the same reason as the three above: it reads `/articles` and nothing else, so as
  // a section of `Home` it would wait on a whole-league load it has no use for. Out of the bottom
  // bar, which is already at six items and is for the things a phone reader opens mid-match.
  { label: "News", path: "/news", icon: Newspaper, inBottomBar: false, standalone: true },
];

/**
 * Which tab a pathname is showing, or `null` if it isn't showing one.
 *
 * Answers `null` for a page that isn't a tab at all. That matters: the settings and admin pages wear
 * the nav but are not sections of the site, and an unconditional fall back to Home would light the
 * Home tab up on every one of them. Only the root resolves to Home. Tolerates a trailing slash and
 * odd casing so a hand-typed or pasted URL still lands somewhere sensible.
 */
export function tabForPathname(pathname: string): string | null {
  const slug = pathname.replace(/\/+$/, "").toLowerCase();
  if (slug === "") return "Home";
  return TABS.find(t => t.path !== "/" && t.path === slug)?.label ?? null;
}
