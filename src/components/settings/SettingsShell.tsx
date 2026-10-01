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
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { SECTION_WIDTH, sectionForSlug, sectionPath, type SettingsArea } from "../../lib/settingsAreas";
import type { CSSProperties, ReactNode } from "react";

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

  // A league grant can carry a scope with no section (such as `stats`), so an empty section list
  // needs a useful message rather than a blank page.
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

  // A static Sidebar column at the page's left edge, inside SiteLayout's content scroller. The page
  // takes the full width and the capped section is centered beside it, so the sidebar sits in the
  // same place for every section however wide it asks to be. It is sticky rather than a second
  // viewport-height scroll region. The menu button keeps its left rule on both states, so selecting
  // a section doesn't reflow the list.
  return (
    <SidebarProvider className="items-start gap-6" style={{ "--sidebar-width": "220px" } as CSSProperties}>
      <Sidebar collapsible="none" className="sticky top-6 h-auto shrink-0 rounded-lg border border-sidebar-border">
        <SidebarHeader className="gap-2 px-2 pt-3 pb-0">
          <h2 className="font-display text-lg text-text-bright px-3">{title}</h2>
          {sidebarHeader && <div className="px-2">{sidebarHeader}</div>}
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label={title}>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {sections.map(s => {
                    const active = s.slug === section.slug;
                    const Icon = s.icon;
                    return (
                      <SidebarMenuItem key={s.slug}>
                        <SidebarMenuButton asChild isActive={active} className="h-auto py-2.5 px-3">
                          <Link to={sectionPath(area, s)} aria-current={active ? "page" : undefined}>
                            <Icon size={15} aria-hidden="true" />
                            <span>{s.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
      </Sidebar>

      {/* The column fills the rest of the page and centers the capped section inside it. */}
      <div className="min-w-0 flex-1">
        <div className="mx-auto min-w-0" style={{ maxWidth: section.maxWidth ?? SECTION_WIDTH }}>
          <SectionFrame section={section}>
            <section.Component />
          </SectionFrame>
        </div>
      </div>
    </SidebarProvider>
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
