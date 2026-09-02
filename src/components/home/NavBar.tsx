import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ccsLogo from "../../assets/ccs-logo.png";
import { ThemeToggle } from "../ThemeToggle";
import { AuthControl } from "../auth/AuthControl";
import { SeasonPicker } from "../league/SeasonPicker";
import { useAdminAccess } from "../../lib/adminAccess";
import { useLeague, useSeasonLink } from "../../lib/leagueContext";
import { TABS, tabForPathname, visibleTabs } from "../../lib/tabs";

interface Props {
  isMobile: boolean;
}

const EXTERNAL_LINKS = [{ label: "Merch", href: "https://classicchampionshipseries.itemorder.com/shop/sale/" }];

/**
 * The mark alone. The wordmark that sat beside it said what the image already says, so it went; the
 * `alt` now carries the name, since the image is the only thing left that does.
 */
function CcsBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center">
      <img src={ccsLogo} alt="CCS" className={`${compact ? "h-7" : "h-8"} w-auto shrink-0 object-contain`} />
    </div>
  );
}

/**
 * Pages that aren't showing league data, where a season selector would be a control over nothing.
 *
 * League admin is the pointed case: it has its own league picker in the sidebar, scoped to what
 * you're editing, and a second one in the nav — meaning what the *public* views show — reads as the
 * same control twice.
 */
const SEASONLESS_PREFIXES = ["/settings", "/setup", "/players/", "/admin", "/league/"];

/**
 * Tabs are real links, so they can be opened in a new tab, bookmarked and shared. Which one is
 * current comes from the URL rather than a prop — there is no second source of truth to keep in
 * step with it.
 *
 * `Admin` — league admin — is the one entry that isn't in `TABS`, and can't be: that array is read at
 * module scope by `main.tsx` to declare routes, and by `MobileBottomBar` and `Home`, so it cannot
 * depend on who is signed in. It's appended here instead, and its active state comes from the
 * pathname rather than `tabForPathname` — `/league/...` is not a tab.
 *
 * The nav also carries the season selector (left, beside the mark) and — via `AuthControl` — the Join
 * CCS button. Both used to live in a strip above the nav, in the shell (now `SiteLayout`). It had to disappear
 * on the settings and admin pages, and chrome that changes height between pages reads as the layout
 * breaking, so it was folded in here: the nav is now one fixed shape on every page, and only the
 * selector inside it comes and goes.
 */
export function NavBar({ isMobile }: Props) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const active = tabForPathname(pathname);
  // Tabs change only the section, so they keep the season being viewed.
  const seasonLink = useSeasonLink();

  // Straight to the newest league you administer; the picker inside switches between them. Absent
  // for everyone else, which is every signed-out visitor and every non-admin.
  const { leagues } = useAdminAccess();
  const adminConf = leagues[0]?.conf;
  const onLeagueAdmin = pathname.startsWith("/league/");

  // The season selector lives here rather than in a strip above the nav, so the chrome doesn't change
  // height between a league page and an admin page.
  const { tournaments, activeConfs, selection, setSelection, isCurrent, selectedConfs } = useLeague();
  // A season that is not running has no fixtures to come, so its Schedule tab would always be empty.
  const tabs = visibleTabs(TABS, selectedConfs, activeConfs);
  // The length check is what keeps the wrappers below from rendering an empty box: `SeasonPicker`
  // answers `null` with nothing to choose between, and it's the caller that owns the layout around it.
  const showSeason = tournaments.length > 0 && !SEASONLESS_PREFIXES.some(p => pathname.startsWith(p));
  const season = showSeason && (
    <SeasonPicker
      tournaments={tournaments}
      selection={selection}
      onChange={setSelection}
      activeConfs={activeConfs}
      compact
    />
  );

  if (isMobile) {
    return (
      // The content scrolls in a box below the nav (`SiteLayout`), so nothing passes under it and
      // `sticky` is idle; it stays for the z-index and as the positioned ancestor the drawer's
      // `absolute top-full` needs.
      <nav className="bg-bg2 border-b-2 border-brand sticky top-0 z-[150]">
        <div className="flex items-center justify-between gap-2 px-4">
          <div className="py-2.5 shrink-0">
            <CcsBrand compact />
          </div>
          {/* Between the mark and the hamburger, so which season you're viewing stays visible
              without opening the menu. `min-w-0` lets it give up space before the logo does, and the
              select inside is `w-full` so it actually follows; `body` carries the floor below which
              the page scrolls sideways instead. */}
          {season && <div className="min-w-0 text-[10px]">{season}</div>}
          <button onClick={() => setOpen(!open)} className="bg-transparent border-none cursor-pointer p-2 flex flex-col gap-1 shrink-0">
            {[0, 1, 2].map(idx => (
              <span
                key={idx}
                className="block w-[22px] h-0.5 rounded-sm transition-all duration-200"
                style={{
                  background: open ? "var(--brand)" : "var(--text-secondary)",
                  transform: open
                    ? idx === 0 ? "rotate(45deg) translate(4px,4px)" : idx === 2 ? "rotate(-45deg) translate(4px,-4px)" : "scaleX(0)"
                    : "none",
                }}
              />
            ))}
          </button>
        </div>
        {open && (
          // Capped and scrollable. The drawer is `absolute` inside a `sticky` nav, so it does not
          // grow the page — anything past the fold was simply unreachable, and on a short phone in
          // landscape that was most of the menu. The cap also clears the fixed bottom bar, which
          // sits above this in the stacking order and would otherwise cover the last entries.
          // `overscroll-contain` stops a flick at the end of the list scrolling the page behind it.
          <div className="absolute top-full left-0 right-0 max-h-[calc(100dvh-3.5rem-var(--bottom-nav-h))] overflow-y-auto overscroll-contain bg-bg2 border-b-2 border-brand z-[100] shadow-popover">
            {tabs.map(t => (
              <Link
                key={t.path}
                to={seasonLink(t.path)}
                onClick={() => setOpen(false)}
                aria-current={active === t.label ? "page" : undefined}
                className={`block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 font-display text-[15px] border-l-[3px] no-underline transition-colors hover:bg-bg-input hover:text-text-bright ${active === t.label ? "bg-bg-input text-text-bright border-l-brand" : "text-text font-medium border-l-transparent"
                  }`}
              >
                {t.label}
              </Link>
            ))}
            {EXTERNAL_LINKS.map(l => (
              <a
                key={l.label}
                href={l.href}
                target={l.href !== "#" ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 font-display text-[15px] border-l-[3px] border-l-transparent text-text font-medium no-underline transition-colors hover:bg-bg-input hover:text-text-bright"
              >
                {l.label}
              </a>
            ))}
            {adminConf && (
              <Link
                to={`/league/${encodeURIComponent(adminConf)}/admin`}
                onClick={() => setOpen(false)}
                aria-current={onLeagueAdmin ? "page" : undefined}
                className={`block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 font-display text-[15px] border-l-[3px] no-underline transition-colors hover:bg-bg-input hover:text-text-bright ${onLeagueAdmin ? "bg-bg-input text-text-bright border-l-brand" : "text-text font-medium border-l-transparent"
                  }`}
              >
                Admin
              </Link>
            )}
            <AuthControl variant="menu" onNavigate={() => setOpen(false)} />
            <div className="px-5 py-2.5 border-t border-border">
              <ThemeToggle />
            </div>
          </div>
        )}
      </nav>
    );
  }

  return (
    // Flex, not grid, and the reason is how the tab strip is centered.
    //
    // The two outer cells are `flex-1 basis-0 min-w-fit`: they grow from nothing in equal shares, so
    // when there is room they end up the same width and the strip sits exactly on the nav's center.
    // When there isn't, the wider side — the brand and season picker, or the auth cluster — floors at
    // its own content and the other side takes the rest, so the strip drifts toward the narrower side
    // *instead of* onto the picker. Tighter still, the strip is the only thing that shrinks
    // (`min-w-0`) and scrolls internally. The previous `1fr auto 1fr` grid promised the same and
    // delivered only the first clause: an fr track's floor is its content, but the auto middle was
    // sized before the fr tracks were, so past the point where both fit it kept its width and was
    // centered over the picker at every width up to roughly 1600px.
    //
    // Inside the strip the links are `mx-auto` rather than `justify-center`. Auto margins absorb only
    // *positive* free space, so a strip wider than its box starts at the left edge and every tab can
    // be scrolled to; `justify-center` would have parked the first tabs beyond the scroll's reach.
    //
    // Below `nav:` (1460px — see `index.css`) the strip is `basis-full`, which under `flex-wrap` gives
    // it its own row across the whole width, with the brand and season on the left of row one and the
    // auth cluster on the right. That is a laptop, not just a tablet: the single row only fits when
    // every part of it is at full size, and the `lg` cutover it replaced left four hundred pixels of
    // widths where the last tabs slid under the sign-in buttons. The nav gets taller, and stays one
    // fixed shape on every page — the same reason the season selector was folded in here to begin
    // with.
    //
    // The scroller lives on the tab cell rather than the <nav> on purpose — `overflow-x` on the nav
    // computes `overflow-y: auto` too, which would clip the account dropdown.
    //
    // On desktop the content scrolls in a box below the nav (`SiteLayout`), so nothing passes under
    // it and `sticky top-0` is idle there; it stays for the z-index, which the dropdowns and the
    // drawer rely on to paint over the page, and so the two branches read alike.
    <nav className="bg-bg2 border-b-2 border-brand w-full px-6 flex flex-wrap nav:flex-nowrap items-center gap-x-4 sticky top-0 z-[150]">
      <div className="order-1 flex flex-1 basis-0 min-w-fit items-center gap-3 py-3">
        <CcsBrand />
        {season && (
          <div className="flex items-center gap-2 text-[11px]">
            {season}
            {/* Only on the single-row layout, where it was measured in — the full season name
                still carries the year, so nothing is lost on the two-row one. */}
            {!isCurrent && (
              <span className="hidden nav:inline text-text-dim font-heading whitespace-nowrap">
                Past season
              </span>
            )}
          </div>
        )}
      </div>
      {/* Its own row below `nav:`, the middle of row one from `nav:` up. The bottom border of the
          active tab sits on the nav's own red rule in both layouts. */}
      <div
        className="order-3 nav:order-2 basis-full nav:basis-auto min-w-0 flex overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="mx-auto flex items-center">
          {tabs.map(t => (
            <Link
              key={t.path}
              to={seasonLink(t.path)}
              aria-current={active === t.label ? "page" : undefined}
              className={`bg-transparent cursor-pointer py-2.5 nav:py-3.5 px-2.5 nav:px-4 font-display text-[15px] whitespace-nowrap no-underline transition-colors hover:text-brand ${active === t.label ? "text-text-bright border-b-2 border-b-brand" : "text-text font-medium border-b-2 border-b-transparent"
                }`}
            >
              {t.label}
            </Link>
          ))}
          {EXTERNAL_LINKS.map(l => (
            <a
              key={l.label}
              href={l.href}
              target={l.href !== "#" ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="bg-transparent cursor-pointer py-2.5 nav:py-3.5 px-2.5 nav:px-4 font-display text-[15px] whitespace-nowrap border-b-2 border-b-transparent text-text font-medium no-underline transition-colors hover:text-brand"
            >
              {l.label}
            </a>
          ))}
          {adminConf && (
            <Link
              to={`/league/${encodeURIComponent(adminConf)}/admin`}
              aria-current={onLeagueAdmin ? "page" : undefined}
              className={`bg-transparent cursor-pointer py-2.5 nav:py-3.5 px-2.5 nav:px-4 font-display text-[15px] whitespace-nowrap no-underline transition-colors hover:text-brand ${onLeagueAdmin ? "text-text-bright border-b-2 border-b-brand" : "text-text font-medium border-b-2 border-b-transparent"
                }`}
            >
              Admin
            </Link>
          )}
        </div>
      </div>
      <div className="order-2 nav:order-3 flex flex-1 basis-0 min-w-fit items-center justify-end gap-3">
        <AuthControl />
        <ThemeToggle />
      </div>
    </nav>
  );
}
