import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "../ThemeToggle";
import { AuthControl } from "../auth/AuthControl";
import { useSeasonLink } from "../../lib/leagueContext";
import { TABS, tabForPathname } from "../../lib/tabs";

interface Props {
  isMobile: boolean;
}

const EXTERNAL_LINKS = [{ label: "Merch", href: "https://classicchampionshipseries.itemorder.com/shop/sale/" }];

/**
 * Tabs are real links, so they can be opened in a new tab, bookmarked and shared. Which one is
 * current comes from the URL rather than a prop — there is no second source of truth to keep in
 * step with it.
 */
export function NavBar({ isMobile }: Props) {
  const [open, setOpen] = useState(false);
  const active = tabForPathname(useLocation().pathname);
  // Tabs change only the section, so they keep the season being viewed.
  const seasonLink = useSeasonLink();

  if (isMobile) {
    return (
      <nav className="bg-bg2 border-b-2 border-accent relative z-[150]">
        <div className="flex items-center justify-between px-4">
          <div className="flex items-center gap-2 py-2.5">
            <span className="text-xl">⚔️</span>
            <span className="font-display text-xl text-text-bright tracking-widest">
              CCS
            </span>
          </div>
          <button onClick={() => setOpen(!open)} className="bg-transparent border-none cursor-pointer p-2 flex flex-col gap-1">
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
            <AuthControl variant="menu" />
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
    <nav className="bg-bg2 border-b-2 border-accent w-full px-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <div className="justify-self-start flex items-center gap-2 py-3 min-w-fit">
        <span className="text-[22px]">⚔️</span>
        <span className="font-display text-[22px] text-text-bright tracking-widest">
          CCS
        </span>
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
      </div>
      <div className="justify-self-end flex items-center gap-3">
        <AuthControl />
        <ThemeToggle />
      </div>
    </nav>
  );
}
