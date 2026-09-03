/**
 * Site administration — `/admin/:section?`.
 *
 * Every section here is live against the `/admin` portal. Reviewing team applications is League
 * Admin → Team Applications, not here: an application belongs to one conference, review needs that
 * conference's `roster` grant rather than a site role, and a second copy under `/admin` could only
 * ever duplicate it. What *is* here is Import Applications, which is a different job: creating an
 * application on a captain's behalf and messaging their players acts as somebody else, and the
 * routes behind it are site-admin only for the same reason the intake toggle is.
 *
 * `SITE_ADMIN_ROLE` implies league admin everywhere — see `lib/adminAccess.ts`. The gate below is
 * the same answer the API gives: every route under `/admin` is site-admin only, never a league
 * grant, because this is the surface that hands site roles and league grants *out*.
 */

import { useParams } from "react-router-dom";
import { Award, CalendarRange, Import, Megaphone, ShieldCheck, Trophy } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { SettingsShell } from "../components/settings/SettingsShell";
import { GlobalAccoladesSection } from "../components/admin/accolades/GlobalAccoladesSection";
import { ImportApplicationsSection } from "../components/admin/applications/ImportApplicationsSection";
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
      slug: "applications",
      label: "Import Applications",
      icon: Import,
      // Not a review queue: that is League Admin → Team Applications, behind a `roster` grant. This
      // creates a draft owned by somebody else and messages their players, which is why its routes
      // are site-admin only (`lib/api/adminApplications.ts`) and why it sits beside the intake toggle.
      description: "Enter a team application on a captain's behalf, then message their players when you're ready.",
      Component: ImportApplicationsSection,
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
      slug: "accolades",
      label: "Accolades",
      icon: Award,
      // Definitions only, matching the API: `/admin/accolades/definitions` is the sole surface that
      // can change a site-wide definition, while issuing one is a per-conference job and lives in
      // League Admin → Accolades. There is no site-wide issuance endpoint to build against.
      description: "Site-wide awards every league can hand out. Issuing them is a league job.",
      Component: GlobalAccoladesSection,
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
