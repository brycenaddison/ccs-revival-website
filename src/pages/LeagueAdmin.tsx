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
import { CalendarDays, ClipboardList, Settings2, Users, UsersRound } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { SettingsShell } from "../components/settings/SettingsShell";
import { ComingSoon } from "../components/settings/SettingsSection";
import { LeaguePicker } from "../components/settings/LeaguePicker";
import { useAdminAccess } from "../lib/adminAccess";
import type { SettingsArea, SettingsSection } from "../lib/settingsAreas";

// Named to match the parked tabs in `src/_disabled/admin/`, so reviving one is a swap rather than a
// redesign.
const SECTIONS: readonly SettingsSection[] = [
  {
    slug: "details",
    label: "League Details",
    icon: Settings2,
    description: "Name, week layout, and whether this season is running.",
    Component: () => <ComingSoon needs="write endpoints for /tournaments (the API is read-only)" />,
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
    description: "Fixtures, weeks and best-of format.",
    Component: () => <ComingSoon needs="write endpoints for matches and series" />,
  },
  {
    slug: "draft",
    label: "Draft Board",
    icon: ClipboardList,
    description: "Free-agent listings for the draft.",
    Component: () => <ComingSoon needs="draft listing endpoints" />,
  },
];

export default function LeagueAdmin() {
  const { conf = "", section } = useParams();
  const { leagues, canAdminLeague, ready } = useAdminAccess();

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
    <PageShell maxWidth={1000}>
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
