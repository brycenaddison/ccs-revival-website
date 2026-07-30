import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "../ThemeToggle";
import { AuthControl } from "../auth/AuthControl";
import { SeasonPicker } from "../league/SeasonPicker";
import { useAdminAccess } from "../../lib/adminAccess";
import { useLeague, useSeasonLink } from "../../lib/leagueContext";
import { TABS, tabForPathname } from "../../lib/tabs";

interface Props {
  isMobile: boolean;
}

const EXTERNAL_LINKS = [{ label: "Merch", href: "https://classicchampionshipseries.itemorder.com/shop/sale/" }];

/**
 * Pages that aren't showing league data, where a season selector would be a control over nothing.
 *
 * League admin is the pointed case: it has its own league picker in the sidebar, scoped to what
 * you're editing, and a second one in the nav — meaning what the *public* views show — reads as the
 * same control twice.
 */
const SEASONLESS_PREFIXES = ["/settings", "/admin", "/league/"];

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
 * CCS button. Both used to live in a strip above the nav in `PageShell`. That strip had to disappear
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
  const { tournaments, activeConfs, selection, setSelection, isCurrent } = useLeague();
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
      // `sticky` rather than `relative`, so the nav pins to the top once anything above it (the
      // scoreboard ticker, on Home) has scrolled away. It is still a positioned ancestor, which is
      // what the drawer's `absolute top-full` needs.
      <nav className="bg-bg2 border-b-2 border-accent sticky top-0 z-[150]">
        <div className="flex items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2 py-2.5 shrink-0">
            <span className="text-xl">⚔️</span>
            <span className="font-display text-xl text-text-bright tracking-widest">
              CCS
            </span>
          </div>
          {/* Between the mark and the hamburger, so which season you're viewing stays visible
              without opening the menu. `min-w-0` lets it give up space before the logo does. */}
          {season && <div className="min-w-0 text-[10px]">{season}</div>}
          <button onClick={() => setOpen(!open)} className="bg-transparent border-none cursor-pointer p-2 flex flex-col gap-1 shrink-0">
            {[0, 1, 2].map(idx => (
              <span
                key={idx}
                className="block w-[22px] h-0.5 rounded-sm transition-all duration-200"
                style={{
                  background: open ? "var(--accent)" : "var(--text-secondary)",
                  transform: open
                    ? idx === 0 ? "rotate(45deg) translate(4px,4px)" : idx === 2 ? "rotate(-45deg) translate(4px,-4px)" : "scaleX(0)"
                    : "none",
                }}
              />
            ))}
          </button>
        </div>
        {open && (
          <div className="absolute top-full left-0 right-0 bg-bg2 border-b-2 border-accent z-[100] shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
            {TABS.map(t => (
              <Link
                key={t.path}
                to={seasonLink(t.path)}
                onClick={() => setOpen(false)}
                aria-current={active === t.label ? "page" : undefined}
                className={`block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 font-heading text-sm tracking-wider uppercase border-l-[3px] no-underline ${
                  active === t.label ? "bg-bg-input text-text-bright font-bold border-l-accent" : "text-text-secondary font-normal border-l-transparent"
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
                className="block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 font-heading text-sm tracking-wider uppercase border-l-[3px] border-l-transparent text-text-secondary no-underline"
              >
                {l.label}
              </a>
            ))}
            {adminConf && (
              <Link
                to={`/league/${encodeURIComponent(adminConf)}/admin`}
                onClick={() => setOpen(false)}
                aria-current={onLeagueAdmin ? "page" : undefined}
                className={`block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 font-heading text-sm tracking-wider uppercase border-l-[3px] no-underline ${
                  onLeagueAdmin ? "bg-bg-input text-text-bright font-bold border-l-accent" : "text-text-secondary font-normal border-l-transparent"
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
    // Three equal-outer-track grid: the `auto` middle is centred against the nav itself, not
    // against whatever space the logo and auth cluster leave over. As width tightens the wider
    // side floors at its min-content size and the menu drifts off-centre; tighter still, the
    // middle's `min-w-0` lets it scroll internally. The scroller lives on the middle cell rather
    // than the <nav> on purpose — `overflow-x` on the nav computes `overflow-y: auto` too, which
    // would clip the account dropdown.
    //
    // `sticky top-0` pins the nav; the z-index is needed for it to paint over the content scrolling
    // beneath it, which the desktop branch previously had no reason to declare.
    <nav className="bg-bg2 border-b-2 border-accent w-full px-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 sticky top-0 z-[150]">
      <div className="justify-self-start flex items-center gap-3 py-3 min-w-fit">
        <span className="text-[22px]">⚔️</span>
        <span className="font-display text-[22px] text-text-bright tracking-widest">
          CCS
        </span>
        {season && (
          <div className="flex items-center gap-2 text-[11px]">
            {season}
            {/* Dropped below `lg`, where the width is worth more to the tab strip than the wording
                is here — the full season name still carries the year. */}
            {!isCurrent && (
              <span className="hidden lg:inline text-text-dim font-heading tracking-wider whitespace-nowrap">
                PAST SEASON
              </span>
            )}
          </div>
        )}
      </div>
      <div className="justify-self-center flex items-center min-w-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {TABS.map(t => (
          <Link
            key={t.path}
            to={seasonLink(t.path)}
            aria-current={active === t.label ? "page" : undefined}
            className={`bg-transparent cursor-pointer py-3.5 px-2.5 lg:px-4 font-heading text-sm tracking-wider whitespace-nowrap uppercase no-underline ${
              active === t.label ? "text-text-bright font-bold border-b-2 border-b-accent" : "text-text-secondary font-normal border-b-2 border-b-transparent"
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
            className="bg-transparent cursor-pointer py-3.5 px-2.5 lg:px-4 font-heading text-sm tracking-wider whitespace-nowrap uppercase border-b-2 border-b-transparent text-text-secondary no-underline"
          >
            {l.label}
          </a>
        ))}
        {adminConf && (
          <Link
            to={`/league/${encodeURIComponent(adminConf)}/admin`}
            aria-current={onLeagueAdmin ? "page" : undefined}
            className={`bg-transparent cursor-pointer py-3.5 px-2.5 lg:px-4 font-heading text-sm tracking-wider whitespace-nowrap uppercase no-underline ${
              onLeagueAdmin ? "text-text-bright font-bold border-b-2 border-b-accent" : "text-text-secondary font-normal border-b-2 border-b-transparent"
            }`}
          >
            Admin
          </Link>
        )}
      </div>
      <div className="justify-self-end flex items-center gap-3">
        <AuthControl />
        <ThemeToggle />
      </div>
    </nav>
  );
}
