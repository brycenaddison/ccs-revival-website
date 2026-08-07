/**
 * Site administration — `/admin/:section?`.
 *
 * Two sections are live against the `/admin` portal — the user directory and the league metadata
 * editor. The rest are placeholders, and each names the endpoint that unblocks it; see
 * `API-GAP-ANALYSIS.md` for the full remaining surface.
 *
 * `SITE_ADMIN_ROLE` implies league admin everywhere — see `lib/adminAccess.ts`. The gate below is
 * the same answer the API gives: every route under `/admin` is site-admin only, never a league
 * grant, because this is the surface that hands site roles and league grants *out*.
 */

import { useParams } from "react-router-dom";
import { CalendarRange, Inbox, Megaphone, ShieldCheck, Trophy } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { SettingsShell } from "../components/settings/SettingsShell";
import { ComingSoon } from "../components/settings/SettingsSection";
import { AnnouncementsSection } from "../components/admin/AnnouncementsSection";
import { LeaguesSection } from "../components/admin/LeaguesSection";
import { RolesSection } from "../components/admin/RolesSection";
import { SeasonStructureSection } from "../components/admin/season/SeasonStructureSection";
import { SITE_ADMIN_ROLE } from "../lib/api";
import { sectionForSlug, type SettingsArea } from "../lib/settingsAreas";

const AREA: SettingsArea = {
  title: "Site Admin",
  basePath: "/admin",
  sections: [
    {
      slug: "roles",
      label: "Roles & Permissions",
      icon: ShieldCheck,
      description: "Site roles and per-league permissions for people with Discord accounts.",
      Component: RolesSection,
    },
    {
      slug: "leagues",
      label: "Leagues & Seasons",
      icon: Trophy,
      description: "Create a league, rename it, and set which season is running now.",
      Component: LeaguesSection,
    },
    {
      slug: "season",
      label: "Season Structure",
      icon: CalendarRange,
      // Site admin only, matching the API: everything under `/tournaments/:conf/phases` guards on the
      // `admin` role rather than a league grant, because reshaping a season is not the same job as
      // running one. League admins get the schedule editor instead.
      description: "Phases, groups, scenarios and brackets — the shape of a league's season.",
      // The bracket editor lays a season out in day columns, so it takes the page: a fixed cap only
      // decides how soon the day strip has to start scrolling, and there is no width at which a
      // long season stops needing to. The editors inside cap their own field columns, since a form
      // stretched across a 4K monitor is worse than a narrow one. Other sections stay at 1000.
      maxWidth: "100%",
      Component: SeasonStructureSection,
    },
    {
      slug: "applications",
      label: "Team Applications",
      icon: Inbox,
      description: "Review and approve teams applying to join.",
      Component: () => <ComingSoon needs="GET/PATCH /applications and transactional approval" />,
    },
    {
      slug: "announcements",
      label: "Announcements",
      icon: Megaphone,
      // Site admin rather than `content`, matching the API. Articles moved to `/content` when the
      // writers' portal landed; saying so here is the difference between an admin finding them and
      // concluding the feature was dropped.
      description: "The banner on the home page. Articles live in the content portal at /content.",
      Component: AnnouncementsSection,
    },
  ],
};

/** Default for a section that doesn't ask for more: a comfortable width for a column of fields. */
const DEFAULT_WIDTH = 1000;

export default function SiteAdmin() {
  const { section } = useParams();

  // Resolved here rather than in the shell because `PageShell` is the thing that owns the content
  // column, and it wraps `SettingsShell`. An unknown slug falls back to the default; the shell
  // redirects it to the first section a moment later.
  const maxWidth = sectionForSlug(AREA.sections, section)?.maxWidth ?? DEFAULT_WIDTH;

  return (
    <PageShell maxWidth={maxWidth}>
      <RequireAuth roles={[SITE_ADMIN_ROLE]}>
        <SettingsShell area={AREA} slug={section} />
      </RequireAuth>
    </PageShell>
  );
}
