/**
 * The vocabulary the settings areas are written in.
 *
 * Three areas share one shell — personal settings, site admin, league admin — so an area is data:
 * a title, a route prefix, and an ordered list of sections. Everything else the shell derives from
 * that. Adding a section is appending to an array; the sidebar, the links, the mobile drill-down and
 * the active state all follow, and there is no second list to keep in step.
 *
 * `basePath` is a field rather than a constant because league admin's prefix contains the conf
 * (`/league/ccs-s5/admin`). That is the whole reason the shell can't build its own links.
 */

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export interface SettingsSection {
  /** URL segment. Lowercase, hyphenated. */
  slug: string;
  /** Sidebar label, written in title case — the shell renders it uppercase. */
  label: string;
  icon: LucideIcon;
  /** One line under the heading saying what this section controls. Also the mobile row's subtitle. */
  description?: string;
  /**
   * Content width for the page this section is on, overriding the area's own.
   *
   * Here rather than on the area because the two shapes genuinely disagree: a column of labelled
   * fields is unreadable stretched wide, while a bracket laid out in day columns has nowhere to go at
   * 1000px — after the sidebar it gets about 650. The page reads this, not the shell: `PageShell`
   * wraps `SettingsShell`, so the width has to be resolved before the shell renders.
   *
   * A number is pixels; `"100%"` means take the page. A section that goes full width owns capping its
   * own field columns, since nothing else will.
   */
  maxWidth?: number | string;
  Component: ComponentType;
}

export interface SettingsArea {
  /** Heading over the sidebar, and the label on the mobile back link. */
  title: string;
  /** Route prefix, no trailing slash: `/settings`, `/admin`, `/league/ccs-s5/admin`. */
  basePath: string;
  sections: readonly SettingsSection[];
}

/**
 * Resolves a URL segment to a section.
 *
 * Absent or unknown both answer `null`, which the shell turns into a redirect rather than an error
 * page — the same tolerance `leagueContext` shows a stale `?conf=`. A bookmark that outlived a
 * renamed section should land somewhere sensible.
 */
export function sectionForSlug(
  sections: readonly SettingsSection[],
  slug: string | undefined,
): SettingsSection | null {
  if (!slug) return null;
  const wanted = slug.toLowerCase();
  return sections.find(s => s.slug === wanted) ?? null;
}

/** A section's URL within its area. */
export function sectionPath(area: SettingsArea, section: SettingsSection): string {
  return `${area.basePath}/${section.slug}`;
}
