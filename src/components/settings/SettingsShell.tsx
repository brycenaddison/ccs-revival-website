/**
 * The sidebar-and-content layout all three settings areas share.
 *
 * Everything here is derived from the area's section list and the URL — there is no local "active
 * tab" state, because the section is a real route segment. That is what makes a settings page
 * linkable, back-button-correct and refresh-safe, and it is why the sidebar entries are `<Link>`s
 * rather than buttons.
 *
 * Mobile is a drill-down rather than a squeezed sidebar: `/settings` is the list of sections, and
 * `/settings/connections` replaces it with that section plus a back link. The two states are the
 * same two URLs desktop uses, so nothing about the routing is mobile-specific — only which of them
 * renders a redirect.
 */

import { Link, Navigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWindowSize } from "../../hooks/useWindowSize";
import { NoticePanel } from "../auth/RequireAuth";
import { SectionFrame } from "./SettingsSection";
import { sectionForSlug, sectionPath, type SettingsArea } from "../../lib/settingsAreas";
import type { ReactNode } from "react";

interface Props {
  area: SettingsArea;
  /** The `:section` route param, if the URL carried one. */
  slug?: string;
  /**
   * Rendered at the top of the sidebar, above the section list — the league picker, on league
   * admin. Also shown above the mobile section list, where the sidebar itself doesn't exist.
   */
  sidebarHeader?: ReactNode;
}

const ROW_LABEL = "font-heading text-sm ";

export function SettingsShell({ area, slug, sidebarHeader }: Props) {
  const isMobile = useWindowSize() < 768;
  const { sections, basePath, title } = area;
  const section = sectionForSlug(sections, slug);

  // Never true for the three areas shipped here, but league admin's list is the kind of thing that
  // gets filtered by permission later, and an empty grid would render as a blank page.
  if (sections.length === 0) {
    return <NoticePanel title={title} body="There's nothing to configure here yet." />;
  }

  if (isMobile) {
    // No slug is the list; an unknown one goes back to the list rather than guessing a section.
    if (!slug) return <MobileList area={area} sidebarHeader={sidebarHeader} />;
    if (!section) return <Navigate to={basePath} replace />;

    return (
      <div>
        <Link
          to={basePath}
          className={`inline-flex items-center gap-1 mb-4 text-text-secondary no-underline ${ROW_LABEL}`}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {title}
        </Link>
        <SectionFrame section={section}>
          <section.Component />
        </SectionFrame>
      </div>
    );
  }

  // Desktop always shows a section. `replace` matters: this redirect also fires when a mobile
  // viewport is widened while on the list, and shouldn't leave an extra history entry behind it.
  if (!section) return <Navigate to={sectionPath(area, sections[0])} replace />;

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6 items-start">
      <nav aria-label={title} className="bg-bg2 border border-border rounded-lg p-2">
        <h2 className="font-display text-lg text-text-bright px-3 pt-1 pb-2">{title}</h2>
        {sidebarHeader && <div className="px-2 pb-2">{sidebarHeader}</div>}
        {sections.map(s => {
          const active = s.slug === section.slug;
          const Icon = s.icon;
          return (
            <Link
              key={s.slug}
              to={sectionPath(area, s)}
              aria-current={active ? "page" : undefined}
              // `border-l-[3px]` on both states, so selecting a section doesn't reflow the list —
              // the same reason the nav drawer and the stat pills carry their border unconditionally.
              className={`flex items-center gap-2 py-2.5 px-3 rounded-md border-l-[3px] no-underline ${ROW_LABEL} ${
                active
                  ? "bg-bg-input text-text-bright font-bold border-l-brand"
                  : "text-text-secondary font-normal border-l-transparent hover:text-text-bright"
              }`}
            >
              <Icon size={15} aria-hidden="true" className="shrink-0" />
              {s.label}
            </Link>
          );
        })}
      </nav>

      <SectionFrame section={section}>
        <section.Component />
      </SectionFrame>
    </div>
  );
}

/** The mobile root: every section as a full-width row you tap into. */
function MobileList({ area, sidebarHeader }: { area: SettingsArea; sidebarHeader?: ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-[22px] text-text-bright mb-4">{area.title}</h2>
      {sidebarHeader && <div className="mb-4">{sidebarHeader}</div>}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
        {area.sections.map(s => {
          const Icon = s.icon;
          return (
            <Link
              key={s.slug}
              to={sectionPath(area, s)}
              className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-b-0 no-underline"
            >
              <Icon size={18} aria-hidden="true" className="shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1">
                <span className={`block text-text-bright ${ROW_LABEL}`}>{s.label}</span>
                {s.description && (
                  <span className="block text-text-dim text-xs mt-0.5">{s.description}</span>
                )}
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-dim" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
