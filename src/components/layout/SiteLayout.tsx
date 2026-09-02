/**
 * The chrome every page wears — mounted once per route group instead of once per page.
 *
 * This is a react-router layout route: `main.tsx` declares every route under one of two instances,
 * one with the scoreboard ticker and one without, and the pages render into the `<Outlet/>` below.
 * Two things follow from that, and both are the point:
 *
 * -   **The ticker survives navigation.** It polls `GET /schedule` and scrolls itself to the live
 *     series; a per-page copy was unmounted and re-anchored on every click. Which routes carry it is
 *     a property of the group, not of the page, which is why it is a boolean rather than a node.
 * -   **The lazy-route `<Suspense>` boundary is inside the chrome.** A page chunk downloading
 *     replaces the content column with a loading line; the ticker, the nav and the footer stay
 *     exactly where they are. With the boundary above `<Routes>` the whole site blinked instead.
 *
 * The two values a layout route can't receive as props — the column width, and the extra bottom
 * padding Stats needs while its compare dock is up — arrive through `PageColumnContext`, which the
 * page's own `PageShell` writes. Read that file's header before changing this one; the two halves
 * only make sense together.
 *
 * `useWindowSize()` is read here rather than passed in, so a page adds the chrome by being routed
 * under it and nothing else. Pages that need `isMobile` for their own layout call the hook again;
 * it's a resize listener, not a fetch.
 *
 * There used to be a season bar above the nav carrying the season selector and JOIN CCS. Both moved
 * *into* `NavBar` — the selector into the left cluster, JOIN CCS alongside Log in — because the bar
 * had to be hidden on the settings and admin pages, where a season selector controls nothing, and
 * chrome that changes height between pages reads as the layout breaking. The nav is now the same
 * shape everywhere; only the selector inside it comes and goes.
 */

import { Suspense, useCallback, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { useWindowSize } from "../../hooks/useWindowSize";
import { NavBar } from "../home/NavBar";
import { MobileBottomBar } from "../home/MobileBottomBar";
import { ScoreboardTicker } from "../home/ScoreboardTicker";
import { DEFAULT_COLUMN, PageColumnContext, type PageColumn } from "./PageShell";

interface Props {
  /**
   * Whether this group of routes carries the scoreboard ticker above the nav. It scrolls away with
   * the page; the nav then pins. Left off wherever the strip would be a fortnight of scores a reader
   * has to scroll past to reach what they came for — a 404, first-time setup, settings and admin.
   */
  ticker?: boolean;
}

export function SiteLayout({ ticker = false }: Props) {
  const isMobile = useWindowSize() < 768;
  const { pathname } = useLocation();

  const [column, setColumn] = useState<PageColumn>(DEFAULT_COLUMN);

  // Identity-stable, so the effect in `PageShell` that calls it doesn't re-run every render, and
  // equal values don't re-render the chrome — most navigations keep the same column width, and the
  // ticker has no reason to re-render because the page under it changed.
  const publishColumn = useCallback((next: PageColumn) => {
    setColumn(prev =>
      prev.maxWidth === next.maxWidth && prev.extraBottom === next.extraBottom ? prev : next,
    );
  }, []);

  const navReserve = isMobile ? "var(--bottom-nav-h)" : "0px";
  const { maxWidth, extraBottom } = column;

  // A column with the content set to grow, so the footer sits on the bottom of the *viewport* when a
  // page is shorter than one — a 404, a login redirect, an empty season — and directly under the
  // content when it is longer. `min-h-screen` alone only guaranteed the second: anything short left the
  // footer floating mid-screen with a band of background under it, which reads as content failing to
  // load rather than as the end of the page.
  //
  // The footer keeps its `mt-10`. Margins count towards a flex line's free space, so the grow resolves
  // around it rather than overflowing by 40px and minting a scrollbar on a page that fits.
  return (
    <div
      className="bg-bg flex min-h-screen w-full flex-col text-text font-body"
      style={{ paddingBottom: extraBottom ? `calc(${extraBottom} + ${navReserve})` : navReserve }}
    >
      {ticker && <ScoreboardTicker />}
      <NavBar isMobile={isMobile} />

      {/* `flex-1` lives on this wrapper rather than the content column, which has to keep `mx-auto` and
          a max width to stay centerd and capped. */}
      <main className="flex-1">
        <div className="mx-auto" style={{ maxWidth, padding: isMobile ? 12 : "24px 32px" }}>
          <PageColumnContext.Provider value={publishColumn}>
            {/* The boundary wraps the Suspense, since a lazy chunk that fails to load is thrown to
                the nearest error boundary once its promise rejects. Keyed on the path so the next
                navigation gets a clean try rather than the previous page's failure. */}
            <RouteErrorBoundary key={pathname}>
              <Suspense fallback={<div className="py-16 text-center text-text-subtle">Loading…</div>}>
                <Outlet />
              </Suspense>
            </RouteErrorBoundary>
          </PageColumnContext.Provider>
        </div>
      </main>

      <footer
        className="border-t border-bg3 text-center mt-10"
        style={{ padding: isMobile ? "20px 12px" : "24px 20px" }}
      >
        <span className="font-display text-lg text-text-subtle tracking-widest">CCS</span>
        <div className="text-[10px] text-text-subtle mt-2">Amateur Esports · Community Driven · Website built by gl4cial and dribb</div>
      </footer>

      {isMobile && <MobileBottomBar />}
    </div>
  );
}

/**
 * The layout route for the pages that wear no chrome at all: a match, a game, a team, and the two
 * sign-up screens. They are full-bleed by design — each draws its own header with a back button
 * instead of the nav, and would be two navs and a stray footer deep inside a `SiteLayout`.
 *
 * They still need *a* layout route, because they are lazy chunks and a suspending component with no
 * boundary above it is an error rather than a loading state. The wrapper is a bare full-height
 * background and the Suspense fallback is nothing: these pages have no content column to blank, and a
 * white flash between a match page and its game page is the one thing worth preventing here. The
 * same `RouteErrorBoundary` as `SiteLayout` sits inside it, for the same stale-chunk reason.
 */
export function BareLayout() {
  const { pathname } = useLocation();
  return (
    <div className="bg-bg min-h-screen w-full">
      <RouteErrorBoundary key={pathname}>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </RouteErrorBoundary>
    </div>
  );
}
