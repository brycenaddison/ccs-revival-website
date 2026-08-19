import { Link, useLocation } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useSeasonLink } from "../../lib/leagueContext";
import { TABS, tabForPathname } from "../../lib/tabs";

const MERCH = { label: "Merch", icon: ShoppingCart, href: "https://classicchampionshipseries.itemorder.com/shop/sale/" };

const ITEM = "bg-transparent border-none cursor-pointer flex flex-col items-center gap-1 py-1.5 px-3 min-w-[56px] no-underline";
const LABEL = "font-heading text-[9px] tracking-wide uppercase";

/**
 * The bottom bar carries a subset of the nav — see `inBottomBar` — plus the merch link, which is
 * external and so stays an ordinary anchor. Like the nav, the current entry comes from the URL.
 *
 * Icons are lucide components drawn in `currentColor`, so the active state is a colour change on
 * both icon and label. The emoji this replaced could only be dimmed with a grayscale filter, which
 * left the accent colour unavailable and the glyphs at the mercy of each platform's emoji font.
 */
export function MobileBottomBar() {
  const active = tabForPathname(useLocation().pathname);
  const seasonLink = useSeasonLink();

  return (
    // The height this composes to is mirrored by `--bottom-nav-h` in index.css, which is what the
    // pages reserve room with and what the compare dock sits on top of. Change the padding, the icon
    // size or the label size here and that token has to move with it.
    // `bg-bg2/95` rather than a literal near-black: the hardcoded `rgba(10,10,10,0.95)` this
    // replaces left the bar dark in light mode, which is the one place on the site the theme
    // toggle did nothing. The alpha is what the blur behind it needs to be worth having.
    <div className="fixed bottom-0 left-0 right-0 bg-bg2/95 backdrop-blur-xl border-t border-border flex justify-around items-center z-[200]" style={{ padding: "6px 0 env(safe-area-inset-bottom, 8px)" }}>
      {TABS.filter(t => t.inBottomBar).map(t => {
        const current = active === t.label;
        const Icon = t.icon;
        return (
          <Link
            key={t.path}
            to={seasonLink(t.path)}
            aria-current={current ? "page" : undefined}
            className={`${ITEM} ${current ? "text-accent" : "text-text-muted"}`}
          >
            <Icon size={19} strokeWidth={current ? 2.5 : 2} aria-hidden="true" />
            <span className={`${LABEL} ${current ? "font-bold" : "font-normal"}`}>{t.label}</span>
          </Link>
        );
      })}
      <a href={MERCH.href} target="_blank" rel="noopener noreferrer" className={`${ITEM} text-text-muted`}>
        <MERCH.icon size={19} strokeWidth={2} aria-hidden="true" />
        <span className={`${LABEL} font-normal`}>{MERCH.label}</span>
      </a>
    </div>
  );
}
