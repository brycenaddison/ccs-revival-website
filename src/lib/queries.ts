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
  adminUser,
  championStats,
  gameCandidates,
  matchCodes,
  matchData,
  matchDetail,
  matchResult,
  phaseCandidates,
  phaseDocument,
  phaseList,
  playerStats,
  records,
  schedule,
  scheduleFeed,
  scout,
  scoutIndex,
  searchUsers,
  season,
  standings,
  statTotals,
  teamDetail,
  teamStats,
  teamsForConf,
  tournaments,
  unscheduledGames,
  type FeedPage,
  type FeedQuery,
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
 * How long the public fixture feed stays fresh.
 *
 * Matched to the endpoint's own `Cache-Control: max-age=15`, because the payload is clock-relative:
 * every `status` on it was derived against `generatedAt`, so holding a copy for a minute like the
 * league data above would leave a series reading `upcoming` a minute after it kicked off.
 */
const FEED_STALE = 15_000;

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

  /**
   * The public season document — phase tabs, group tables and brackets, for one conf.
   *
   * Keyed under `["season", …]` deliberately, so the structure editor's existing
   * `invalidateQueries(queryRoots.season)` already refreshes it: a phase save changes exactly what
   * this serves, and a separate root is one an editor would forget to invalidate.
   *
   * `LEAGUE_STALE` despite the payload being clock-dependent. Two clocks pull opposite ways, and the
   * frequent one wins: group rows and bracket results move whenever a match is recorded, which is
   * the same cadence `standings` has, while `activePhaseId` moves at a handful of instants per
   * *season*. Being a minute late on the latter opens the previous tab, which is a defensible tab to
   * open — and `refetchOnWindowFocus` (on by default) covers the page left open across a boundary
   * without a timer.
   */
  seasonView: (conf: string) =>
    query({
      queryKey: ["season", "view", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => season(conf, { signal }),
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

  /**
   * The public fixture feed — the ticker, `/scores` and `/schedule`, one endpoint with three windows.
   *
   * Keyed under `["schedule", …]` rather than a root of its own, for the reason `seasonView` sits under
   * `["season", …]`: a structure save deletes and renumbers fixtures, and `queryRoots.schedule` is
   * already invalidated by one. A separate root is a root an editor would forget.
   *
   * `FEED_STALE` matches the endpoint's own `max-age=15`, so two surfaces mounted together share one
   * request and a tab switch doesn't refetch. Statuses are clock-derived, so anything that needs to
   * watch a live series adds its own `refetchInterval` — see `useScheduleFeed`.
   */
  feed: (q: FeedQuery) =>
    query({
      queryKey: ["schedule", "feed", q] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => scheduleFeed(q, { signal }),
      staleTime: FEED_STALE,
    }),

  /**
   * The same feed, paged backwards through time — what `/scores` needs and the plain query can't do.
   *
   * There is no `offset` parameter upstream, so the cursor is the window itself: each page asks for
   * everything at or before the oldest kickoff the previous page returned. `to` is **inclusive**, so
   * pages overlap at that instant by design and the caller dedupes on `scheduleMatchId` — see
   * `flattenFeedPages`. Overlapping rather than subtracting a millisecond is what stops a fixture from
   * being skipped, since a whole season day shares one kickoff and there are usually several fixtures
   * at the same instant.
   *
   * Two stopping conditions, and both matter:
   *
   *  - a short page — fewer rows than asked for — is the last one;
   *  - a cursor that doesn't move means the whole page sat at one instant, so another request would
   *    return the same rows forever. It stops instead of looping. Reachable only if a single kickoff
   *    holds more fixtures than `limit`, which is why `/scores` asks for 100.
   *
   * An undated fixture can't be a cursor and is excluded from every page after the first anyway (any
   * bound excludes it), so the cursor is taken from the last row that *has* a kickoff.
   */
  scores: (q: FeedQuery) => ({
    queryKey: ["schedule", "feed", "scores", q] as const,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      scheduleFeed(pageParam === null ? q : { ...q, to: pageParam }, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: FeedPage, _pages: FeedPage[], lastParam: string | null) => {
      if (q.limit === undefined || last.matches.length < q.limit) return null;
      const cursor = [...last.matches].reverse().find(m => m.scheduledAt !== null)?.scheduledAt ?? null;
      return cursor === null || cursor === lastParam ? null : cursor;
    },
    staleTime: FEED_STALE,
  }),

  /**
   * One best-of in full, for `/match/:scheduleMatchId`.
   *
   * Not `Infinity` like `matchData`, which is a finished game's immutable payload: this one carries a
   * clock-derived `status` and a result that grows as games are ingested, so a page left open on a
   * live series should catch up on focus.
   */
  matchResult: (id: number | null) =>
    query({
      queryKey: ["schedule", "result", id] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        id === null ? Promise.resolve(null) : matchResult(id, { signal }),
      enabled: id !== null,
      staleTime: FEED_STALE,
    }),

  /**
   * The admin user directory, one page of it.
   *
   * `staleTime: 0` unlike everything above: this reads roles, and a role list is exactly the thing
   * an admin has just changed in another tab. `keepPreviousData` holds the current page on screen
   * while a new search term or offset loads, so typing doesn't blank the list on every keystroke.
   */
  adminUsers: (q: string, limit: number, offset: number) =>
    query({
      queryKey: ["admin", "users", "search", q, limit, offset] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => searchUsers({ q, limit, offset }, { signal }),
      staleTime: 0,
      placeholderData: keepPreviousData,
    }),

  /**
   * One user's directory row, keyed apart from the list so the detail panel survives a search that
   * no longer contains them. `null` when the profile is gone.
   */
  adminUser: (profileId: number | null) =>
    query({
      queryKey: ["admin", "users", "one", profileId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        profileId === null ? Promise.resolve(null) : adminUser(profileId, { signal }),
      enabled: profileId !== null,
      staleTime: 0,
    }),

  /**
   * The editor surfaces below all use `staleTime: 0`, unlike the league data above.
   *
   * Every one of them backs a whole-document or PATCH save against the value it last read, so serving
   * a cached copy is how two tabs — or one tab left open over lunch — overwrite each other's work.
   * Refetching on mount costs one request and is the difference between editing what is there and
   * editing what was there.
   *
   * The three that back a **draft** also turn off `refetchOnWindowFocus`, which the global default
   * leaves on. Fresh-on-mount is what an editor wants; fresh-while-being-typed-into is not — a document
   * that moves underneath a half-finished edit either discards it or makes an untouched form read as
   * dirty, and tabbing away to Discord and back is enough to do it. Mount is the moment to be current;
   * saving is the moment to find out somebody else got there first.
   */

  /** The phase list, raw, with anchors and unpublished phases. Site admin only. */
  seasonPhases: (conf: string) =>
    query({
      queryKey: ["season", "phases", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => phaseList(conf, { signal }),
      staleTime: 0,
      refetchOnWindowFocus: false,
    }),

  /**
   * One phase's whole save document.
   *
   * Keyed per phase so flipping between two already-open phases is instant, but still `staleTime: 0`
   * — the thing being edited is the one thing that must not be stale.
   */
  phaseDocument: (conf: string, phaseId: number | null) =>
    query({
      queryKey: ["season", "phase", conf, phaseId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        phaseId === null ? Promise.resolve(null) : phaseDocument(conf, phaseId, { signal }),
      enabled: phaseId !== null,
      staleTime: 0,
      refetchOnWindowFocus: false,
    }),

  /** The bracket editor's side panel. Live standings, so never cached long. */
  phaseCandidates: (conf: string, phaseId: number | null) =>
    query({
      queryKey: ["season", "candidates", conf, phaseId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        phaseId === null ? Promise.resolve([]) : phaseCandidates(conf, phaseId, { signal }),
      enabled: phaseId !== null,
      staleTime: 0,
    }),

  /**
   * The schedule, grouped by season day. `day` is part of the key, so the whole-season view and a
   * single day are separate entries rather than one clobbering the other.
   */
  schedule: (conf: string, day?: number) =>
    query({
      queryKey: ["schedule", conf, day ?? "all"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => schedule(conf, day, { signal }),
      staleTime: 0,
    }),

  /** One match, raw, for the editor drawer. */
  matchDetail: (matchId: number | null) =>
    query({
      queryKey: ["schedule", "match", matchId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        matchId === null ? Promise.resolve(null) : matchDetail(matchId, { signal }),
      enabled: matchId !== null,
      staleTime: 0,
      refetchOnWindowFocus: false,
    }),

  /** The codes one match holds. Only fetched once its row is expanded. */
  matchCodes: (matchId: number | null) =>
    query({
      queryKey: ["schedule", "codes", matchId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        matchId === null ? Promise.resolve([]) : matchCodes(matchId, { signal }),
      enabled: matchId !== null,
      staleTime: 0,
    }),

  /** Played games with no scheduled match. Lists forever for legacy seasons; a worklist, not an alarm. */
  unscheduledGames: (conf: string) =>
    query({
      queryKey: ["schedule", "unscheduled", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => unscheduledGames(conf, { signal }),
      staleTime: 0,
    }),

  /** Likely games for one scheduled match, best first. */
  gameCandidates: (matchId: number | null) =>
    query({
      queryKey: ["schedule", "gameCandidates", matchId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        matchId === null
          ? Promise.resolve({ scheduleMatchId: 0, seasonDay: 0, candidates: [] })
          : gameCandidates(matchId, { signal }),
      enabled: matchId !== null,
      staleTime: 0,
    }),
};

/** Key prefixes, for invalidating a whole family on refresh. */
export const queryRoots = {
  teams: ["teams"] as const,
  standings: ["standings"] as const,
  stats: ["stats"] as const,
  /** The league list. Invalidated by the admin league editor, which is the only thing that writes it. */
  tournaments: ["tournaments"] as const,
  /** Both the directory search and every cached single user. */
  adminUsers: ["admin", "users"] as const,
  /**
   * The phase list, every phase document, the candidates panel — and the public season document.
   *
   * One root for all four because a structure save can move any of them: resizing a phase renumbers
   * the season days its neighbours' matches fall on, and a phase save re-runs propagation, which
   * rewrites teams a candidates panel is showing. The public read (`queries.seasonView`) is in the
   * family for the same reason and gets refreshed by the same call — publishing a phase adds a tab
   * to the Standings page, and nothing else would tell it.
   */
  season: ["season"] as const,
  /**
   * The schedule, match details, codes and the linking worklist.
   *
   * Also invalidated by a structure save, because deleting a phase or shrinking it deletes matches —
   * so a schedule view held open beside the structure editor would otherwise list rows that no longer
   * exist.
   */
  schedule: ["schedule"] as const,
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
