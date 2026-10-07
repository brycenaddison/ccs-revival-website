/** Small deterministic acceptance harness. Run with Node 24 via pnpm seo:check; no live API. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readArticleInventory, validateInventoryPage, type ArticleInventoryRow } from "../src/lib/api/publicArticleInventory.ts";
import { sitemapArtifacts } from "../src/lib/seo/sitemap.ts";
import { canonicalPath, DEFAULT_SITE_ORIGIN, escapeMarkup, NEWS_PAGE_SIZE, parseNewsPage, serializeJson, siteOrigin } from "../src/lib/seo/site.ts";
import { defaultMetadata, metadataTags } from "../src/lib/seo/metadata.ts";
import { articleExcerpt, articleMetadata } from "../src/lib/seo/articleMetadata.ts";
import { routeMetadata } from "../src/lib/seo/routes.ts";

const origin = siteOrigin(DEFAULT_SITE_ORIGIN);
const fixture = (count: number): ArticleInventoryRow[] => Array.from({ length: count }, (_, i) => ({
  slug: `story-${i}`, kind: i % 4 === 0 ? "link" : "native", publishedAt: new Date(Date.UTC(2026, 8, 28) - i * 86_400_000).toISOString(),
}));
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const requests: number[] = [];
const rows = fixture(73);
const serve: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.searchParams.get("conf"), null);
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(init?.credentials, "omit");
  assert.equal(init?.cache, "no-store");
  const offset = Number(url.searchParams.get("offset"));
  requests.push(offset);
  return json(rows.slice(offset, offset + 50));
};
assert.deepEqual(await readArticleInventory("https://api.example.org", serve), rows);
assert.deepEqual(requests, [0, 50, 0, 50]);
const generated = sitemapArtifacts(rows, origin);
assert(generated.urls.includes(`${origin}/news/page/4`));
assert(generated.urls.includes(`${origin}/news/story-71`));
assert(!generated.urls.includes(`${origin}/news/story-72`));
assert(!generated.sitemap.includes("lastmod"));
assert(!generated.sitemap.includes("priority"));
assert(!generated.sitemap.includes("changefreq"));
assert.equal((generated.sitemap.match(/<url>/g) ?? []).length, generated.urls.length);
assert(generated.robots.includes(`Sitemap: ${origin}/sitemap.xml`));
assert(!generated.robots.includes("Disallow"));
for (const size of [0, 24, 48, 50, 72, 73]) {
  const urls = sitemapArtifacts(fixture(size), origin).urls;
  const archivePages = urls.filter(url => /\/news(?:\/page\/\d+)?$/.test(url));
  assert.equal(archivePages.length, Math.max(1, Math.ceil(size / NEWS_PAGE_SIZE)));
  assert(!urls.some(url => /\/admin|\/settings|\/players|\/teams|\/match|\/login/.test(url)));
}
for (const payload of [null, {}, "unavailable", [{ ...rows[1], kind: "draft" }], [{ ...rows[1], slug: "../admin" }], [{ ...rows[1], isPublished: false }]]) {
  assert.throws(() => validateInventoryPage(payload, 50));
  await assert.rejects(readArticleInventory("https://api.example.org", async () => json(payload)));
}
await assert.rejects(readArticleInventory("https://api.example.org", async () => json([], 503)));
await assert.rejects(readArticleInventory("https://api.example.org", async () => json([], 404)));
await assert.rejects(readArticleInventory("https://api.example.org", async () => new Response("<html>SPA fallback</html>")));
await assert.rejects(readArticleInventory("https://api.example.org", async () => json(fixture(50))), /repeated slug/);
await assert.rejects(readArticleInventory("https://api.example.org", async () => json([...fixture(2)].reverse())), /publication order/);
assert.deepEqual(await readArticleInventory("https://api.example.org", async () => json([])), []);
let movingPass = 0;
await assert.rejects(readArticleInventory("https://api.example.org", async () => json(fixture(++movingPass))), /kept changing/);
let changedOnce = false;
assert.deepEqual(await readArticleInventory("https://api.example.org", async () => {
  const snapshot = changedOnce ? fixture(3) : fixture(2);
  changedOnce = true;
  return json(snapshot);
}), fixture(3));
assert.throws(() => sitemapArtifacts([rows[1], rows[1]], origin), /Duplicate/);
assert.equal(canonicalPath("/news/page/2/", "?conf=old&utm_source=discord"), "/news/page/2");
assert.equal(canonicalPath("/news/story-1", "?conf=old"), "/news/story-1");
assert.equal(canonicalPath("/standings", "?conf=old&utm_source=x"), "/standings?conf=old");
assert.equal(canonicalPath("/players/1", "?conf=old&utm_source=x"), "/players/1?conf=old");
assert.equal(canonicalPath("/teams/42", "?conf=unrelated"), "/teams/42");
assert.equal(canonicalPath("/news/page/1"), "/news");
for (const page of ["0", "-1", "01", "1.5", "abc", "999999999999999999"]) assert.equal(parseNewsPage(page), null);
assert.equal(parseNewsPage(undefined), 1);
assert.equal(parseNewsPage("3"), 3);
for (const bad of ["http://example.org", "https://example.org/path", "https://name:password@example.org", "https://example.org?x=1"]) assert.throws(() => siteOrigin(bad));
assert.equal(escapeMarkup('a&<>"'), "a&amp;&lt;&gt;&quot;");
const hostile = { headline: "</script><script>alert(1)</script>" };
assert(!serializeJson(hostile).includes("<"));
assert.deepEqual(JSON.parse(serializeJson(hostile)), hostile);
const shell = metadataTags(defaultMetadata(), origin);
assert.equal(shell["og:url"], undefined);
assert.equal(shell.robots, undefined);
assert.equal(shell["og:image"], `${origin}/android-chrome-512x512.png`);
assert.equal(shell["og:image:width"], "512");
for (const path of ["/settings/profile", "/admin", "/league/a/admin", "/content/articles", "/register", "/setup", "/login", "/my-applications", "/team-invitations", "/missing", "/teams/old/ABC"]) {
  assert.equal(routeMetadata(path, "", origin).noindex, true);
}
assert.equal(routeMetadata("/teams/42", "?conf=old", origin).path, "/teams/42");
assert.equal(routeMetadata("/teams/42", "", origin).noindex, undefined);
assert.equal(routeMetadata("/", "", origin).structuredData?.["@type"], "WebSite");
assert.equal(routeMetadata("/news", "", origin).structuredData, undefined);
assert.equal(routeMetadata("/news", "?conf=old", origin).path, "/news");
assert.equal(routeMetadata("/standings", "?conf=old", origin).path, "/standings?conf=old");
assert.equal(routeMetadata("/", "", origin).noindex, undefined);
const article = {
  ...rows[1], title: "A championship story", subtitle: null, author: "CCS Writer", body: "## Hello\nA **great** [match](https://example.org).", imageUrl: "https://images.example.org/cover.png",
  updatedAt: "2026-09-28T12:00:00Z", createdAt: "2026-09-01T00:00:00Z", isPublished: true, createdBy: 42,
  url: null, tag: null, conf: null, articleType: "news" as const,
};
const metadata = articleMetadata(article, origin);
assert.equal(metadata.description, "Hello A great match.");
assert.deepEqual(metadata.structuredData?.author, { "@type": "Person", name: "CCS Writer" });
assert(!serializeJson(metadata.structuredData).includes("42"));
assert.equal(metadataTags(metadata, origin)["og:image:width"], undefined);
assert.equal(articleMetadata({ ...article, kind: "link" }, origin).noindex, true);
assert.equal(articleMetadata({ ...article, author: null }, origin).structuredData?.author, undefined);
assert.equal(articleExcerpt("![cover](https://example.org/a.png)\nText"), "Text");
assert.equal(articleExcerpt("[TOC]\n\n## Setup\n\nBody text."), "Setup Body text.");
const png = await readFile(new URL("../static/android-chrome-512x512.png", import.meta.url));
assert.equal(png.readUInt32BE(16), 512);
assert.equal(png.readUInt32BE(20), 512);
console.log("SEO checks passed: complete paginated inventory, failure handling, canonical policy, metadata and safe serialization.");
