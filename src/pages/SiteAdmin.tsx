/**
 * Site administration — `/admin/:section?`.
 *
 * Every section is a placeholder, and each names the endpoint that unblocks it. The shell, the
 * routing and the role gate are real — what's missing is the write surface, enumerated in
 * `API-GAP-ANALYSIS.md`. Shipping the frame first means reviving a tab is writing one component,
 * not rebuilding an admin dashboard.
 *
 * `SITE_ADMIN_ROLE` is the only role the API grants today, and it implies league admin everywhere —
 * see `lib/adminAccess.ts`.
 */

import { useParams } from "react-router-dom";
import { FileText, Inbox, ShieldCheck, Trophy } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { SettingsShell } from "../components/settings/SettingsShell";
import { ComingSoon } from "../components/settings/SettingsSection";
import { SITE_ADMIN_ROLE } from "../lib/api";
import type { SettingsArea } from "../lib/settingsAreas";

const AREA: SettingsArea = {
  title: "Site Admin",
  basePath: "/admin",
  sections: [
    {
      slug: "roles",
      label: "Roles & Permissions",
      icon: ShieldCheck,
      description: "Who can administer the site, and which leagues each admin owns.",
      Component: () => <ComingSoon needs="an endpoint to read and grant roles and league grants" />,
    },
    {
      slug: "leagues",
      label: "Leagues & Seasons",
      icon: Trophy,
      description: "Create a season, set its week layout, mark it active.",
      Component: () => <ComingSoon needs="write endpoints for /tournaments (the API is read-only)" />,
    },
    {
      slug: "applications",
      label: "Team Applications",
      icon: Inbox,
      description: "Review and approve teams applying to join.",
      Component: () => <ComingSoon needs="GET/PATCH /applications and transactional approval" />,
    },
    {
      slug: "content",
      label: "Articles & Socials",
      icon: FileText,
      description: "News posts, and the Twitter and Twitch embeds on the home page.",
      Component: () => <ComingSoon needs="write endpoints for articles and social embeds, plus image upload" />,
    },
  ],
};

export default function SiteAdmin() {
  const { section } = useParams();

  return (
    <PageShell maxWidth={1000}>
      <RequireAuth roles={[SITE_ADMIN_ROLE]}>
        <SettingsShell area={AREA} slug={section} />
      </RequireAuth>
    </PageShell>
  );
}
