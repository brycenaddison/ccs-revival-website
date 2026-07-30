/**
 * Personal settings — `/settings/:section?`.
 *
 * The registry is the page: three entries, and the shell derives the sidebar, the mobile
 * drill-down and the routing within the area from them. Gated on a session only; there is nothing
 * here that isn't about the account you're signed in as.
 *
 * The nav's season selector hides itself here — see `SEASONLESS_PREFIXES` in `NavBar` — because the
 * season being viewed has nothing to do with your own account.
 */

import { useParams } from "react-router-dom";
import { KeyRound, Link2, User } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { SettingsShell } from "../components/settings/SettingsShell";
import { AccountSection } from "../components/settings/profile/AccountSection";
import { ConnectionsSection } from "../components/settings/profile/ConnectionsSection";
import { SessionsSection } from "../components/settings/profile/SessionsSection";
import type { SettingsArea } from "../lib/settingsAreas";

const AREA: SettingsArea = {
  title: "Settings",
  basePath: "/settings",
  sections: [
    {
      slug: "account",
      label: "Account",
      icon: User,
      description: "Your identity as the league sees it.",
      Component: AccountSection,
    },
    {
      slug: "connections",
      label: "Connections",
      icon: Link2,
      description: "Riot accounts attached to your profile.",
      Component: ConnectionsSection,
    },
    {
      slug: "sessions",
      label: "Sessions",
      icon: KeyRound,
      description: "Where you're signed in.",
      Component: SessionsSection,
    },
  ],
};

export default function Settings() {
  const { section } = useParams();

  return (
    <PageShell maxWidth={1000}>
      <RequireAuth>
        <SettingsShell area={AREA} slug={section} />
      </RequireAuth>
    </PageShell>
  );
}
