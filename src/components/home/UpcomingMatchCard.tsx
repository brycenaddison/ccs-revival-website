/** A larger matchup for the signed-in viewer, with fixture metadata supplied by the feed. */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { FeedMatch } from "../../lib/api";
import { toBadge } from "../../lib/leagueAdapters";
import { queries } from "../../lib/queries";
import { fmtKickoff } from "../../lib/utils";
import { TeamBadge } from "../TeamBadge";

export function UpcomingMatchCard({ match, profileId }: { match: FeedMatch; profileId: number }) {
  // Only the featured fixture needs this read: the public feed cannot reveal code availability.
  const { data } = useQuery(queries.matchResult(match.scheduleMatchId, profileId));
  const hasCodes = (data?.codes.length ?? 0) > 0;

  const body = (
    <>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-heading text-xs text-text-muted">
          {match.codename ?? match.shortname ?? match.league}
        </span>
        {match.scheduledAt && (
          <time dateTime={match.scheduledAt} className="font-heading text-sm font-medium text-text-secondary">
            {fmtKickoff(match.scheduledAt)}
          </time>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <FeaturedTeam team={match.teamA} />
        <span className="mt-5 font-display text-xl text-text-dim">vs</span>
        <FeaturedTeam team={match.teamB} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
        {match.phase !== null && (
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="font-heading text-xs text-text-dim">Phase</dt>
            <dd className="mt-1 break-words font-heading text-sm font-semibold text-text-bright">{match.phase}</dd>
          </div>
        )}
        {match.phase !== null && (
          <div>
            <dt className="font-heading text-xs text-text-dim">Match day</dt>
            <dd className="mt-1 font-heading text-sm font-semibold text-text-bright">{match.matchDay}</dd>
          </div>
        )}
        <div>
          <dt className="font-heading text-xs text-text-dim">Format</dt>
          <dd className="mt-1 font-heading text-sm font-semibold text-text-bright">Best of {match.bestOf}</dd>
        </div>
      </dl>

      {match.scheduleMatchId !== null && (
        <p className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 font-heading text-xs text-text-secondary">
          <span>{hasCodes ? "Click for tournament codes." : "Click to view match details."}</span>
          <ArrowRight size={16} className="shrink-0" aria-hidden="true" />
        </p>
      )}
    </>
  );

  return (
    <section aria-label="Your upcoming match" className="min-w-0 overflow-hidden rounded-md border border-border bg-bg2">
      <div className="border-b border-border px-4 py-3.5">
        <h2 className="font-display text-lg text-text-bright">Your upcoming match</h2>
      </div>
      {match.scheduleMatchId === null ? <div className="p-4 sm:p-5">{body}</div> : (
        <Link
          to={`/match/${match.scheduleMatchId}`}
          className="block p-4 no-underline transition-colors hover:bg-bg3/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:p-5"
        >
          {body}
        </Link>
      )}
    </section>
  );
}

function FeaturedTeam({ team }: { team: FeedMatch["teamA"] }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-3 text-center">
      <TeamBadge team={team === null ? undefined : toBadge(team)} size={64} />
      <span className="w-full break-words font-heading text-base font-bold leading-snug text-text-bright sm:text-lg">
        {team?.name ?? "TBD"}
      </span>
    </div>
  );
}
