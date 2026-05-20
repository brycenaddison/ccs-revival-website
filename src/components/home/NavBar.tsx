import { useState } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "../ThemeToggle";

interface Props {
  active: string;
  setActive: (tab: string) => void;
  isMobile: boolean;
}

const TABS = ["Home", "Scores", "Schedule", "Standings", "Stats", "Teams", "Draft Board", "Archive"];
const EXTERNAL_LINKS = [{ label: "Merch", href: "https://classicchampionshipseries.itemorder.com/shop/sale/" }];

export function NavBar({ active, setActive, isMobile }: Props) {
  const [open, setOpen] = useState(false);

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
              <button
                key={t}
                onClick={() => { setActive(t); setOpen(false); }}
                className={`block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 font-heading text-sm tracking-wider uppercase border-l-[3px] ${
                  active === t ? "bg-bg-input text-text-bright font-bold border-l-accent" : "text-text-secondary font-normal border-l-transparent"
                }`}
              >
                {t}
              </button>
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
            <div className="px-5 py-2.5 border-t border-border">
              <ThemeToggle />
            </div>
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav className="bg-bg2 border-b-2 border-accent flex items-center w-full px-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <div className="flex items-center gap-2 mr-8 py-3 min-w-fit">
        <span className="text-[22px]">⚔️</span>
        <span className="font-display text-[22px] text-text-bright tracking-widest">
          CCS
        </span>
      </div>
      <div className="flex-1 flex justify-center items-center">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`bg-transparent cursor-pointer py-3.5 px-4 font-heading text-sm tracking-wider whitespace-nowrap uppercase border-0 ${
              active === t ? "text-text-bright font-bold border-b-2 border-b-accent" : "text-text-secondary font-normal border-b-2 border-b-transparent"
            }`}
          >
            {t}
          </button>
        ))}
        {EXTERNAL_LINKS.map(l => (
          <a
            key={l.label}
            href={l.href}
            target={l.href !== "#" ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="bg-transparent cursor-pointer py-3.5 px-4 font-heading text-sm tracking-wider whitespace-nowrap uppercase border-b-2 border-b-transparent text-text-secondary no-underline"
          >
            {l.label}
          </a>
        ))}
      </div>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
      <Link to="/admin" className="text-[10px] text-text-dim font-heading no-underline tracking-wide py-3.5 px-3">
        ADMIN
      </Link>
    </nav>
  );
}
