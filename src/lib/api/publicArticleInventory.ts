/** Strict, environment-independent public reads for deployment. No session or presentation fallbacks. */
export interface ArticleInventoryRow {
  slug: string;
  kind: "native" | "link";
  publishedAt: string;
}

export function validateInventoryPage(payload: unknown, limit: number): ArticleInventoryRow[] {
  if (!Array.isArray(payload) || payload.length > limit) throw new Error("Article inventory: expected a bounded array.");
  return payload.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Article inventory: invalid row.");
    const row = value as Record<string, unknown>;
    if (typeof row.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) || row.slug.length > 256
      || ["view", "manage"].includes(row.slug) || (row.kind !== "native" && row.kind !== "link")
      || typeof row.publishedAt !== "string" || !Number.isFinite(Date.parse(row.publishedAt))
      || ("isPublished" in row && row.isPublished !== true)) {
      throw new Error("Article inventory: invalid slug, kind or publication state.");
    }
    return { slug: row.slug, kind: row.kind as ArticleInventoryRow["kind"], publishedAt: row.publishedAt };
  });
}

export function publicApiBase(value: string | undefined): string {
  if (!value) throw new Error("VITE_API_BASE_URL is required for sitemap generation.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("The sitemap API must be a public HTTPS base URL.");
  return url.href.replace(/\/+$/, "");
}

export async function readArticleInventory(base: string, fetcher: typeof fetch = fetch): Promise<ArticleInventoryRow[]> {
  const api = publicApiBase(base);
  async function pass(): Promise<ArticleInventoryRow[]> {
    const rows: ArticleInventoryRow[] = [];
    const seen = new Set<string>();
    for (let offset = 0; offset <= 50_000; offset += 50) {
      const response = await fetcher(`${api}/articles?limit=50&offset=${offset}`, {
        credentials: "omit", cache: "no-store", redirect: "error",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Article inventory HTTP ${response.status}; deployment stopped.`);
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Article inventory did not return JSON.");
      const page = validateInventoryPage(await response.json(), 50);
      for (const row of page) {
        if (seen.has(row.slug)) throw new Error(`Article inventory repeated slug ${row.slug}; deployment stopped.`);
        const previous = rows[rows.length - 1];
        if (previous && Date.parse(previous.publishedAt) < Date.parse(row.publishedAt)) throw new Error("Article inventory is not in publication order.");
        seen.add(row.slug);
        rows.push(row);
      }
      if (page.length < 50) return rows;
    }
    throw new Error("Article inventory exceeded the single-sitemap limit.");
  }
  let previous = await pass();
  // Compare complete membership/order twice; pagination is not an atomic API snapshot.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await pass();
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  }
  throw new Error("Article inventory kept changing; retry deployment once publication has settled.");
}
