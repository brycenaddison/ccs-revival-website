/**
 * League administration — `/league/:conf/admin/:section?`.
 *
 * The conf is in the **path**, not the `?conf=` param the rest of the site uses for the season being
 * viewed. Those are different selections: folding them together would mean opening league admin
 * silently re-pointed every other tab, and switching the league you're editing would change what
 * the public views show. For the same reason the link into here is a plain `<Link>` rather than
 * `useSeasonLink()` — there is no season to carry.
 *
 * Access is per-conf rather than per-role, which is why the gate uses `allow` instead of `roles`.
 * A site admin passes for every league; see `lib/adminAccess.ts`.
 */

import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { BookOpen, CalendarDays, ClipboardList, GitFork, Users, UsersRound } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { SettingsShell } from "../components/settings/SettingsShell";
import { ComingSoon } from "../components/settings/SettingsSection";
import { LeaguePicker } from "../components/settings/LeaguePicker";
import { ScheduleSection } from "../components/league/schedule/ScheduleSection";
import { BracketSection } from "../components/league/bracket/BracketSection";
import { InfoSection } from "../components/league/info/InfoSection";
import { useAdminAccess } from "../lib/adminAccess";
import { sectionForSlug, type SettingsArea, type SettingsSection } from "../lib/settingsAreas";

// Named to match the parked tabs in `src/_disabled/admin/`, so reviving one is a swap rather than a
// redesign.
//
// League metadata — name, week layout, whether the season is running — is deliberately not here. It
// is site-admin work and Site Admin → Leagues is where it happens; a tab that could only ever say
// "coming soon" was a section an admin opened once and learned nothing from.
const SECTIONS: readonly SettingsSection[] = [
  {
    slug: "info",
    label: "Info Page",
    icon: BookOpen,
    description: "Quick links and important information shown on this league's public Info page.",
    Component: InfoSection,
  },
  {
    slug: "teams",
    label: "Teams",
    icon: Users,
    description: "Team names, tags, logos and colours.",
    Component: () => <ComingSoon needs="POST/PATCH /teams plus a logo upload endpoint" />,
  },
  {
    slug: "rosters",
    label: "Rosters",
    icon: UsersRound,
    description: "Who plays for whom, and in which role.",
    Component: () => <ComingSoon needs="write endpoints for rosters and player records" />,
  },
  {
    slug: "schedule",
    label: "Schedule",
    icon: CalendarDays,
    // Needs the `schedule` scope, which is narrower than this page's own gate — a grant carrying only
    // `schedule` reaches here and can use this section but nothing else. Match times, teams, best-of,
    // streams, codes, bracket resync and legacy linking. Adding or moving a match is structure, and
    // lives in Site Admin.
    description: "Match times, line-ups, best-of and tournament codes, day by day.",
    Component: ScheduleSection,
  },
  {
    slug: "bracket",
    label: "Bracket",
    icon: GitFork,
    // The same `PATCH /schedule/:id` the Schedule section already uses, so the same `schedule` scope
    // reaches it — this is that write laid out as a bracket instead of as a list of days. Wiring,
    // seed labels and which nodes exist stay in Site Admin.
    description: "Who plays each seeded position in the playoffs.",
    // Takes the page, the same way Site Admin → Season Structure does and for the same reason: a
    // bracket laid out in day columns has nowhere to go at 1000px — after the sidebar it gets about
    // 650, which is two columns. The section caps its own reference panel; nothing else is a form.
    maxWidth: "100%",
    Component: BracketSection,
  },
  {
    slug: "draft",
    label: "Draft Board",
    icon: ClipboardList,
    description: "Free-agent listings for the draft.",
    Component: () => <ComingSoon needs="draft listing endpoints" />,
  },
];

/** Default for a section that doesn't ask for more: a comfortable width for a column of fields. */
const DEFAULT_WIDTH = 1000;

export default function LeagueAdmin() {
  const { conf = "", section } = useParams();
  const { leagues, canAdminLeague, ready } = useAdminAccess();

  // Resolved here rather than in the shell, matching `SiteAdmin`: `PageShell` owns the content column
  // and wraps `SettingsShell`, so the width has to be known before the shell renders.
  const maxWidth = sectionForSlug(SECTIONS, section)?.maxWidth ?? DEFAULT_WIDTH;

  // `basePath` carries the conf, so the area can't be a module constant like the other two.
  const area = useMemo<SettingsArea>(
    () => ({
      title: "League Admin",
      basePath: `/league/${encodeURIComponent(conf)}/admin`,
      sections: SECTIONS,
    }),
    [conf],
  );

  return (
    <PageShell maxWidth={maxWidth}>
      {/* `null` while access is still resolving — a site admin's leagues come from /tournaments,
          which lands after the session does, so assuming `false` would flash NOT AUTHORIZED. */}
      <RequireAuth allow={ready ? canAdminLeague(conf) : null}>
        <SettingsShell
          area={area}
          slug={section}
          sidebarHeader={<LeaguePicker leagues={leagues} conf={conf} slug={section} />}
        />
      </RequireAuth>
    </PageShell>
  );
}
