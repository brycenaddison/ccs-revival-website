/**
 * The strip across the top of the site: what just finished, what is on now, what is next.
 *
 * Takes no props and owns its own query. Three pages mount it, and threading a window and a
 * `matches` array through each of them is how the three came to disagree the first time round —
 * the previous version rendered `LeagueData.matches`, which nothing has ever filled.
 *
 * The window is exported because Home needs the *same* query: a live series means the standings are
 * moving too, and Home refreshes the league on a timer while one is on. Reading it through the same
 * key shares this request rather than making a second one.
 */

import { Link } from "react-router-dom";
import { TeamBadge } from "../TeamBadge";
import { toBadge } from "../../lib/leagueAdapters";
import { fmtRelativeDay, fmtTime } from "../../lib/utils";
import { DAY_MS, useScheduleFeed, type FeedWindow } from "../../hooks/useScheduleFeed";
import { useWindowSize } from "../../hooks/useWindowSize";
import type { FeedMatch, FeedTeam } from "../../lib/api";

/**
 * Two days back, a week forward, in kickoff order — so finals sit to the left of what is live and
 * upcoming fixtures to the right, and the interesting part of the strip is where the scroll starts.
 *
 * `pending` is left out on purpose: an undated bracket slot and a fixture nobody turned up for are
 * both things a ticker would be lying about. `limit` is the ceiling on a busy night across every
 * active league.
 */
export const TICKER_WINDOW: FeedWindow = {
  from: -2 * DAY_MS,
  to: 7 * DAY_MS,
  statuses: ["completed", "live", "upcoming"],
  order: "asc",
  limit: 40,
};

/** Thirty seconds, which is the cadence the endpoint was built for (`max-age=15`). */
const POLL_MS = 30_000;

export function ScoreboardTicker() {
  const isMobile = useWindowSize() < 768;
  const { data } = useScheduleFeed(TICKER_WINDOW, POLL_MS);
  const matches = data?.matches ?? [];

  // No strip at all rather than an empty bar: this sits above the nav, and a permanent empty band
  // reads as the layout being broken. Loading and "nothing this week" are the same thing here.
  if (matches.length === 0) return null;

  return (
    <div className="border-b border-border3 bg-bg overflow-hidden">
      <div
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
 * default — so the date costs nothing here and is worth having: the strip spans two days back and a
 * week forward, and `7:00 PM` alone doesn't say which of five evenings it is.
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
