/**
 * How a page declares the shape of its content column.
 *
 * This used to render the chrome itself — nav, content column, footer, mobile tab bar, and the
 * scoreboard ticker above the nav. All of that now lives in `SiteLayout`, the route element every
 * route is declared under (see `main.tsx`); `PageShell` is the page-side half of that split. A page
 * still wraps its content in it, but the wrapper draws nothing: it publishes the two values the
 * layout can't know — the column width, and the padding a page that pins something over its own
 * content needs — and renders its children where the layout put the `<Outlet/>`.
 *
 * The split exists because the chrome has to *survive* navigation. The ticker scrolls itself to the
 * live series with an imperative `scrollLeft` and polls `GET /schedule` every thirty seconds; while
 * each page mounted its own copy, moving from `/scores` to `/schedule` unmounted it and the strip
 * snapped back to the far left of the fortnight — a fresh strip on every click, which is exactly
 * what a persistent one is supposed to avoid. Rendered by a layout route it is one instance for the
 * whole group of pages that show it. Lazy routes made this worse, not better: the page-level
 * `<Suspense>` replaced the entire site with a loading line while the next chunk downloaded, so the
 * nav went away too. That boundary now sits inside the layout, around the content column only.
 *
 * The reason this *wasn't* a layout route before is that two of its values are per-page and one of
 * them is per-render: Home is wider than Stats, and Stats' bottom padding depends on how many
 * players its leaderboard has selected for comparison. A context the page writes and the layout
 * reads answers both. The write is a `useLayoutEffect`, so React commits the corrected width before
 * the browser paints and the column never flashes at the previous page's size.
 *
 * Anything genuinely shared between pages still belongs here rather than in a page: the mobile
 * bottom-padding reservation was fixed twice, in two hand-rolled copies of this shell, which is the
 * mistake the file exists to prevent.
 */

import { createContext, useContext, useLayoutEffect } from "react";

export interface PageColumn {
  /**
   * Content column width. A number is pixels; a CSS length is passed through, so `"100%"` is how a
   * page asks for the full viewport minus the shell's own padding — which the bracket editor needs,
   * because a season laid out in day columns has no natural width to cap at.
   */
  maxWidth: number | string;
  /**
   * Extra bottom padding, as a CSS length, for a page that pins something over its own content.
   * Added on top of the room already reserved for the mobile tab bar.
   */
  extraBottom?: string;
}

/** What the layout renders for a page that asks for nothing: a comfortable capped column. */
export const DEFAULT_COLUMN: PageColumn = { maxWidth: 1280 };

/**
 * Written by `PageShell`, read by `SiteLayout`. The default is a no-op so a `PageShell` rendered
 * outside a layout route still renders its children — it just gets no chrome, which is a routing
 * mistake to fix in `main.tsx` rather than a crash.
 */
export const PageColumnContext = createContext<(column: PageColumn) => void>(() => {});

interface Props extends Partial<PageColumn> {
  children: React.ReactNode;
}

export function PageShell({ maxWidth = DEFAULT_COLUMN.maxWidth, extraBottom, children }: Props) {
  const setColumn = useContext(PageColumnContext);

  // `useLayoutEffect`, not `useEffect`: this runs after the page's first render but before the
  // paint, so a narrower page never appears for a frame at the width of the one it replaced.
  useLayoutEffect(() => {
    setColumn({ maxWidth, extraBottom });
  }, [setColumn, maxWidth, extraBottom]);

  return <>{children}</>;
}
