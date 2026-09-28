import { validateInventoryPage, type ArticleInventoryRow } from "../api/publicArticleInventory.ts";
import { articlePath, escapeMarkup, NEWS_PAGE_SIZE, newsPagePath, PUBLIC_LANDING_PATHS, publicUrl, siteOrigin } from "./site.ts";

export function sitemapArtifacts(rows: readonly ArticleInventoryRow[], configuredOrigin: string) {
  const origin = siteOrigin(configuredOrigin);
  validateInventoryPage(rows, 50_000);
  if (new Set(rows.map(row => row.slug)).size !== rows.length) throw new Error("Duplicate article slugs in sitemap inventory.");
  const paths: string[] = [...PUBLIC_LANDING_PATHS];
  for (let page = 2; page <= Math.ceil(rows.length / NEWS_PAGE_SIZE); page++) paths.push(newsPagePath(page));
  for (const row of rows) if (row.kind === "native") paths.push(articlePath(row.slug));
  const urls = paths.map(path => publicUrl(origin, path));
  if (urls.length > 50_000 || new Set(urls).size !== urls.length) throw new Error("Invalid sitemap URL inventory.");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${escapeMarkup(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
  if (new TextEncoder().encode(sitemap).length > 50 * 1024 * 1024) throw new Error("Sitemap exceeded 50 MB.");
  return { sitemap, robots: `User-agent: *\nAllow: /\n\nSitemap: ${publicUrl(origin, "/sitemap.xml")}\n`, urls };
}
