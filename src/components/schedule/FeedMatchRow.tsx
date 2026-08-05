/**
 * One fixture from the public feed, as a card.
 *
 * Shared by `/scores` and `/schedule`, which are the same endpoint with a different window and should
 * not be two different-looking lists. What differs is one thing — a played fixture shows its scoreline
 * where an unplayed one shows `VS` — and that is decided by `result` being there, not by which page is
 * rendering, so a live series looks the same in both.
 *
 * **A card is a link to the series, not to a team.** The team names deliberately don't link: a nested
 * anchor is invalid, and a row in a schedule is a way into the match. Team pages are reached from the
 * match page and from Teams.
 */

import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { TeamBadge } from "../TeamBadge";
import { toBadge } from "../../lib/leagueAdapters";
import { fmtClock } from "../../lib/utils";
import type { FeedMatch, FeedTeam } from "../../lib/api";

interface Props {
  match: FeedMatch;
  isMobile: boolean;
  /**
   * Show which league the fixture belongs to. On by default: the feed is cross-conference, so an
   * unlabelled row in a mixed list is ambiguous. Off for a list already scoped to one league.
   */
  showLeague?: boolean;
}

/** One side of the card. `side` decides which way the badge and the name sit. */
function Side({
  team,
  side,
  won,
  isMobile,
}: {
  team: FeedTeam | null;
  side: "left" | "right";
  won: boolean;
  isMobile: boolean;
}) {
  const name = team === null ? "TBD" : isMobile ? team.code : team.name;

  const label = (
    <span
      className={`truncate font-heading font-medium ${isMobile ? "text-sm" : "text-base"} ${
        team === null ? "italic text-text-dim" : won ? "font-bold text-text-bright" : "text-text"
      }`}
    >
      {name}
    </span>
  );
  const badge = <TeamBadge team={team === null ? undefined : toBadge(team)} size={isMobile ? 28 : 34} />;

  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${side === "left" ? "justify-end" : ""}`}>
      {side === "left" ? (
        <>
          {label}
          {badge}
        </>
      ) : (
        <>
          {badge}
          {label}
        </>
      )}
    </div>
  );
}

export function FeedMatchRow({ match, isMobile, showLeague = true }: Props) {
  const { result, status, teamA, teamB } = match;
  const live = status === "live";
  const played = result !== null;

  const card = (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {live ? (
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full bg-ccs-red shadow-[0_0_8px_var(--red)]"
              style={{ animation: "pulse 1.5s infinite" }}
            />
            <span className="font-display text-[10px] tracking-widest text-ccs-red">LIVE</span>
          </span>
        ) : (
          <span className="font-heading text-[10px] tracking-wide text-text-muted">
            {/* A finished fixture is labelled by its outcome, not by a kickoff nobody is waiting for. */}
            {status === "completed" ? "FINAL" : fmtClock(match.scheduledAt)}
          </span>
        )}

        {showLeague && (
          <span className="truncate font-heading text-[10px] tracking-wide text-text-dim">
            {match.shortname ?? match.league}
          </span>
        )}

        {/* The phase, and — on a bracket — which round of it. `matchDay` is phase-relative, which is
            what a round is called on screen; `seasonDay` is a join key and never appears. */}
        <span className="truncate font-heading text-[10px] tracking-wide text-text-dim">
          {match.phaseKind === "bracket" ? `${match.phase} · Round ${match.matchDay}` : match.phase}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {result?.hasForfeit && (
            <span className="font-mono text-[9px] text-text-muted" title="Decided in part by a forfeit">
              FF
            </span>
          )}
          <span className="font-mono text-[9px] text-text-dim">Bo{match.bestOf}</span>
        </span>
      </div>

      <div className={`flex items-center justify-center ${isMobile ? "gap-3" : "gap-6"}`}>
        <Side team={teamA} side="left" won={played && result.winner === teamA?.code} isMobile={isMobile} />

        <div className="flex min-w-[60px] shrink-0 items-center justify-center gap-2">
          {played ? (
            <>
              <span
                className={`font-display ${isMobile ? "text-[22px]" : "text-[26px]"} ${
                  result.winsA >= result.winsB ? "text-text-bright" : "text-text-muted"
                }`}
              >
                {result.winsA}
              </span>
              <span className="font-display text-sm text-text-subtle">-</span>
              <span
                className={`font-display ${isMobile ? "text-[22px]" : "text-[26px]"} ${
                  result.winsB >= result.winsA ? "text-text-bright" : "text-text-muted"
                }`}
              >
                {result.winsB}
              </span>
            </>
          ) : (
            <span className="rounded bg-bg-input px-3 py-1 font-display text-sm tracking-widest text-text-dim">
              VS
            </span>
          )}
        </div>

        <Side team={teamB} side="right" won={played && result.winner === teamB?.code} isMobile={isMobile} />
      </div>
    </>
  );

  const shell = `block rounded-md border bg-bg2 ${isMobile ? "px-3 py-3.5" : "px-5 py-4"} ${
    live ? "border-ccs-red/40" : "border-border"
  }`;

  // A fixture missing a side has nothing to show on its own page but the two words already on this
  // card, so it doesn't pretend to be a link. The stream anchor lives outside the `Link` for the same
  // reason a nested anchor is avoided anywhere else.
  if (teamA === null || teamB === null) {
    return (
      <div className={shell}>
        {card}
        <StreamLink url={match.streamUrl} />
      </div>
    );
  }

  return (
    <div className={`${shell} transition-colors hover:border-border2`}>
      <Link to={`/match/${match.scheduleMatchId}`} className="block no-underline">
        {card}
      </Link>
      <StreamLink url={match.streamUrl} />
    </div>
  );
}

function StreamLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="mt-2.5 flex justify-center">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 font-heading text-[10px] uppercase tracking-wider text-accent no-underline hover:underline"
      >
        <ExternalLink size={11} aria-hidden="true" />
        Watch
      </a>
    </div>
  );
}
