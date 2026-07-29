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

import {
  championStats,
  matchData,
  playerStats,
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

  /** `role` is part of the key, so toggling the filter back to a role already seen costs nothing. */
  championStats: (conf: string, role: Role | null) =>
    query({
      queryKey: ["stats", "champions", conf, role ?? "all"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => championStats(conf, role, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /**
   * Cumulative league totals. PROPOSED upstream, so this resolves to `null` for now.
   *
   * `retry` is disabled: a missing route is absence rather than a blip, and while the endpoint is
   * unbuilt every conf switch would otherwise re-request a 404 twice more for nothing.
   */
  statTotals: (conf: string) =>
    query({
      queryKey: ["stats", "totals", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => statTotals(conf, { signal }),
      staleTime: LEAGUE_STALE,
      retry: false,
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
