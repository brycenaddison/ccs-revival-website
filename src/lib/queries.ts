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
  adminLeagues,
  adminUser,
  announcements,
  applicationIntake,
  applicationQueue,
  article,
  articles,
  championStats,
  draftEditor,
  draftGameIssues,
  draftIssues,
  draftSettings,
  editorTemplates,
  fixtureDraft,
  gameDraft,
  globalDefinitions,
  leagueAccolades,
  myApplications,
  myInvitations,
  openApplicationSeasons,
  home,
  homeLive,
  leagueInfo,
  manageArticles,
  manageLeagueInfo,
  gameCandidates,
  gameContext,
  matchCodes,
  matchData,
  matchDetail,
  matchTimeline,
  matchResult,
  phaseCandidates,
  phaseDocument,
  phaseList,
  playerStats,
  predictions,
  prediction,
  predictionSummary,
  predictionPositions,
  publicPredictionPicks,
  myPredictions,
  previewPrediction,
  predictionHistory,
  predictionSeasons,
  predictionLeaderboard,
  predictionRolloverPreview,
  publicPredictionSiteSettings,
  managePredictions,
  predictionSiteSettings,
  predictionLeagueRules,
  playerProfile,
  profileAccounts,
  records,
  schedule,
  scheduleFeed,
  searchGuild,
  searchProfiles,
  searchRosterDiscord,
  previewRosterPlayer,
  searchUsers,
  season,
  standings,
  statTotals,
  teamDetail,
  teamDiscordStatus,
  teamDiscordWorkState,
  teamDiscordProvisionJob,
  teamDiscordProvisionJobs,
  resultsWebhookStatus,
  resultsWebhookChannels,
  resultsWebhookOperation,
  teamStats,
  teams,
  teamsForConf,
  tiebreakers,
  manageTiebreakers,
  tournaments,
  unscheduledGames,
  type ArticleQuery,
  type DraftIssueQuery,
  type PredictionFilters,
  CLOSED_PREDICTION_STATES,
  type FeedPage,
  type FeedQuery,
  type ManageQuery,
  GUILD_SEARCH_MIN,
  PROFILE_SEARCH_MIN,
  type Role,
  type ProfileSearchIdentity,
  type RiotAccountInput,
  type TeamDiscordProvisionJob,
  type TeamDiscordStatus,
  ApiError,
} from "./api";

const MINUTE = 60_000;

// Revisioned private results reads require explicit refresh after writes or inspection. Never
// automatically retry Discord requests, retain private data, or imply that a snapshot is live.
const RESULTS_READ_OPTIONS = { staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false } as const;

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
 * How long the home page's content stays fresh — the banner, the article rail and the social feed.
 *
 * Matched to `/home`'s own `Cache-Control: max-age=300`, for the same reason `FEED_STALE` matches
 * the schedule feed's `max-age=15`: the server has already decided how stale this may be, and a
 * client that disagrees either refetches behind a CDN copy it cannot bust or holds one past the
 * point the server thought it would. Articles move a few times a week, so five minutes is invisible.
 */
const HOME_STALE = 5 * MINUTE;

/**
 * The Twitch check, on its own key and its own clock — `/home/live`'s `max-age=30`.
 *
 * This is the entire reason upstream split the two routes: a live badge has to move within the
 * minute, and folding it into `/home` would drag the article rail down to a 30-second TTL and
 * multiply the read traffic tenfold for one badge.
 */
const LIVE_STALE = 30_000;

/**
 * How long a profile's Riot accounts stay fresh — `/profiles/:id/accounts`' own `max-age=60`.
 *
 * Matched to the server for the same reason `FEED_STALE` and `HOME_STALE` are. This one used to be
 * ten minutes, matching the endpoint's *old* header, and upstream shortened it deliberately when
 * self-reported claims arrived: Riot detail is still cached server-side for ten minutes, but a claim
 * a player just added or removed has to appear now. The Riot key is protected by that server cache
 * rather than by this number, so shortening it costs a conditional request, not a Riot call — and
 * `profileAccounts` sends `revalidate` so the request actually reaches the server.
 */
const ACCOUNTS_STALE = MINUTE;

/**
 * Identity helper. Keeps the literal type of `queryKey` without depending on the library's own
 * `queryOptions` helper, so these objects are just data.
 */
const query = <T extends { queryKey: readonly unknown[] }>(o: T): T => o;

const OPEN_PREDICTION_STATES = ["open"] as const;

/**
 * Polling that stops at the first failure. A failed read renders its error once and stays failed
 * until the reader navigates or reloads: no interval, focus or remount refetch re-sends a request
 * the API has already refused.
 */
type QueryStatus = { state: { status: string } };
const holdOnError = (interval: number | false = false) => ({
  refetchInterval: (query: QueryStatus) => (query.state.status === "error" ? false : interval),
  refetchOnWindowFocus: (query: QueryStatus) => query.state.status !== "error",
  retryOnMount: false,
});

/**
 * The public prediction list, keyed by every filter. Callers go through the named families below,
 * which spell filters out in full (a null cursor included), so two callers asking the same question
 * always build the same key.
 */
const predictionList = (filters: PredictionFilters) =>
  query({
    queryKey: ["predictions", "public", "list", filters] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => predictions(filters, { signal }),
    staleTime: 15_000,
    ...holdOnError(30_000),
  });

export const queries = {
  /**
   * Predictions. Everything sits under `queryRoots.predictions`, so a placed prediction, a claim or a
   * staff action invalidates one root. Second segments are load-bearing: `AuthProvider` removes
   * `private`, `manage` and `settings` entries keyed by another viewer when the session changes.
   *
   * Public reads never carry a session. Pools move until kickoff, so lists and details refresh every
   * 30 seconds, until a read fails (`holdOnError`).
   */
  predictionSiteCalendar: () =>
    query({
      queryKey: ["predictions", "calendar"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => publicPredictionSiteSettings({ signal }),
      staleTime: MINUTE,
      ...holdOnError(MINUTE),
    }),
  /**
   * One conf's open events, next deadline first. The hub's Open tab and Home share this key, so
   * whichever loads second reuses the first's request.
   */
  openPredictions: (conf: string, cursor: string | null = null) =>
    predictionList({ conf, status: OPEN_PREDICTION_STATES, sort: "closesAt", cursor }),
  /** One conf's closed events, newest kickoff first. */
  predictionResults: (conf: string, cursor: string | null = null) =>
    predictionList({ conf, status: CLOSED_PREDICTION_STATES, sort: "-closesAt", cursor }),
  /** A fixture's prediction for the match page. Zero or one event in practice. */
  predictionForMatch: (scheduleMatchId: number) =>
    predictionList({ scheduleMatchId, cursor: null }),
  prediction: (eventId: number | null) =>
    query({
      queryKey: ["predictions", "public", "event", eventId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        eventId === null ? Promise.resolve(null) : prediction(eventId, { signal }),
      enabled: eventId !== null,
      staleTime: 15_000,
      ...holdOnError(30_000),
    }),
  /**
   * Every outcome's first page of public picks. Paid picks change while open, so a loaded board
   * polls; anonymous no-store reads also refresh on stake invalidation.
   */
  publicPredictionPicks: (eventId: number, live = false) =>
    query({
      queryKey: ["predictions", "public", "picks", eventId, "first"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => publicPredictionPicks(eventId, null, { signal }),
      staleTime: 15_000,
      ...holdOnError(),
      // Do not poll an endpoint that has not deployed. Focus/navigation can discover its arrival.
      refetchInterval: (query: QueryStatus & { state: { data?: unknown } }): number | false =>
        live && query.state.status === "success" && query.state.data != null ? 15_000 : false,
    }),
  /** A later page of one outcome. It does not poll, so a cursor from an older board stays usable. */
  publicPredictionOutcomePicks: (eventId: number, outcomeId: number, cursor: string) =>
    query({
      queryKey: ["predictions", "public", "picks", eventId, outcomeId, cursor] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => publicPredictionPicks(eventId, { outcomeId, cursor }, { signal }),
      staleTime: 15_000,
      ...holdOnError(),
    }),
  /** Leaderboard seasons only change on rollover, which invalidates the predictions root. */
  predictionSeasons: () =>
    query({
      queryKey: ["predictions", "public", "seasons"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => predictionSeasons({ signal }),
      staleTime: 5 * MINUTE,
    }),
  /** A null season is the open board; a closed season's board is frozen. */
  predictionLeaderboard: (season: number | null, cursor?: string | null) =>
    query({
      queryKey: ["predictions", "leaderboard", season ?? "open", cursor ?? "first"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => predictionLeaderboard(season, cursor, { signal }),
      staleTime: 30_000,
      ...holdOnError(),
    }),
  /**
   * Private reads are keyed by viewer with zero retention, so a previous viewer's balance can never
   * paint under a new session. The summary is the hub header's only read, so the Matches and
   * Leaderboard tabs never load holdings.
   */
  predictionSummary: (viewerId: number | null) =>
    query({
      queryKey: ["predictions", "private", viewerId, "summary"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => predictionSummary({ signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      ...holdOnError(MINUTE),
    }),
  /** Requested per visible page of cards, at most `PREDICTION_POSITIONS_MAX` IDs. */
  predictionPositions: (viewerId: number | null, eventIds: readonly number[]) =>
    query({
      queryKey: ["predictions", "private", viewerId, "positions", eventIds] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => predictionPositions(eventIds, { signal }),
      enabled: viewerId !== null && eventIds.length > 0,
      staleTime: 0,
      gcTime: 0,
    }),
  myPredictions: (viewerId: number | null) =>
    query({
      queryKey: ["predictions", "private", viewerId, "portfolio"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => myPredictions({ signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
    }),
  predictionHistory: (viewerId: number | null, cursor?: string | null) =>
    query({
      queryKey: ["predictions", "private", viewerId, "history", cursor ?? "first"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => predictionHistory(cursor, { signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
    }),
  /**
   * The payout estimate. Upstream it is a POST, but it reserves nothing and has no side effects, so
   * it is a read keyed by its inputs; callers debounce the amount. No retry: a 409 (closed, paused,
   * short of points) is an answer to show, not a blip.
   */
  predictionEstimate: (viewerId: number | null, eventId: number, outcomeId: number | null, amountMinor: string | null) =>
    query({
      queryKey: ["predictions", "private", viewerId, "estimate", eventId, outcomeId, amountMinor] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => previewPrediction(eventId, outcomeId!, amountMinor!, { signal }),
      enabled: viewerId !== null && outcomeId !== null && amountMinor !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    }),
  predictionManage: (conf: string, weekStart: string, viewerId: number | null) =>
    query({
      queryKey: ["predictions", "manage", viewerId, conf, weekStart] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => managePredictions(conf, weekStart, { signal }),
      enabled: viewerId !== null && !!conf && !!weekStart,
      staleTime: 0,
      gcTime: 0,
    }),
  // Predictions and Tournament codes share one versioned /admin/settings document. Always
  // revalidate on entry and discard it on exit so another settings page's saves cannot stay stale.
  predictionSiteSettings: (viewerId: number | null) =>
    query({
      queryKey: ["predictions", "settings", viewerId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => predictionSiteSettings({ signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
    }),
  predictionLeagueRules: (viewerId: number | null) =>
    query({
      queryKey: ["predictions", "settings", viewerId, "leagues"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => predictionLeagueRules({ signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
    }),
  /**
   * The season rollover preview, loaded only after a site admin asks to start a new season, so the
   * caller supplies `enabled`. Its token goes stale with any market or balance change.
   */
  predictionRolloverPreview: (viewerId: number | null, enabled: boolean) =>
    query({
      queryKey: ["predictions", "settings", viewerId, "rollover"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => predictionRolloverPreview({ signal }),
      enabled: viewerId !== null && enabled,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    }),
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

  /** Public discovery across all listed seasons, isolated from credentialed team reads. */
  publicTeams: () =>
    query({
      queryKey: ["teams", "public", "all"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teams({ signal, anonymous: true }),
      staleTime: LEAGUE_STALE,
    }),

  /** Ranked standings, with the rank and streak `/teams` deliberately omits. */
  standings: (conf: string) =>
    query({
      queryKey: ["standings", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => standings(conf, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /**
   * The tiebreaker editor's saved-order preview. With the session, because the league may be
   * unlisted, so it is keyed apart from the public read. Fresh on mount, since the editor's point
   * is to see the order a save just stored.
   */
  manageStandings: (conf: string) =>
    query({
      queryKey: ["standings", "manage", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => standings(conf, { signal, credentialed: true }),
      enabled: conf !== "",
      staleTime: 0,
    }),

  /**
   * The order a conference's standings rank by, for the public "How ties are broken" note and the
   * time columns. Anonymous, so it never shares a cache entry with the editor's session read. It
   * changes on a league admin's save, which invalidates the root, so league staleness is enough.
   * No retry: a failure only omits the note, and the table never waits on it.
   */
  tiebreakers: (conf: string) =>
    query({
      queryKey: ["tiebreakers", "public", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => tiebreakers(conf, { signal }),
      staleTime: LEAGUE_STALE,
      retry: false,
    }),

  /**
   * League Admin's editor read, with the session so an unlisted league opens. Fresh on mount, and
   * no focus refetch, so an unsaved order is never compared against a list read behind it.
   */
  manageTiebreakers: (conf: string) =>
    query({
      queryKey: ["tiebreakers", "manage", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => manageTiebreakers(conf, { signal }),
      enabled: conf !== "",
      staleTime: 0,
      refetchOnWindowFocus: false,
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

  /**
   * One profile's Riot accounts — verified with live rank, plus its self-reported claims.
   *
   * The only public read in here that reaches Riot at request time, which is why it gets its own
   * clock: `ACCOUNTS_STALE` matches the endpoint's `max-age=60`, and the ten-minute server-side
   * cache behind it is what keeps public traffic off the shared Riot key that match ingest depends
   * on. This is also the read the Connections editor writes against, so its mutations invalidate
   * `queryRoots.profiles` and the fetch revalidates rather than trusting the browser's copy.
   */
  profileAccounts: (profileId: number | null) =>
    query({
      queryKey: ["profiles", profileId, "accounts"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        profileId === null ? Promise.resolve(null) : profileAccounts(profileId, { signal }),
      enabled: profileId !== null,
      staleTime: ACCOUNTS_STALE,
    }),

  /** Public cross-season profile document. The endpoint itself permits one minute of staleness. */
  playerProfile: (profileId: number | null, conf: string | null) =>
    query({
      queryKey: ["profiles", profileId, "page", conf ?? "all"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        profileId === null ? Promise.resolve(null) : playerProfile(profileId, conf, { signal }),
      enabled: profileId !== null,
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

  /**
   * One team's page, keyed by `teams.id` under the teams root, so a tag or branding edit refreshes
   * it in place through the same invalidation as the listings.
   */
  teamDetail: (teamId: number) =>
    query({
      queryKey: ["teams", "detail", teamId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teamDetail(teamId, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /** Public team pages and their metadata never reuse a staff-visible team response. */
  publicTeamDetail: (teamId: number) =>
    query({
      queryKey: ["teams", "public-detail", teamId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teamDetail(teamId, { signal, anonymous: true }),
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
   * The same game's Riot timeline, on the same terms: immutable once stored, so never revalidated.
   *
   * `gcTime: Infinity` is a deliberate trade. A forty-minute timeline is one to three megabytes, and a
   * session that opens many games holds every one of them; a match viewer is the one place on the site
   * where a reader flips between tabs of one game, and refetching that payload on each flip is worse.
   * If it ever matters, this is the one entry to give an hour rather than forever.
   */
  matchTimeline: (matchId: string) =>
    query({
      queryKey: ["matchTimeline", matchId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => matchTimeline(matchId, { signal }),
      staleTime: Infinity,
      gcTime: Infinity,
    }),

  /**
   * The league's context for a game: conference, fixture, teams, and puuid → profile.
   *
   * Not immutable like the two payloads beside it. A player who links a Riot account later, or a
   * roster repoint, changes who a line belongs to, so this refreshes on the league cadence. Under its
   * own root rather than `["matchData", …]` because nothing that invalidates a payload (nothing does)
   * should be the thing that refreshes a profile link.
   */
  gameContext: (matchId: string) =>
    query({
      queryKey: ["game", "context", matchId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => gameContext(matchId, { signal }),
      staleTime: LEAGUE_STALE,
    }),

  /**
   * The game's stored draft, or null when it has none. Beside the context under the same root and
   * on the same terms: a correction can replace it, so it is not immutable like the Riot payloads.
   */
  gameDraft: (matchId: string) =>
    query({
      queryKey: ["game", "draft", matchId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => gameDraft(matchId, { signal }),
      staleTime: LEAGUE_STALE,
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
      // `truncated: false` ends paging even on an exactly full page; the row count is the fallback
      // for a server that does not serve the flag.
      if (last.truncated === false) return null;
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
   * Optional tournament codes are viewer-specific, so the caller supplies the current profile ID.
   */
  matchResult: (id: number | null, viewerId: number | null) =>
    query({
      queryKey: ["schedule", "result", id, viewerId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        id === null ? Promise.resolve(null) : matchResult(id, { signal }),
      enabled: id !== null,
      staleTime: FEED_STALE,
      // The optional codes belong to this viewer; discard them when the observer leaves.
      gcTime: 0,
    }),

  /**
   * The home page's own payload — banner, article rail and social feed in one call.
   *
   * Keyed on the conf because the filter **widens**: `?conf=wed` returns that league's rows *plus*
   * the site-wide ones, so two confs are two genuinely different answers rather than one being a
   * subset to filter down from.
   *
   * Every surface that reads a piece of this shares the key: the announcement card, the article
   * rail and the social feed are three components and one request. The announcements editor reads
   * it too — that is how it knows which banner is live — which is free, because by then the home
   * page has usually already fetched it.
   */
  home: (conf?: string) =>
    query({
      queryKey: ["home", conf ?? "all"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => home({ conf, limit: 10 }, { signal }),
      staleTime: HOME_STALE,
    }),

  /** The featured Twitch stream. Its own key so its 30s clock doesn't drag `home` down with it. */
  homeLive: () =>
    query({
      queryKey: ["home", "live"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => homeLive({ signal }),
      staleTime: LIVE_STALE,
    }),

  /**
   * The `/news` index. Paged by `offset`, so each page is its own entry and going back is instant.
   *
   * A plain paged query rather than an infinite one, unlike `scores`: there is a real `offset`
   * here, so a page is addressable directly and doesn't need the window-as-cursor trick that the
   * fixture feed's missing `offset` forced.
   */
  articles: (q: ArticleQuery) =>
    query({
      queryKey: ["articles", "list", q] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => articles(q, { signal }),
      staleTime: HOME_STALE,
    }),

  /** One published article, for `/news/:slug`. `null` for a draft or an unknown slug alike. */
  article: (slug: string | null) =>
    query({
      queryKey: ["articles", "one", slug] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        slug === null ? Promise.resolve(null) : article(slug, { signal }),
      enabled: slug !== null,
      staleTime: HOME_STALE,
    }),

  /**
   * The writers' list, drafts included. `staleTime: 0` and no focus refetch, like the other editor
   * reads below — this backs a form, and a list that moves under a half-finished edit is worse
   * than one refetched on mount.
   */
  manageArticles: (q: ManageQuery) =>
    query({
      queryKey: ["articles", "manage", q] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => manageArticles(q, { signal }),
      staleTime: 0,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    }),

  /** One league's published evergreen page. It changes on the same human timescale as articles. */
  leagueInfo: (conf: string) =>
    query({
      queryKey: ["info", "public", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => leagueInfo(conf, { signal }),
      enabled: conf !== "",
      staleTime: HOME_STALE,
    }),

  /**
   * The draft-aware Info document behind a form. Focus refetch is disabled so a half-written page
   * is never replaced merely because its editor followed one of its own quick links.
   */
  manageLeagueInfo: (conf: string) =>
    query({
      queryKey: ["info", "manage", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => manageLeagueInfo(conf, { signal }),
      enabled: conf !== "",
      staleTime: 0,
      refetchOnWindowFocus: false,
    }),

  /** Every banner, retired included. An editor read, so never cached. */
  announcements: () =>
    query({
      queryKey: ["announcements"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => announcements({ signal }),
      staleTime: 0,
      refetchOnWindowFocus: false,
    }),

  /**
   * The editor's Templates menu and the Site Admin list behind it. Private and viewer keyed; callers
   * pass a null viewer unless the session holds the content or site admin role, so nobody else asks.
   * Read fresh on mount because the Site Admin editor saves under its revision.
   */
  editorTemplates: (viewerId: number | null) =>
    query({
      queryKey: ["editorTemplates", viewerId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => editorTemplates({ signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      refetchOnWindowFocus: false,
      retry: false,
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

  /**
   * A fixture's draft registration and imported games, for schedule staff. Private and no-store
   * upstream, so it is keyed by viewer and dropped once unobserved. Under the schedule root because a
   * structure save can delete the fixture and a match edit can make the room mismatched.
   */
  fixtureDraft: (matchId: number, viewerId: number | null) =>
    query({
      queryKey: ["schedule", "drafts", matchId, viewerId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fixtureDraft(matchId, { signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    }),

  /** Played games with no scheduled match. Lists forever for legacy seasons; a worklist, not an alarm. */
  unscheduledGames: (conf: string) =>
    query({
      queryKey: ["schedule", "unscheduled", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => unscheduledGames(conf, { signal }),
      staleTime: 0,
    }),

  /**
   * Every league, hidden upcoming conferences included — the site-admin league list.
   *
   * Keyed **under** `["tournaments"]` deliberately, so `queryRoots.tournaments` already refreshes it:
   * a league write moves this list and the public season picker together, and a separate root is one
   * the editor would forget. `staleTime: 0` because this backs a form and reads the flags an admin
   * has just changed elsewhere.
   */
  adminLeagues: () =>
    query({
      queryKey: ["tournaments", "admin"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => adminLeagues({ signal }),
      staleTime: 0,
    }),

  /**
   * One conference's whole application queue, oldest submission first.
   *
   * `staleTime: 0`: this is a shared worklist, and the row a reviewer is about to approve is exactly
   * the one another reviewer may have just decided. Focus refetch stays **on**, unlike the draft
   * editors below — nothing here is a long-lived form, and coming back to the tab should show the
   * current queue.
   */
  applicationQueue: (conf: string) =>
    query({
      queryKey: ["applications", "queue", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => applicationQueue(conf, { signal }),
      enabled: conf !== "",
      staleTime: 0,
    }),

  /**
   * Where one conference's season stands — intake open, listed, teams published — as roster staff
   * may read it. Beside the queue it describes, and `staleTime: 0` for the same reason: the two
   * writes that move it (the site admin's intake toggle and listing command) happen on another page,
   * and this panel's whole job is to say what they did. Under the `applications` root so the publish
   * command, which stamps `teamsPublishedAt`, refreshes it without a second invalidation.
   */
  applicationIntake: (conf: string) =>
    query({
      queryKey: ["applications", "intake", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => applicationIntake(conf, { signal }),
      enabled: conf !== "",
      staleTime: 0,
    }),

  /**
   * The caller's own applications in one conference.
   *
   * `LEAGUE_STALE` rather than the `0` of the editors beside it, because the account menu reads this
   * too: `useHasLiveApplication` runs it for every open season on every page to decide whether to
   * offer "My applications", and a zero would refetch it on every focus site-wide. Every write on
   * the applicant page and the inbox invalidates `queryRoots.applications`, so what the applicant
   * just did shows at once, and a staff decision made elsewhere is a minute away at most.
   */
  myApplications: (conf: string) =>
    query({
      queryKey: ["applications", "mine", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => myApplications(conf, { signal }),
      enabled: conf !== "",
      staleTime: LEAGUE_STALE,
    }),

  /**
   * Hidden conferences accepting applications. Not the season selector — see `teamApplications.ts`.
   *
   * `LEAGUE_STALE` rather than the `0` its neighbours use, because this one is read from the **nav**:
   * `AuthControl` shows the Apply Now button off it on every page, for every signed-in visitor. The
   * value moves a handful of times per season and the two writes that move it — the site admin's
   * intake toggle and listing command, both in `admin/LeaguesSection.tsx` — invalidate
   * `queryRoots.applications`, so correctness comes from invalidation rather than from a short clock. Requires a session; the route is `401` for anonymous callers,
   * which is why every caller gates on `isAuthenticated`.
   */
  openApplicationSeasons: () =>
    query({
      queryKey: ["applications", "open"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => openApplicationSeasons({ signal }),
      staleTime: LEAGUE_STALE,
    }),

  /**
   * The caller's invitation inbox.
   *
   * Its own root rather than a child of `applications`: an invitee is not an applicant, and the two
   * are invalidated by different writes — responding to an invitation changes this list without
   * changing any queue the responder can read.
   */
  myInvitations: (profileId: number | null) =>
    query({
      // Keep private inboxes separate if a different member signs in without a page reload.
      queryKey: ["invitations", profileId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => myInvitations({ signal }),
      staleTime: 0,
    }),

  /**
   * Profile autocomplete, for picking accolade recipients by name.
   *
   * `q` and `conf` are both in the key, so backspacing to a term already typed is free and toggling
   * the conference filter doesn't discard the unfiltered results. Disabled below upstream's
   * two-character floor rather than sent — a shorter query is a `400` there, not an empty list.
   *
   * A real staleTime despite backing a form: this is a *lookup*, not a document being edited, and a
   * profile's display name does not move while somebody is choosing from a list of them.
   */
  profileSearch: (q: string, conf: string | null = null, identity?: ProfileSearchIdentity) =>
    query({
      queryKey: ["profiles", "search", q, conf ?? "all", identity ?? "all"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => searchProfiles(q, conf, undefined, { signal }, identity),
      enabled: q.length >= PROFILE_SEARCH_MIN,
      staleTime: MINUTE,
      placeholderData: keepPreviousData,
    }),

  /** Global discovery never reuses editor lookups or shows a previous term's results. */
  publicPlayerSearch: (q: string, identity?: ProfileSearchIdentity) =>
    query({
      queryKey: ["profiles", "public-search", q, identity ?? "all"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        searchProfiles(q, null, undefined, { signal, anonymous: true }, identity),
      enabled: q.length >= PROFILE_SEARCH_MIN,
      staleTime: MINUTE,
    }),

  /** No previous private data across term, conference, or session changes. */
  rosterDiscordSearch: (conf: string, viewerId: number | null, q: string) =>
    query({
      queryKey: ["rosterPlayers", conf, viewerId, "discord", q] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => searchRosterDiscord(conf, q, { signal }),
      enabled: conf !== "" && viewerId !== null && q.length >= PROFILE_SEARCH_MIN,
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
    }),

  /**
   * A conference's team Discord setup for League Admin. Private and no-store upstream, so it is keyed
   * by viewer and dropped once unobserved. Under the teams root so roster writes refresh membership
   * work. Refreshes every 15 seconds while unattempted work remains; held failures count toward queue
   * depth but need a new event or manual request, so they must not keep polling alive.
   */
  teamDiscord: (conf: string, viewerId: number | null) =>
    query({
      queryKey: ["teams", "discord", conf, viewerId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teamDiscordStatus(conf, { signal }),
      enabled: conf !== "" && viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchInterval: (q: { state: { status: string; data?: TeamDiscordStatus } }) =>
        q.state.status !== "error" && q.state.data?.teams.some(team => teamDiscordWorkState(team.queued) === "pending") ? 15_000 : false,
    }),

  /**
   * Recent Provision jobs, newest first, under the status key so a status refresh (after teardown,
   * say) refreshes them too. Not polled: the followed job's read is.
   */
  teamDiscordProvisionJobs: (conf: string, viewerId: number | null) =>
    query({
      queryKey: ["teams", "discord", conf, viewerId, "provisionJobs"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teamDiscordProvisionJobs(conf, { signal }),
      enabled: conf !== "" && viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    }),

  /**
   * One Provision job, polled until it finishes: every 2 seconds while a team runs, every 5 while
   * teams only wait. Polling pauses while the tab is hidden and refetches on return. A lost poll
   * keeps polling; a 4xx (another conference's job, lost access) stops it.
   */
  teamDiscordProvisionJob: (conf: string, viewerId: number | null, jobId: number) =>
    query({
      queryKey: ["teams", "discord", conf, viewerId, "provisionJob", jobId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => teamDiscordProvisionJob(conf, jobId, { signal }),
      enabled: conf !== "" && viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: (q: { state: { data?: TeamDiscordProvisionJob } }) => q.state.data?.state !== "finished",
      refetchInterval: (q: { state: { error: unknown; data?: TeamDiscordProvisionJob } }) => {
        const { error, data } = q.state;
        if (error instanceof ApiError && error.status < 500) return false;
        if (data && data.state !== "queued" && data.state !== "running") return false;
        return data && data.counts.running > 0 ? 2_000 : 5_000;
      },
    }),

  /** Results settings are independent of team provisioning; only admin-scoped callers mount them. */
  resultsWebhook: (conf: string, viewerId: number | null) =>
    query({
      queryKey: ["resultsWebhooks", conf, viewerId, "status"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => resultsWebhookStatus(conf, { signal }),
      enabled: conf !== "" && viewerId !== null,
      ...RESULTS_READ_OPTIONS,
    }),
  resultsWebhookChannels: (conf: string, viewerId: number | null) =>
    query({
      queryKey: ["resultsWebhooks", conf, viewerId, "channels"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => resultsWebhookChannels(conf, { signal }),
      enabled: conf !== "" && viewerId !== null,
      ...RESULTS_READ_OPTIONS,
    }),
  resultsWebhookOperation: (conf: string, viewerId: number | null, operationId: string | null) =>
    query({
      queryKey: ["resultsWebhooks", conf, viewerId, "operation", operationId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => operationId === null
        ? Promise.resolve(null) : resultsWebhookOperation(conf, operationId, { signal }),
      enabled: conf !== "" && viewerId !== null && operationId !== null,
      ...RESULTS_READ_OPTIONS,
    }),

  /** The global draft settings document, site admin only. Read fresh because it backs a revisioned form. */
  draftSettings: (viewerId: number | null) =>
    query({
      queryKey: ["drafts", "settings", viewerId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => draftSettings({ signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    }),

  /**
   * One page each of unresolved receipts and creations. The two lists page independently, so both
   * cursors are in the key. Site admin only.
   */
  draftIssues: (viewerId: number | null, q: DraftIssueQuery) =>
    query({
      queryKey: ["drafts", "issues", viewerId, q.cursor, q.creationCursor] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => draftIssues(q, { signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    }),

  /** One page of played games whose draft is wrong or missing, computed on read. Site admin only. */
  draftGameIssues: (viewerId: number | null, cursor: string | null) =>
    query({
      queryKey: ["drafts", "gameIssues", viewerId, cursor] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => draftGameIssues(cursor, { signal }),
      enabled: viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
    }),

  /**
   * One game's stored draft beside the played game, for correction. Never refetched in the
   * background: the form is keyed by the read's revision, and a silent refresh would reset an edit
   * in progress. A 409 on save invalidates it on purpose.
   */
  draftEditor: (viewerId: number | null, drafterSeriesId: string, game: number) =>
    query({
      queryKey: ["drafts", "editor", viewerId, drafterSeriesId, game] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => draftEditor(drafterSeriesId, game, { signal }),
      enabled: viewerId !== null,
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
    }),

  /** Explicitly requested POST preview; no automatic provider retries or background refreshes. */
  rosterRiotPreview: (conf: string, viewerId: number | null, input: RiotAccountInput) =>
    query({
      queryKey: ["rosterPlayers", conf, viewerId, "riotPreview", input.gameName, input.tagLine] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => previewRosterPlayer(conf, input, { signal }),
      enabled: conf !== "" && viewerId !== null,
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),

  /**
   * The site admin's Discord guild search, for naming a person before any application exists to
   * search under (the applicant's search is scoped to an application and gated on its creator).
   *
   * Under the `admin` prefix rather than `applications`: it is a lookup against Discord, and no
   * application write changes what it answers. A real staleTime for the same reason `profileSearch`
   * has one, and disabled below upstream's two-character floor rather than sent, since a shorter
   * query is a `400` there.
   */
  adminGuildSearch: (q: string) =>
    query({
      queryKey: ["admin", "guild", "search", q] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => searchGuild(q, { signal }),
      enabled: q.length >= GUILD_SEARCH_MIN,
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    }),

  /** One conference's issuable definitions and issued accolades — one request for the whole editor. */
  leagueAccolades: (conf: string) =>
    query({
      queryKey: ["accolades", "league", conf] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => leagueAccolades(conf, { signal }),
      enabled: conf !== "",
      staleTime: 0,
      refetchOnWindowFocus: false,
    }),

  /** Every global definition, inactive included. Site admin, and it backs a form. */
  globalAccoladeDefinitions: () =>
    query({
      queryKey: ["accolades", "global"] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => globalDefinitions({ signal }),
      staleTime: 0,
      refetchOnWindowFocus: false,
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
  resultsWebhooks: ["resultsWebhooks"] as const,
  predictions: ["predictions"] as const,
  rosterPlayers: ["rosterPlayers"] as const,
  teams: ["teams"] as const,
  /**
   * The home payload and the Twitch check.
   *
   * **Both content editors must invalidate this alongside their own root.** `/home` carries its own
   * copy of the article rail and the active banner, so publishing an article while invalidating
   * only `["articles"]` leaves the home page serving the old rail for five minutes — the surface
   * the writer was actually editing for. Same shape of trap as `queryRoots.season` covering the
   * public season read.
   */
  home: ["home"] as const,
  /** The public index, one article, and the writers' list. */
  articles: ["articles"] as const,
  /** The public Info pages and their draft-aware League Admin editors. */
  info: ["info"] as const,
  /** The banner list behind the site-admin editor. The public copy lives under `home`. */
  announcements: ["announcements"] as const,
  /** The editor templates list, read by every Markdown editor's menu and the Site Admin editor. */
  editorTemplates: ["editorTemplates"] as const,
  standings: ["standings"] as const,
  /**
   * Both tiebreaker reads. A save also invalidates `standings` and `season`, since every ranked
   * table orders by the saved list.
   */
  tiebreakers: ["tiebreakers"] as const,
  stats: ["stats"] as const,
  /**
   * Every public profile document and linked-accounts read.
   *
   * Presentation edits, Riot linking and targeted refresh all invalidate this root so the public
   * page, Settings and every cached account card converge on the same identity.
   */
  profiles: ["profiles"] as const,
  /**
   * The league list — the public listed-only one **and** the site admin's unfiltered copy.
   *
   * One root for both, because a write moves both: creating a league adds a row the admin editor
   * needs immediately, and listing a season is what puts it in the public season picker. Anything
   * that can change `listed`, `applicationsOpen`, `active` or `teamsPublishedAt` must invalidate
   * this — the intake toggle, the listing command and team publication all do.
   */
  tournaments: ["tournaments"] as const,
  /**
   * Every application read: the staff queue, the season-state read beside it, the applicant's own
   * list, and the open-season list.
   *
   * The site admin's intake toggle and listing command live on `/admin/leagues` but invalidate this
   * root too, because the open-season list (the nav's Apply Now button) and the roster staff's
   * season-state panel both read what those writes changed. Team publication additionally
   * invalidates `tournaments`, `teams` and `standings`: it inserts team rows and stamps
   * `teamsPublishedAt`, and a league admin can already see an unlisted conference's teams.
   */
  applications: ["applications"] as const,
  /** The invitation inbox. Separate from `applications` — an invitee is not an applicant. */
  invitations: ["invitations"] as const,
  /**
   * Accolade definitions and issued accolades, league and global alike.
   *
   * **Every accolade write must invalidate `profiles` as well.** The public profile page is where an
   * accolade is actually seen, `GET /profiles/:id` carries its own career-wide copy of the list, and
   * nothing else on the site would tell it that one was just issued or revoked.
   */
  accolades: ["accolades"] as const,
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
  /**
   * Draft settings, the repair inbox, game issues and the correction editor. Fixture rooms sit
   * under `schedule`; a room write refreshes both, since a failed or uncertain creation lands in the
   * inbox.
   */
  drafts: ["drafts"] as const,
  /** The match viewer's context and draft reads. A draft correction refreshes this root. */
  game: ["game"] as const,
};

/**
 * A cheap identity for a set of query results, for memoizing a derivation over them.
 *
 * `useQueries` returns a new array every render and a dependency list can't vary in length — but
 * each `data` is referentially stable while its query is unchanged, so status plus last-updated is
 * enough to know whether anything actually moved.
 */
export function resultsKey(results: readonly { status: string; dataUpdatedAt: number }[]): string {
  return results.map(r => `${r.status}:${r.dataUpdatedAt}`).join("|");
}
