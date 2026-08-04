/**
 * The chrome every page wears: nav, content column, footer, mobile tab bar.
 *
 * Home and Stats each hand-rolled all of it, which is how they ended up disagreeing — and the mobile
 * bottom-padding reservation had to be fixed in two places when the bottom bar's height moved. Anything
 * that belongs on "a page" now has exactly one definition.
 *
 * There used to be a season bar above the nav carrying the season selector and JOIN CCS. Both moved
 * *into* `NavBar` — the selector into the left cluster, JOIN CCS alongside Log in — because the bar had
 * to be hidden on the settings and admin pages, where a season selector controls nothing, and chrome
 * that changes height between pages reads as the layout breaking. The nav is now the same shape
 * everywhere; only the selector inside it comes and goes.
 *
 * It reads `useWindowSize()` itself rather than taking it as a prop, so a page adds the chrome by
 * wrapping its content and nothing else. Pages that also need `isMobile` for their own layout call the
 * hook again; it's a resize listener, not a fetch.
 *
 * Not wired as a react-router layout route with an `<Outlet/>`, which would remove the wrapper from the
 * pages entirely. Two things want per-page values that a route element can't receive: the content width
 * (Home is wider than Stats) and `extraBottom`, which on Stats depends on how many players the leaderboard
 * has selected for comparison — state that lives inside the page. Passing those as props to a component
 * the page renders is the lesser of the two awkwardnesses.
 */

import { useWindowSize } from "../../hooks/useWindowSize";
import { NavBar } from "../home/NavBar";
import { MobileBottomBar } from "../home/MobileBottomBar";

interface Props {
  /**
   * Content column width. A number is pixels; a CSS length is passed through, so `"100%"` is how a page
   * asks for the full viewport minus this shell's own padding — which the bracket editor needs, because
   * a season laid out in day columns has no natural width to cap at.
   */
  maxWidth?: number | string;
  /** Rendered above the nav — the scoreboard ticker, on Home. Scrolls away; the nav then pins. */
  ticker?: React.ReactNode;
  /**
   * Extra bottom padding, as a CSS length, for a page that pins something over its own content.
   * Added on top of the room already reserved for the mobile tab bar.
   */
  extraBottom?: string;
  children: React.ReactNode;
}

export function PageShell({ maxWidth = 1280, ticker, extraBottom, children }: Props) {
  const isMobile = useWindowSize() < 768;

  const navReserve = isMobile ? "var(--bottom-nav-h)" : "0px";

  return (
    <div
      className="bg-bg min-h-screen w-full text-text font-body"
      style={{ paddingBottom: extraBottom ? `calc(${extraBottom} + ${navReserve})` : navReserve }}
    >
      {ticker}
      <NavBar isMobile={isMobile} />

      <div className="mx-auto" style={{ maxWidth, padding: isMobile ? 12 : "24px 32px" }}>
        {children}
      </div>

      <footer
        className="border-t border-bg3 text-center mt-10"
        style={{ padding: isMobile ? "20px 12px" : "24px 20px" }}
      >
        <span className="font-display text-lg text-text-subtle tracking-widest">CCS</span>
        <div className="text-[10px] text-text-subtle mt-2">Amateur Esports · Community Driven</div>
      </footer>

      {isMobile && <MobileBottomBar />}
    </div>
  );
}
