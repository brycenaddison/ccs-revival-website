/**
 * `/news` — every published article, newest first.
 *
 * Paged by `offset` rather than the window-as-cursor trick `/scores` uses: the articles endpoint
 * has a real `offset`, so a page is addressable directly and there is no overlap to dedupe.
 *
 * Scoped to the selected conf, which **widens** rather than narrows — `?conf=wed` returns that
 * league's posts plus every site-wide one. That is the right default for a news index: most posts
 * belong to no single league, and a reader who has picked a season still wants them.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "../components/layout/PageShell";
import { ArticleCardTile } from "../components/news/ArticleCardTile";
import { useWindowSize } from "../hooks/useWindowSize";
import { useLeague } from "../lib/leagueContext";
import { queries } from "../lib/queries";
import { errorMessage, MAX_LIMIT } from "../lib/api";

/** Under `MAX_LIMIT` (50), so the server never clamps and a short page reliably means the last one. */
const PAGE_SIZE = 24;

export default function News() {
  const isMobile = useWindowSize() < 768;
  const { selectedConfs } = useLeague();
  const conf = selectedConfs[0];

  // Rows accumulate across pages, so "Load more" appends rather than replacing. Reset whenever the
  // conf changes — the previous league's posts are not the tail of this one's list.
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [conf]);

  const { data, isPending, error, isPlaceholderData } = useQuery(
    queries.articles({ conf, limit }),
  );

  const articles = data ?? [];
  // A short page is the last one. `limit` is the total asked for, not a page size, so this compares
  // against what was requested rather than tracking a cursor.
  const hasMore = articles.length >= limit;

  return (
    <PageShell maxWidth={1100}>
      <div className="mb-6">
        <h1 className="font-display text-[22px] text-text-bright ">News</h1>
        <p className="text-text-secondary text-sm">
          Recaps, roster moves and announcements from across the league.
        </p>
      </div>

      {error ? (
        <div className="py-16 text-center">
          <p className="text-text-secondary text-sm">{errorMessage(error)}</p>
        </div>
      ) : isPending ? (
        <div className="py-16 text-center text-text-subtle">Loading...</div>
      ) : articles.length === 0 ? (
        <div className="py-16 text-center text-text-dim text-[13px]">
          Nothing published yet.
        </div>
      ) : (
        <>
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: `repeat(${isMobile ? 1 : 3}, minmax(0, 1fr))` }}
          >
            {articles.map(a => (
              <ArticleCardTile key={a.slug} article={a} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-8">
              <button
                onClick={() => setLimit(l => l + PAGE_SIZE)}
                disabled={isPlaceholderData}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 bg-transparent font-heading text-sm cursor-pointer text-text-bright hover:border-brand disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPlaceholderData ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
