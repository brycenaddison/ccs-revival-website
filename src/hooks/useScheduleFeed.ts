/**
 * The public fixture feed, windowed for whoever is asking.
 *
 * Four surfaces read `GET /schedule` — the ticker, Home's Upcoming widget, `/scores` and `/schedule` —
 * and they differ only in the window. This owns the two things all four have to agree on, so that
 * neither is decided four times:
 *
 * **Which leagues.** The season selection lives in `?conf=` (`lib/leagueContext.tsx`). When it names a
 * specific season, that conference is sent. When it is `CURRENT`, it depends on *how* the current
 * season was decided (`activeSource`): if `tournaments.active` flagged it, nothing is sent and the
 * endpoint's own default — every league with that flag — decides, so a flag flipped mid-session is
 * picked up on the next poll rather than pinned to what this client saw at load. But that flag is the
 * only rule the server knows. When the client resolved the current season from the `VITE_ACTIVE_CONFS`
 * pin or fell back to the newest season because nothing is flagged, the server's default would answer
 * a different set — usually an empty one — and the confs have to be named. Leaving them off is how the
 * picker, Home, Standings and Stats all showed the newest season while the ticker, Scores and Schedule
 * sat empty.
 *
 * **Which clock.** A window is expressed as an offset from now, and `Date.now()` in a render body would
 * mint a new query key every render and refetch forever. So now is rounded down to a five-minute
 * bucket. The bounds drift by up to that much, which costs nothing: statuses are computed server-side
 * against the server's own clock, and the bounds only decide which fixtures are in the page.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeedQuery, MatchStatus } from "../lib/api";
import { CURRENT, useLeague } from "../lib/leagueContext";
import { queries } from "../lib/queries";

const BUCKET_MS = 5 * 60_000;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export interface FeedWindow {
  /**
   * Lower bound as an offset from now, in milliseconds; negative reaches into the past. Omit for
   * unbounded — which is the only way to see an **undated** fixture, since either bound excludes one.
   */
  from?: number;
  /** Upper bound as an offset from now. */
  to?: number;
  statuses?: readonly MatchStatus[];
  limit?: number;
  order?: "asc" | "desc";
}

/**
 * A window resolved against the bucketed clock and the current season selection.
 *
 * Exported on its own because `/scores` pages through the feed with `useInfiniteQuery` and so cannot
 * go through the hook below, but must resolve its window the same way.
 */
export function useFeedQuery(w: FeedWindow): FeedQuery {
  const { selection, activeConfs, activeSource } = useLeague();

  // Read outside the memo: the value only changes every five minutes, so it is a stable dependency
  // even though the expression isn't. Nothing re-renders on the rollover — the next render for any
  // other reason picks the new window up, which for a polling ticker is every thirty seconds.
  const bucket = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;

  return useMemo(() => {
    const at = (offset: number | undefined) =>
      offset === undefined ? undefined : new Date(bucket + offset).toISOString();

    // Branching on the sentinel, not on `isCurrent`: that flag is also true for a conference named
    // directly that happens to be running, and naming one *is* a narrower selection than "whatever
    // is on now" — the picker offers both and they should not collapse here.
    //
    // Under `CURRENT`, the server's default is trusted only when it would agree — see the header.
    // With no tournaments at all there is nothing to name and the empty default is the right answer.
    const confs =
      selection !== CURRENT
        ? [selection]
        : activeSource === "flagged" || activeConfs.length === 0
          ? undefined
          : activeConfs;

    return {
      ...(w.from === undefined ? {} : { from: at(w.from) }),
      ...(w.to === undefined ? {} : { to: at(w.to) }),
      ...(confs === undefined ? {} : { confs }),
      ...(w.statuses === undefined ? {} : { statuses: w.statuses }),
      ...(w.limit === undefined ? {} : { limit: w.limit }),
      ...(w.order === undefined ? {} : { order: w.order }),
    };
  }, [bucket, selection, activeConfs, activeSource, w.from, w.to, w.statuses, w.limit, w.order]);
}

/**
 * The feed for one window.
 *
 * `poll` is for a surface that has to notice a series starting without a reload — the ticker. It is
 * applied unconditionally rather than only while something is live: "nothing is live" is exactly the
 * answer that goes stale, since a fixture becomes `live` on the server's clock and no client can see
 * that coming.
 */
export function useScheduleFeed(w: FeedWindow, poll?: number) {
  const q = useFeedQuery(w);
  return useQuery({
    ...queries.feed(q),
    ...(poll === undefined ? {} : { refetchInterval: poll }),
  });
}
