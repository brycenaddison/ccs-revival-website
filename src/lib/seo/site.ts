/** Pure shared policy: browser metadata, the HTML shell and deployment generation use this file. */
export const SITE_NAME = "Classic Championship Series";
export const DEFAULT_SITE_ORIGIN = "https://www.ccsesports.org";
export const HOME_TITLE = `${SITE_NAME} | Amateur League of Legends`;
export const SITE_DESCRIPTION = "Classic Championship Series (CCS) is a community-run amateur League of Legends league in North America. Follow CCS news, teams, schedules and results.";
export const NEWS_PAGE_SIZE = 24;
export const PUBLIC_LANDING_PATHS = ["/", "/news", "/info"] as const;

export function siteOrigin(value: string | undefined): string {
  if (!value) throw new Error("VITE_SITE_ORIGIN is required; use the production HTTPS origin (see .env.example).");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VITE_SITE_ORIGIN must be an HTTPS origin without a path, port, credentials, query or fragment.");
  }
  return url.origin;
}

export function newsPagePath(page: number): string {
  return page === 1 ? "/news" : `/news/page/${page}`;
}

export function parseNewsPage(value: string | undefined): number | null {
  if (value === undefined) return 1;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && Number.isSafeInteger(page * NEWS_PAGE_SIZE) ? page : null;
}

export function articlePath(slug: string): string {
  return `/news/${encodeURIComponent(slug)}`;
}

/** Query policy is per family. Season/profile filters describe different content; news is global. */
export function canonicalPath(pathname: string, search = ""): string {
  let path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/news/page/1") path = "/news";
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  const seasonScoped = ["/", "/scores", "/schedule", "/standings", "/stats", "/teams", "/info"].includes(path);
  if (seasonScoped || /^\/players\/[^/]+$/.test(path)) {
    const conf = params.get("conf")?.trim();
    if (conf) kept.set("conf", conf);
  }
  // The current public pages only read conf from the query. Other controls are local state.
  kept.sort();
  return path + (kept.size ? `?${kept}` : "");
}

export function publicUrl(origin: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("Expected a local absolute path.");
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Public URL escaped the configured origin.");
  return url.href;
}

export function httpsImage(value: string | null | undefined, origin: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, origin);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

export function serializeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
