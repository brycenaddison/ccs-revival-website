/**
 * The content team's area — `/content/:section?`.
 *
 * A fourth settings area alongside `/settings`, `/admin` and `/league/:conf/admin`, built from the
 * same shell and the same registry — see `lib/settingsAreas.ts`. Adding a section here is appending
 * to the array below.
 *
 * **Gated on `content` *or* `admin`, and both are needed.** `hasRole` is OR semantics
 * (`authContext.tsx:190`), which matches the API: the `content` guard upstream lets a site admin
 * through as well, on the reasoning that an admin could grant themselves the role in one request
 * anyway, so refusing them is friction with no security value.
 *
 * Announcements are deliberately **not** here. A banner is an operational control rather than
 * editorial copy, so it stays under `/admin` with the league and role editors.
 */

import { useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { SettingsShell } from "../components/settings/SettingsShell";
import { ArticlesSection } from "../components/content/ArticlesSection";
import { CONTENT_ROLE, SITE_ADMIN_ROLE } from "../lib/api";
import { sectionForSlug, type SettingsArea } from "../lib/settingsAreas";

const AREA: SettingsArea = {
  title: "Content",
  basePath: "/content",
  sections: [
    {
      slug: "articles",
      label: "Articles",
      icon: FileText,
      description: "Write, publish and retire news posts. Drafts are only visible here.",
      // The editor is a long form with a markdown textarea in it, and a body column 650px wide
      // after the sidebar is not somewhere anyone wants to write. The form caps its own fields.
      maxWidth: "100%",
      Component: ArticlesSection,
    },
  ],
};

/** Default for a section that doesn't ask for more: a comfortable width for a column of fields. */
const DEFAULT_WIDTH = 1000;

export default function ContentPortal() {
  const { section } = useParams();
  const maxWidth = sectionForSlug(AREA.sections, section)?.maxWidth ?? DEFAULT_WIDTH;

  return (
    <PageShell maxWidth={maxWidth}>
      <RequireAuth roles={[CONTENT_ROLE, SITE_ADMIN_ROLE]}>
        <SettingsShell area={AREA} slug={section} />
      </RequireAuth>
    </PageShell>
  );
}
