/**
 * The strip across the top of the site: what just finished, what is on now, what is next.
 *
 * Takes no props and owns its own query. Several pages used to mount their own copy, and threading a
 * window and a `matches` array through each of them is how they came to disagree the first time round
 * — the previous version rendered `LeagueData.matches`, which nothing has ever filled.
 *
 * There is now exactly one instance: `SiteLayout` mounts it for the whole group of routes that show
 * it, so it is not remounted when a reader moves between them. That matters more than it sounds —
 * `nowIndex` below scrolls the strip to the live series imperatively, and a remount threw that away
 * and reopened the fortnight at its left edge on every navigation.
 *
 * The window is exported because Home needs the *same* query: a live series means the standings are
 * moving too, and Home refreshes the league on a timer while one is on. Reading it through the same
 * key shares this request rather than making a second one.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { TeamBadge } from "../TeamBadge";
import { toBadge } from "../../lib/leagueAdapters";
import { fmtRelativeDay, fmtTime } from "../../lib/utils";
import { DAY_MS, useScheduleFeed, type FeedWindow } from "../../hooks/useScheduleFeed";
import { useWindowSize } from "../../hooks/useWindowSize";
import type { FeedMatch, FeedTeam } from "../../lib/api";

/**
 * Two weeks back, a week forward — so the strip carries the last couple of game nights' results
 * rather than only what happened in the last 48 hours, which on a weekly cadence is usually nothing.
 *
 * Two weeks is the closest thing to "the last two season days" that can actually be asked for:
 * `GET /schedule` filters on `from`/`to`/`conf`/`status`/`limit`/`order` and **nothing else** — there
 * is no season-day parameter, and inventing one client-side would mean asking for a wider window and
 * throwing most of it away. See `lib/api/feed.ts`; an unknown parameter is a `400` upstream, not a
 * no-op.
 *
 * `pending` is left out on purpose: an undated bracket slot and a fixture nobody turned up for are
 * both things a ticker would be lying about.
 *
 * **Served `desc`, rendered `asc`.** Kickoff order is what the strip draws — finals to the left of
 * live, upcoming to the right — but `limit` truncates whichever end the *server* order puts last, and
 * over a three-week window that ceiling is now reachable. Asked ascending, a busy fortnight of results
 * would push the live series off the end, which is the one row the ticker exists for. Descending
 * spends the ceiling on the future first and drops the oldest finals instead, and the reversal back to
 * kickoff order is one line below. 80 against a 200 ceiling: room for a fortnight across every active
 * league, without paging a whole month into a strip.
 */
export const TICKER_WINDOW: FeedWindow = {
  from: -14 * DAY_MS,
  to: 7 * DAY_MS,
  statuses: ["completed", "live", "upcoming"],
  order: "desc",
  limit: 80,
};

/** Thirty seconds, which is the cadence the endpoint was built for (`max-age=15`). */
const POLL_MS = 30_000;

/**
 * How much of the preceding card is left showing when the strip scrolls itself to now.
 *
 * Landing exactly on the boundary reads as the start of the list, and two weeks of results to the
 * left would then be invisible — a strip that scrolls in only one direction looks like it has nothing
 * in the other.
 */
const PEEK_PX = 56;

export function ScoreboardTicker() {
  const isMobile = useWindowSize() < 768;
  const { data } = useScheduleFeed(TICKER_WINDOW, POLL_MS);

  // Back into kickoff order — see `TICKER_WINDOW`. Memoized on the page rather than the array so the
  // thirty-second poll doesn't hand the scroll effect below a new list every tick.
  const matches = useMemo(() => (data?.matches ?? []).slice().reverse(), [data]);

  const scroller = useRef<HTMLDivElement | null>(null);

  // Where "now" is: the first fixture that hasn't finished. -1 when everything in the window is done,
  // which is the off-season and the one case where the far right *is* the news.
  const nowIndex = matches.findIndex(m => m.status !== "completed");

  // Two weeks of finals sit to the left of that, and a strip that opens on a fortnight-old scoreline
  // is worse than the two-day window it replaced. So open on now instead.
  //
  // Keyed on the index, not the data: the poll leaves it alone, and it moves only when a fixture flips
  // status — at which point re-anchoring is the point. It will overrule a reader who has scrolled away
  // at that moment, which happens a couple of times an evening and lands them on the series that just
  // went live.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el === null || nowIndex <= 0) return;

    const card = el.children[nowIndex];
    if (!(card instanceof HTMLElement)) return;

    // Measured, not `offsetLeft`: that resolves against the nearest positioned ancestor, which is not
    // this container, and the difference is silently wrong rather than obviously so.
    el.scrollLeft += card.getBoundingClientRect().left - el.getBoundingClientRect().left - PEEK_PX;
  }, [nowIndex]);

  // No strip at all rather than an empty bar: this sits above the nav, and a permanent empty band
  // reads as the layout being broken. Loading and "nothing this fortnight" are the same thing here.
  if (matches.length === 0) return null;

  return (
    <div className="border-b border-border3 bg-bg overflow-hidden">
      <div
        ref={scroller}
        className="flex overflow-x-auto px-2"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {matches.map((m, i) => (
          <TickerCard
            key={m.scheduleMatchId}
            match={m}
            isMobile={isMobile}
            divider={i < matches.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The line above the two teams: when this is, or was.
 *
 * The whole kickoff instant is already on every row of `GET /schedule` — resolved through the phase
 * default — so the date costs nothing here and is worth having: the strip spans two weeks back and a
 * week forward, and `7:00 PM` alone doesn't say which of three weeks of evenings it is.
 *
 * A finished fixture leads with `FINAL`, because that is the news, and carries its day only when the
 * day isn't today — a strip of `FINAL · Today` down the whole left side says nothing five times.
 */
function caption(match: FeedMatch): string {
  if (match.scheduledAt === null) return match.status === "completed" ? "FINAL" : "TBC";

  if (match.status === "completed") {
    const day = fmtRelativeDay(match.scheduledAt);
    return day === "Today" ? "FINAL" : `FINAL · ${day}`;
  }

  return fmtTime(match.scheduledAt);
}

function TickerCard({
  match,
  isMobile,
  divider,
}: {
  match: FeedMatch;
  isMobile: boolean;
  divider: boolean;
}) {
  const live = match.status === "live";
  const final = match.status === "completed";
  const result = match.result;

  const content = (
    <>
      {live ? (
        <div className="mb-1.5 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full bg-ccs-red shadow-[0_0_10px_var(--red),0_0_20px_var(--red)]"
            style={{ animation: "pulse 1.5s infinite" }}
          />
          <span
            className="font-display text-[11px] font-bold tracking-widest text-ccs-red"
            style={{ textShadow: "0 0 8px var(--red)" }}
          >
            LIVE
          </span>
        </div>
      ) : (
        <span className="mb-1 whitespace-nowrap font-display text-[10px] font-semibold tracking-wide text-text-muted">
          {caption(match)}
        </span>
      )}

      <TickerSide
        team={match.teamA}
        wins={result?.winsA ?? null}
        won={final && result?.winner === match.teamA?.code}
        live={live}
        isMobile={isMobile}
      />
      <TickerSide
        team={match.teamB}
        wins={result?.winsB ?? null}
        won={final && result?.winner === match.teamB?.code}
        live={live}
        isMobile={isMobile}
        spaced
      />
    </>
  );

  const className = `flex shrink-0 flex-col ${live ? "border-l-[3px] border-l-ccs-red bg-ccs-red/5" : ""} ${
    divider ? "border-r border-border" : ""
  } transition-colors hover:bg-bg3/30`;
  const style = { minWidth: isMobile ? 150 : 180, padding: isMobile ? "8px 12px" : "10px 16px" };

  // A fixture still missing a side has nothing on its page this card doesn't already say.
  if (match.teamA === null || match.teamB === null) {
    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  }

  return (
    <Link to={`/match/${match.scheduleMatchId}`} className={`${className} no-underline`} style={style}>
      {content}
    </Link>
  );
}

function TickerSide({
  team,
  wins,
  won,
  live,
  isMobile,
  spaced,
}: {
  team: FeedTeam | null;
  /** Null before any game exists, where the column stays empty rather than reading 0-0. */
  wins: number | null;
  won: boolean;
  live: boolean;
  isMobile: boolean;
  spaced?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-1.5 ${spaced ? "mt-0.5" : ""}`}>
      <div className="flex flex-1 items-center gap-1.5 min-w-0">
        <TeamBadge team={team === null ? undefined : toBadge(team)} size={isMobile ? 18 : 20} />
        <span
          className="truncate font-heading font-bold text-text"
          style={{ fontSize: isMobile ? 11 : 12 }}
        >
          {team?.code ?? "TBD"}
        </span>
      </div>
      <span
        className={`font-display font-extrabold tracking-wider ${
          won || live ? "text-text-bright" : "text-text-muted"
        }`}
        style={{ fontSize: isMobile ? 14 : 16 }}
      >
        {wins ?? ""}
      </span>
    </div>
  );
}
