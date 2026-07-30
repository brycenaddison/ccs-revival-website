/**
 * Query keys and options for the CCS API.
 *
 * Every key lives here rather than at the call site, because deduplication only happens when two
 * callers agree on one — and the case that matters is `/teams/:conf`: the league loader fetches it
 * for the whole selection, and every team page fetches it again for that team's roster and record.
 * Same key, one request.
 *
 * The functions in `./api/client` already return promises and already take an `AbortSignal`, so
 * they are query functions as-is. Nothing about the transport changes here.
 */

import { keepPreviousData } from "@tanstack/react-query";
import {
  championStats,
  matchData,
  playerStats,
  records,
  scout,
  scoutIndex,
  standings,
  statTotals,
  teamDetail,
  teamStats,
  teamsForConf,
  tournaments,
  type Role,
} from "./api";

const MINUTE = 60_000;

/**
 * How long league data stays fresh.
 *
 * Results only move when a match is recorded, and the materialized views behind the stats
 * endpoints are refreshed on a schedule of their own — so a minute of staleness is invisible while
 * still keeping tab-switching and back-navigation instant.
 */
const LEAGUE_STALE = MINUTE;

/**
 * Identity helper. Keeps the literal type of `queryKey` without depending on the library's own
 * `queryOptions` helper, so these objects are just data.
 */
const query = <T extends { queryKey: readonly unknown[] }>(o: T): T => o;

export const queries = {
  /** Season metadata. Changes when a split is created, so effectively static within a visit. */
  tournaments: () =>
    query({
      queryKey: ["tournaments"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => tournaments({ signal }),
      staleTime: 30 * MINUTE,
    }),

  /** Teams, rosters and records for one conf — the single call the Teams view needs. */
  teamsForConf: (conf: string) =>
    query({
      queryKey: ["teams", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teamsForConf(conf, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /** Ranked standings, with the rank and streak `/teams` deliberately omits. */
  standings: (conf: string) =>
    query({
      queryKey: ["standings", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => standings(conf, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  playerStats: (conf: string) =>
    query({
      queryKey: ["stats", "players", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => playerStats(conf, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  teamStats: (conf: string) =>
    query({
      queryKey: ["stats", "teams", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teamStats(conf, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /**
   * `role` is part of the key, so toggling the filter back to a role already seen costs nothing.
   *
   * A role not yet seen is a cache miss, though, and without `keepPreviousData` that meant `isPending`
   * and a panel that blanked to a loading line on every first visit to a role. Holding the previous
   * role's rows keeps the page on screen; `isPlaceholderData` is there if we ever want to dim them.
   */
  championStats: (conf: string, role: Role | null) =>
    query({
      queryKey: ["stats", "champions", conf, role ?? "all"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => championStats(conf, role, { signal }),
      staleTime: LEAGUE_STALE,
      placeholderData: keepPreviousData,
    }),

  /** Cumulative league totals. Retries normally now that the route is real and a failure is a blip. */
  statTotals: (conf: string) =>
    query({
      queryKey: ["stats", "totals", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => statTotals(conf, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /**
   * Single-game record boards. `limit` is part of the key, so flipping back to a row count already seen
   * is free — the same reason `role` is in the champion key.
   */
  records: (conf: string, limit: number) =>
    query({
      queryKey: ["stats", "records", conf, limit] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => records(conf, { limit }, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /** The player picker's source. One request per conf, shared by every report viewed within it. */
  scoutIndex: (conf: string) =>
    query({
      queryKey: ["stats", "scout", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => scoutIndex(conf, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /** One player's report. Keyed per player, so flipping between two already-seen players is instant. */
  scout: (conf: string, profileId: number) =>
    query({
      queryKey: ["stats", "scout", conf, profileId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => scout(conf, profileId, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /** One team's page. Fans out to `/teams/:c/:t` plus the conf listing, which is shared. */
  teamDetail: (conf: string, code: string) =>
    query({
      queryKey: ["teamDetail", conf, code] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teamDetail(conf, code, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /**
   * A finished game's Riot payload. Never revalidated: the match is over, and the stored jsonb
   * will not change.
   */
  matchData: (matchId: string) =>
    query({
      queryKey: ["matchData", matchId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => matchData(matchId, { signal }),
      staleTime: Infinity,
      gcTime: Infinity,
    }),
};

/** Key prefixes, for invalidating a whole family on refresh. */
export const queryRoots = {
  teams: ["teams"] as const,
  standings: ["standings"] as const,
  stats: ["stats"] as const,
};

/**
 * A cheap identity for a set of query results, for memoising a derivation over them.
 *
 * `useQueries` returns a new array every render and a dependency list can't vary in length — but
 * each `data` is referentially stable while its query is unchanged, so status plus last-updated is
 * enough to know whether anything actually moved.
 */
export function resultsKey(results: readonly { status: string; dataUpdatedAt: number }[]): string {
  return results.map(r => `${r.status}:${r.dataUpdatedAt}`).join("|");
}
