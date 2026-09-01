/**
 * The catch-all: a URL this site has no route for.
 *
 * It exists because of the nginx SPA fallback. Every unmatched path is handed `index.html` so that
 * `/schedule` survives a refresh, which means the server can no longer tell a real page from a typo —
 * by the time anything knows, react-router is already running. Without a `path="*"` route, `Routes`
 * matched nothing and rendered nothing, and a mistyped URL was a silent blank page.
 *
 * **This is a soft 404: the response status is 200 and nothing here can change that.** The status line
 * was written before the bundle loaded. Hence the `noindex` below — it is the only signal available for
 * saying "don't keep this URL", and a crawler that renders the page will see it.
 *
 * No ticker, deliberately — which is why this route is declared under the plain `SiteLayout` rather
 * than the one the public data tabs share. The strip polls `GET /schedule` every thirty seconds and
 * this page has no news to carry; the nav and the signposts below are the way out of here.
 */

import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";

/**
 * Ask crawlers not to keep this URL, for as long as this page is the one mounted.
 *
 * Removed on unmount rather than left in place: this is one document for the whole session, so a tag
 * added here and forgotten would go on to tell a crawler that Standings is `noindex` too, the moment a
 * visitor clicked through from a 404.
 */
function useNoIndex() {
  useEffect(() => {
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = "noindex";
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);
}

export default function NotFound() {
  const { pathname } = useLocation();
  useNoIndex();

  return (
    <PageShell maxWidth={720}>
      <div className="mx-auto mt-16 max-w-[500px] px-5 text-center">
        <span className="font-display block text-[64px] leading-none tracking-widest text-text-dim">
          404
        </span>
        <h1 className="font-display mt-3 mb-2 text-[26px] tracking-widest text-text-bright">
          PAGE NOT FOUND
        </h1>

        {/* The path is worth showing: most of the way this page gets reached is a truncated or
            mistyped link, and seeing where the missing slash is answers it without a support round
            trip. `break-all` because a pasted URL has no spaces to wrap at. */}
        <p className="mb-6 text-sm leading-relaxed text-text-muted">
          Nothing lives at{" "}
          <span className="rounded bg-bg-input px-1.5 py-0.5 font-mono text-[13px] break-all text-text-secondary">
            {pathname}
          </span>
          .
        </p>

        {/* One way out, and only one. The nav above already lists every section, so a second set of
            links here would be the same choice offered twice. */}
        <Link
          to="/"
          className="font-heading inline-block rounded-md bg-brand px-7 py-3 text-sm font-medium tracking-wider text-white uppercase no-underline"
        >
          Back to home
        </Link>
      </div>
    </PageShell>
  );
}
