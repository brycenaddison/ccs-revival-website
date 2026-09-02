/**
 * Recovery for a page chunk that no longer exists on the server.
 *
 * Every lazy route is a hashed file under `/assets/`, and a deploy renames every one of them. A tab
 * that loaded the previous `index.html` still holds the previous names, so the first time it visits
 * a page it has not opened yet it asks for a chunk the deploy deleted. The server answers with its
 * SPA fallback, `index.html` as `text/html`, and the browser refuses to run that as a module:
 * "Loading module … was blocked because of a disallowed MIME type", then "error loading dynamically
 * imported module". Without this, that surfaced as the whole tree unmounting on the way to `/admin`.
 *
 * The cure is a fresh `index.html`, which is a reload: the new document names the new chunks and the
 * visit that failed succeeds on its second try. Vite reports the failure as a `vite:preloadError`
 * event on `window` before rethrowing, and `preventDefault()` on it swallows the throw, so the reload
 * happens instead of the crash.
 *
 * **Once, not in a loop.** If the reloaded page fails the same way again, the asset is genuinely
 * missing rather than merely renamed, and reloading forever would leave the visitor staring at a
 * flicker. The URL and time of the last reload live in `sessionStorage`; a second failure on the same
 * URL within the window below is left alone, and the error reaches `RouteErrorBoundary`, which offers
 * the visitor a button rather than a spinner. The window is short so that a legitimate later deploy,
 * hours on, gets its own reload.
 *
 * The deploy side does its part too: `deploy.yml` keeps the previous build's assets on the server
 * for a grace period rather than deleting them the moment the new ones land, so an open tab mostly
 * never hits this at all. This is the net under that.
 */

const KEY = "ccs:stale-chunk-reload";
const RETRY_WINDOW_MS = 60_000;

export function installStaleChunkReload(): void {
  window.addEventListener("vite:preloadError", (event: Event) => {
    const here = window.location.href;
    const now = Date.now();

    let last: { href: string; at: number } | null = null;
    try {
      const raw = sessionStorage.getItem(KEY);
      last = raw ? (JSON.parse(raw) as { href: string; at: number }) : null;
    } catch {
      // Storage unavailable or unreadable. Reload once anyway; the guard below just cannot stop a
      // second attempt, and a crash is still the worse outcome.
    }

    if (last && last.href === here && now - last.at < RETRY_WINDOW_MS) {
      // Already tried for this page. Let the error propagate to the boundary.
      return;
    }

    try {
      sessionStorage.setItem(KEY, JSON.stringify({ href: here, at: now }));
    } catch {
      // See above.
    }
    event.preventDefault();
    window.location.reload();
  });
}
