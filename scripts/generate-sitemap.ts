/** Node 24's native type stripping runs this build-only command; no TS runtime dependency. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { readArticleInventory } from "../src/lib/api/publicArticleInventory.ts";
import { sitemapArtifacts } from "../src/lib/seo/sitemap.ts";
import { DEFAULT_SITE_ORIGIN, escapeMarkup, publicUrl, siteOrigin } from "../src/lib/seo/site.ts";

const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const origin = siteOrigin(env.VITE_SITE_ORIGIN || DEFAULT_SITE_ORIGIN);
const output = resolve("dist");
const shell = await readFile(resolve(output, "index.html"), "utf8");
if (!shell.includes(escapeMarkup(publicUrl(origin, "/android-chrome-512x512.png")))) {
  throw new Error("Build the SPA with the same VITE_SITE_ORIGIN before generating its sitemap.");
}
const rows = await readArticleInventory(env.VITE_API_BASE_URL ?? "");
const artifacts = sitemapArtifacts(rows, origin);
// No output is touched until the complete inventory and both generated files are validated.
await Promise.all([
  writeFile(resolve(output, "sitemap.xml"), artifacts.sitemap, "utf8"),
  writeFile(resolve(output, "robots.txt"), artifacts.robots, "utf8"),
]);
console.log(`Generated sitemap.xml (${artifacts.urls.length} URLs) and robots.txt from ${rows.length} published articles.`);
