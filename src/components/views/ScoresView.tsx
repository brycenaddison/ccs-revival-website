/**
 * Results, newest first, in date sections.
 *
 * Pages backwards through time rather than by offset, because the feed has no `offset` parameter —
 * `queries.scores` owns the cursor and `flattenFeedPages` owns the overlap it causes. Everything here
 * renders what those two hand back, in the order they hand it back.
 */

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { errorMessage } from "../../lib/api";
import { flattenFeedPages, groupByDay } from "../../lib/feedGroups";
import { queries } from "../../lib/queries";
import { useFeedQuery, type FeedWindow } from "../../hooks/useScheduleFeed";
import { FeedMatchRow } from "../schedule/FeedMatchRow";

/**
 * No bounds: `/scores` is a history, so it starts at the most recent result and works back — `desc` is
 * what the endpoint documents for exactly this page. Leaving the clock out also keeps the query key
 * stable, which matters more here than anywhere else: a key that moved would reset the pagination.
 *
 * A hundred a page, which is larger than it looks like it needs to be and deliberately so. The cursor
 * is the oldest kickoff on the page, and a page whose every row shares one kickoff cannot advance it —
 * and a whole season day *is* one kickoff instant, across every active league at once.
 */
const WINDOW: FeedWindow = { statuses: ["completed"], order: "desc", limit: 100 };

export function ScoresView({ isMobile }: { isMobile: boolean }) {
  const q = useFeedQuery(WINDOW);
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    queries.scores(q),
  );

  const days = useMemo(() => groupByDay(flattenFeedPages(data?.pages ?? [])), [data]);

  if (isPending) {
    return <div className="py-10 text-center text-[13px] text-text-subtle">Loading results…</div>;
  }
  if (error) {
    return <div className="py-10 text-center text-[13px] text-ccs-red">{errorMessage(error)}</div>;
  }
  if (days.length === 0) {
    return <div className="py-10 text-center text-[13px] text-text-dim">No results yet this season.</div>;
  }

  return (
    <div className="mx-auto max-w-[800px]">
      <h2 className="mb-4 font-display text-[22px] tracking-widest text-text-bright">SCORES</h2>

      {days.map(day => (
        <section key={day.key} className="mb-6">
          <h3 className="mb-2 font-heading text-[11px] uppercase tracking-widest text-text-muted">
            {day.label}
          </h3>
          <div className="flex flex-col gap-2">
            {day.matches.map(m => (
              <FeedMatchRow key={m.scheduleMatchId} match={m} isMobile={isMobile} />
            ))}
          </div>
        </section>
      ))}

      {hasNextPage && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="cursor-pointer rounded-md border border-border bg-bg2 px-5 py-2.5 font-heading text-xs uppercase tracking-wider text-text-secondary hover:border-border2 hover:text-text-bright disabled:cursor-default disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading…" : "Load earlier results"}
          </button>
        </div>
      )}
    </div>
  );
}
