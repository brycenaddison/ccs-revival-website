/**
 * One best-of in full — `/match/:scheduleMatchId`.
 *
 * **One request for the page.** `GET /tournaments/schedule/:id/result` answers the fixture, both teams
 * with their season records, and a game-by-game box score. The version this replaces had neither the
 * endpoint nor the id: it took a synthesized series key, pulled one team's entire matchlist, filtered it
 * by season day and opponent, and could therefore only ever show five of the ten players — with a
 * paragraph at the bottom apologizing for it.
 *
 * The other thing the fixture id buys is correctness on a double-header. The `series` view groups on
 * `(conf, season_day, teamA, teamB)` and cannot separate two best-ofs between one pair on one day; this
 * read keys on the fixture. Where the two disagree, this one is right — and it says so, via `linkage`.
 *
 * **Two tabs, because the page answers two different questions.** Before a match: how do these teams
 * compare. After it: what happened. Stacking both made the box scores sit below a screenful of season
 * averages that were no longer the news. Results is the default whenever there are games — which is what
 * someone opening a finished match came for — and it is absent entirely when there are none, so the tab
 * strip never offers an empty page. Only the Preview tab costs extra requests, and only when it is open.
 */

import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "../components/layout/PageShell";
import { BackLink } from "../components/BackLink";
import { UnderlineTabs } from "../components/UnderlineTabs";
import { errorMessage, type SeriesDetail } from "../lib/api";
import { queries } from "../lib/queries";
import { useAuth } from "../lib/authContext";
import { usePageMetadata } from "../components/seo/MetadataProvider";
import { fmtKickoff } from "../lib/utils";
import {
  MATCHUP_CAPTION_LINK,
  MatchupCaption,
  MatchupHeader,
  MatchupScore,
  MatchupVs,
} from "../components/match/MatchupHeader";
import { MatchPredictionPanel } from "../components/predictions/MatchPredictionPanel";
import { SeriesGameCard } from "../components/match/SeriesGameCard";
import { SeriesPreview } from "../components/match/SeriesPreview";
import { SeriesTotals } from "../components/match/SeriesTotals";
import { TournamentCodes } from "../components/match/TournamentCodes";
import type { TeamNamer } from "../components/match/TeamNameLink";

type Tab = "preview" | "results";

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading } = useAuth();
  /**
   * Null until the reader picks one, so the default can follow the data without an effect: the fixture
   * hasn't loaded on the first render, and seeding state from it would need a second pass to correct.
   */
  const [picked, setPicked] = useState<Tab | null>(null);

  // A non-numeric segment is a bad link, not a missing match: upstream answers `400` for one, so this
  // resolves it here and never asks.
  const matchId = useMemo(() => {
    const n = Number(id);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [id]);

  const { data, error, isPending } = useQuery({
    ...queries.matchResult(matchId, profile?.id ?? null),
    enabled: matchId !== null && !loading,
  });
  const matchup = data ? `${data.teamA?.name || "TBD"} vs ${data.teamB?.name || "TBD"}` : "Match";
  usePageMetadata({
    title: `${matchup} | CCS`,
    description: data ? `Follow ${matchup} in ${data.league || "CCS"}, with match results and game statistics.` : "Follow CCS match results and game statistics.",
    noindex: matchId === null || !!error || (!isPending && !data),
  });

  if (matchId === null) {
    return <Missing message="That match link isn't valid." />;
  }
  if (isPending) {
    return (
      <PageShell maxWidth={1100}>
        <div className="py-16 text-center font-heading text-sm text-text-muted">Loading match…</div>
      </PageShell>
    );
  }
  if (error) return <Missing message={errorMessage(error)} />;
  if (!data) {
    return <Missing message="That match doesn't exist." />;
  }

  // With no games there is only one tab, so nothing the reader picked can apply.
  const hasResults = data.games.length > 0;
  const tab: Tab = hasResults ? (picked ?? "results") : "preview";

  return (
    <PageShell maxWidth={1100}>
      <BackLink fallback="/" fallbackLabel="Home" />
      <div>
        <SeriesHeader match={data} />
        <TournamentCodes key={`${matchId}-${profile?.id ?? "guest"}`} codes={data.codes} />

        {/*
          Only the undated case is worth saying. "No games recorded yet" on a fixture whose kickoff is in
          the header above it tells the reader what they can already see — and the header's own SCHEDULED
          chip says it in two words.
        */}
        {!hasResults && data.scheduledAt === null && (
          <p className="mb-4 rounded-lg border border-border bg-bg2 px-4 py-3 text-center text-[13px] text-text-dim">
            This match isn&apos;t scheduled yet.
          </p>
        )}

        <UnderlineTabs
          tabs={hasResults ? RESULT_TABS : PREVIEW_TABS}
          selected={tab}
          onSelect={setPicked}
        />

        {tab === "results" ? (
          <Results match={data} />
        ) : (
          <>
            {/* Settled predictions stay here too: the Results tab is about the games. */}
            <MatchPredictionPanel scheduleMatchId={matchId} />
            <SeriesPreview
              conf={data.conf}
              codeA={data.teamA?.code ?? null}
              codeB={data.teamB?.code ?? null}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}

const RESULT_TABS = [
  { key: "results", label: "Results" },
  { key: "preview", label: "Preview" },
] as const satisfies readonly { key: Tab; label: string }[];
const PREVIEW_TABS = [{ key: "preview", label: "Preview" }] as const satisfies readonly { key: Tab; label: string }[];

function Missing({ message }: { message: string }) {
  return (
    <PageShell maxWidth={1100}>
      <BackLink fallback="/" fallbackLabel="Home" />
      <div className="py-16 text-center font-heading text-sm text-text-muted">{message}</div>
    </PageShell>
  );
}

// ------------------------------------------------------------------- the header

function SeriesHeader({ match }: { match: SeriesDetail }) {
  const { conf, result, teamA, teamB } = match;
  // `record` is the season record, forfeits included, and it comes on the same row as the team, so
  // it costs nothing here. Absent only on an API too old to serve it, where `0-0` would be a lie.
  const recordOf = (team: SeriesDetail["teamA"]) =>
    team?.record ? `${team.record.seriesWins}-${team.record.seriesLosses}` : null;

  return (
    <MatchupHeader
      conf={conf}
      teamA={teamA}
      teamB={teamB}
      wonA={result !== null && result.winner === teamA?.code}
      wonB={result !== null && result.winner === teamB?.code}
      recordA={recordOf(teamA)}
      recordB={recordOf(teamB)}
      center={
        <>
          {result === null ? <MatchupVs /> : <MatchupScore a={result.winsA} b={result.winsB} />}
          <StatusChip match={match} />
        </>
      }
      caption={
        <>
          <MatchupCaption>{match.league}</MatchupCaption>
          {/* `matchDay` is the day within its own phase, which is what a bracket round is called on
              screen. `seasonDay` is a join key and is never rendered — see `AGENTS.md`. */}
          <MatchupCaption>
            {match.phase.kind === "bracket" ? `${match.phase.name} · Round ${match.phase.matchDay}` : match.phase.name}
          </MatchupCaption>
          <MatchupCaption>Bo{match.bestOf}</MatchupCaption>
          {/* A date keeps its own case: "SAT, SEP 6" reads as shouting. */}
          {match.scheduledAt !== null && (
            <MatchupCaption>
              <span className="normal-case">{fmtKickoff(match.scheduledAt)}</span>
            </MatchupCaption>
          )}
          {result?.hasForfeit && <MatchupCaption>Decided in part by forfeit</MatchupCaption>}
          {match.streamUrl && (
            <MatchupCaption>
              <a href={match.streamUrl} target="_blank" rel="noreferrer" className={MATCHUP_CAPTION_LINK}>
                Watch
              </a>
            </MatchupCaption>
          )}
        </>
      }
    />
  );
}

function StatusChip({ match }: { match: SeriesDetail }) {
  if (match.status === "live") {
    return (
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-full bg-ccs-red shadow-[0_0_8px_var(--red)]"
          style={{ animation: "pulse 1.5s infinite" }}
        />
        <span className="font-display text-[10px] text-ccs-red">Live</span>
      </span>
    );
  }

  // `completed` with no winner is the API's way of saying "played, nobody clinched" — an abandoned
  // series, or a best-of-two that legitimately split. Saying FINAL over a level scoreline would read
  // as a rendering bug, so it says which one it is.
  const label =
    match.status === "completed"
      ? match.result?.winner === null
        ? "No result"
        : "Final"
      : match.status === "upcoming"
        ? "Scheduled"
        : "To be confirmed";

  return <span className="font-display text-[10px] text-text-dim">{label}</span>;
}

// ------------------------------------------------------------------- results

/**
 * What happened: the series added up, then game by game.
 *
 * The declared rosters used to sit here, listing starters and bench with no statistics. They moved into
 * the Preview tab, where a name comes with a season line beside it — a bare list of ten names above a box
 * score naming the same ten people said nothing twice.
 *
 * Only rendered with at least one game, so there is no empty branch: the page shows its own note above
 * the tabs when there is nothing to show, and the Results tab doesn't exist.
 */
function Results({ match }: { match: SeriesDetail }) {
  // A fallback that never appears on a real fixture with games — a game exists because two teams played
  // it — but the box score needs a name for the winner of a game with no sides recorded.
  const codeA = match.teamA?.code ?? "Team A";
  const codeB = match.teamB?.code ?? "Team B";

  /*
   * The games identify a side by team code; the full name and the conference are on the fixture. Resolved
   * here and handed down, so a card names a team the way the header does rather than reaching for the
   * lookup itself — and so a code belonging to neither side (which `inferred` linkage can produce) stays
   * a code instead of being mislabeled.
   */
  const nameOf: TeamNamer = code => {
    const team = code === match.teamA?.code ? match.teamA : code === match.teamB?.code ? match.teamB : null;
    return team === null ? null : { name: team.name, conf: match.conf };
  };

  return (
    <>
      <SeriesTotals games={match.games} codeA={codeA} codeB={codeB} nameOf={nameOf} />

      {match.games.map(g => (
        <SeriesGameCard
          key={`${g.game}-${g.matchId ?? "ff"}`}
          game={g}
          codeA={codeA}
          codeB={codeB}
          nameOf={nameOf}
        />
      ))}

      {/*
        `inferred` means nothing was attached to this fixture, so the games were matched on the
        conference day and the team pair instead — which is the `series` grouping key and can therefore
        be wrong in exactly one way. Every season predating the phases model has a null
        `schedule_match_id` on every row, so without the fallback those match pages are empty; the
        caveat is what stops it being silently wrong instead.
      */}
      {match.linkage === "inferred" && (
        <p className="mt-2 text-[10px] leading-relaxed text-text-dim">
          These games aren&apos;t linked to this fixture directly — they were matched by date and by the
          two teams, which is how results from before the season schedule existed are found at all. If
          the same two teams played two separate series on one day, both are listed here.
        </p>
      )}
    </>
  );
}
