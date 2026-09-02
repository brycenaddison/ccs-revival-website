/**
 * The next few fixtures, for Home's middle column.
 *
 * Its own narrow window on the feed rather than a filter over the ticker's: "the next five" and "two
 * days either side of now" are different questions, and deriving one from the other empties this
 * widget on any night busy enough to fill the ticker's page.
 */

import { Link } from "react-router-dom";
import { TeamBadge } from "../TeamBadge";
import { toBadge } from "../../lib/leagueAdapters";
import { fmtTime } from "../../lib/utils";
import { useScheduleFeed, type FeedWindow } from "../../hooks/useScheduleFeed";
import { feedMatchKey, type FeedMatch } from "../../lib/api";

/**
 * From now on, upcoming only, five of them.
 *
 * `from: 0` excludes undated fixtures, which is right for a widget that leads with a time — and it
 * also excludes anything already live, which the ticker directly above is showing.
 */
const WINDOW: FeedWindow = { from: 0, statuses: ["upcoming"], order: "asc", limit: 5 };

export function UpcomingSchedule({ isMobile }: { isMobile: boolean }) {
  const { data } = useScheduleFeed(WINDOW);
  const matches = data?.matches ?? [];

  if (matches.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg2">
      <div className="border-b border-border px-4 py-3.5">
        <span className="font-display text-[15px] text-text-bright">Upcoming</span>
      </div>
      {matches.map((m, i) => (
        <Row key={feedMatchKey(m)} match={m} isMobile={isMobile} divider={i < matches.length - 1} />
      ))}
    </div>
  );
}

function Row({
  match,
  isMobile,
  divider,
}: {
  match: FeedMatch;
  isMobile: boolean;
  divider: boolean;
}) {
  const { teamA, teamB } = match;
  const nameOf = (team: FeedMatch["teamA"]) =>
    team === null ? "TBD" : isMobile ? team.code : team.name;

  const body = (
    <>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-heading text-[10px] tracking-wide text-text-muted">
          {fmtTime(match.scheduledAt ?? undefined)}
        </span>
        <span className="truncate font-heading text-[10px] tracking-wide text-text-dim">
          {/* Same rule as `FeedMatchRow`: the division name distinguishes concurrent confs, the
              season label does not. */}
          {match.codename ?? match.shortname ?? match.league}
        </span>
      </div>
      <div className="flex items-center justify-center" style={{ gap: isMobile ? 10 : 16 }}>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <span
            className="truncate font-heading font-medium text-text"
            style={{ fontSize: isMobile ? 12 : 13 }}
          >
            {nameOf(teamA)}
          </span>
          <TeamBadge team={teamA === null ? undefined : toBadge(teamA)} />
        </div>
        <span className="shrink-0 rounded bg-bg-input px-2 py-0.5 font-display text-[13px] text-text-dim">
          vs
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <TeamBadge team={teamB === null ? undefined : toBadge(teamB)} />
          <span
            className="truncate font-heading font-medium text-text"
            style={{ fontSize: isMobile ? 12 : 13 }}
          >
            {nameOf(teamB)}
          </span>
        </div>
      </div>
    </>
  );

  const padding = `px-4 py-3.5 ${divider ? "border-b border-bg3" : ""}`;

  if (teamA === null || teamB === null || match.scheduleMatchId === null) return <div className={padding}>{body}</div>;

  return (
    <Link to={`/match/${match.scheduleMatchId}`} className={`block no-underline ${padding} hover:bg-bg3/30`}>
      {body}
    </Link>
  );
}
