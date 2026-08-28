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
import { useBackNavigation } from "../hooks/useGoBack";
import { errorMessage, type SeriesDetail, type TeamRecord } from "../lib/api";
import { toBadge } from "../lib/leagueAdapters";
import { queries } from "../lib/queries";
import { fmtKickoff } from "../lib/utils";
import { TeamBadge } from "../components/TeamBadge";
import { TeamLink } from "../components/league/TeamLink";
import { SeriesGameCard } from "../components/match/SeriesGameCard";
import { SeriesPreview } from "../components/match/SeriesPreview";
import { SeriesTotals } from "../components/match/SeriesTotals";
import type { TeamNamer } from "../components/match/TeamNameLink";

type Tab = "preview" | "results";

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { goBack, isFallback } = useBackNavigation("/");
  const backLabel = isFallback ? "Home" : "Back";
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

  const { data, error, isPending } = useQuery(queries.matchResult(matchId));

  if (matchId === null) {
    return <Missing message="That match link isn't valid." onBack={goBack} backLabel={backLabel} />;
  }
  if (isPending) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-bg font-body text-text">
        <div className="font-heading text-sm tracking-wider text-text-muted">Loading match…</div>
      </div>
    );
  }
  if (error) return <Missing message={errorMessage(error)} onBack={goBack} backLabel={backLabel} />;
  if (!data) {
    return <Missing message="That match doesn't exist." onBack={goBack} backLabel={backLabel} />;
  }

  // With no games there is only one tab, so nothing the reader picked can apply.
  const hasResults = data.games.length > 0;
  const tab: Tab = hasResults ? (picked ?? "results") : "preview";

  return (
    <div className="min-h-screen w-full bg-bg font-body text-text">
      <div className="border-b border-bg2 bg-bg px-4 py-3">
        <div className="mx-auto max-w-[1100px]">
          <button
            type="button"
            onClick={goBack}
            className="cursor-pointer border-none bg-transparent font-heading text-xs tracking-wider text-ccs-green hover:underline"
          >
            &larr; {backLabel.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <SeriesHeader match={data} />

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

        <Tabs tab={tab} hasResults={hasResults} onSelect={setPicked} />

        {tab === "results" ? (
          <Results match={data} />
        ) : (
          <SeriesPreview
            conf={data.conf}
            codeA={data.teamA?.code ?? null}
            codeB={data.teamB?.code ?? null}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Preview / Results.
 *
 * Same visual language as `PhaseTabs` — underline strip, the selected tab filled — but not that
 * component, which is typed to a season's phases. Two hard-coded tabs don't want a registry.
 */
function Tabs({
  tab,
  hasResults,
  onSelect,
}: {
  tab: Tab;
  hasResults: boolean;
  onSelect: (t: Tab) => void;
}) {
  const entries: [Tab, string][] = hasResults
    ? [["results", "Results"], ["preview", "Preview"]]
    : [["preview", "Preview"]];

  // A strip with one tab is noise — the same rule `PhaseTabs` applies to a single-phase season.
  if (entries.length < 2) return null;

  return (
    <div className="mb-4 flex flex-nowrap overflow-x-auto overflow-y-hidden border-b-2 border-accent">
      {entries.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          aria-current={tab === key ? "true" : undefined}
          className={`shrink-0 cursor-pointer border-none bg-transparent px-4 py-2.5 font-heading text-[13px] uppercase tracking-wider ${
            tab === key
              ? "border-b-2 border-b-accent bg-bg-input text-text-bright"
              : "border-b-2 border-b-transparent text-text-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Missing({
  message,
  onBack,
  backLabel,
}: {
  message: string;
  onBack: () => void;
  backLabel: "Back" | "Home";
}) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-bg font-body text-text">
      <div className="font-heading text-sm tracking-wider text-text-muted">{message}</div>
      <button
        type="button"
        onClick={onBack}
        className="cursor-pointer border-none bg-transparent font-heading text-sm text-ccs-green hover:underline"
      >
        &larr; {backLabel}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------- the header

function SeriesHeader({ match }: { match: SeriesDetail }) {
  const { conf, result, teamA, teamB } = match;
  const winsA = result?.winsA ?? 0;
  const winsB = result?.winsB ?? 0;

  return (
    <div className="mb-6 rounded-lg border border-border bg-bg2 p-6">
      <div className="flex items-center justify-center gap-6 md:gap-10">
        <TeamColumn team={teamA} conf={conf} side="left" won={result !== null && result.winner === teamA?.code} />

        <div className="flex min-w-[90px] shrink-0 flex-col items-center gap-1">
          {result === null ? (
            <span className="rounded bg-bg-input px-3 py-1 font-display text-base tracking-widest text-text-dim">
              VS
            </span>
          ) : (
            <div className="flex items-center gap-3">
              <span className={`font-display text-3xl md:text-4xl ${winsA >= winsB ? "text-text-bright" : "text-text-muted"}`}>
                {winsA}
              </span>
              <span className="font-display text-lg text-text-subtle">-</span>
              <span className={`font-display text-3xl md:text-4xl ${winsB >= winsA ? "text-text-bright" : "text-text-muted"}`}>
                {winsB}
              </span>
            </div>
          )}
          <StatusChip match={match} />
        </div>

        <TeamColumn team={teamB} conf={conf} side="right" won={result !== null && result.winner === teamB?.code} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-heading text-[11px] tracking-wider text-text-muted">
        <Caption>{match.league.toUpperCase()}</Caption>
        {/* `matchDay` is the day within its own phase, which is what a bracket round is called on
            screen. `seasonDay` is a join key and is never rendered — see `CLAUDE.md`. */}
        <Caption>
          {match.phase.kind === "bracket" ? `${match.phase.name} · Round ${match.phase.matchDay}` : match.phase.name}
        </Caption>
        <Caption>BO{match.bestOf}</Caption>
        {match.scheduledAt !== null && <Caption>{fmtKickoff(match.scheduledAt)}</Caption>}
        {result?.hasForfeit && <Caption>DECIDED IN PART BY FORFEIT</Caption>}
        {match.streamUrl && (
          <>
            <span className="text-text-subtle">·</span>
            <a
              href={match.streamUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent no-underline hover:underline"
            >
              WATCH
            </a>
          </>
        )}
      </div>
    </div>
  );
}

/** Caption items are separated by a dot, and the separator belongs to the item that follows one. */
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="text-text-subtle first:hidden">·</span>
      <span>{children}</span>
    </>
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
        <span className="font-display text-[10px] tracking-widest text-ccs-red">LIVE</span>
      </span>
    );
  }

  // `completed` with no winner is the API's way of saying "played, nobody clinched" — an abandoned
  // series, or a best-of-two that legitimately split. Saying FINAL over a level scoreline would read
  // as a rendering bug, so it says which one it is.
  const label =
    match.status === "completed"
      ? match.result?.winner === null
        ? "NO RESULT"
        : "FINAL"
      : match.status === "upcoming"
        ? "SCHEDULED"
        : "TO BE CONFIRMED";

  return <span className="font-display text-[10px] tracking-widest text-text-dim">{label}</span>;
}

function TeamColumn({
  team,
  conf,
  side,
  won,
}: {
  team: TeamRecord | null;
  conf: string;
  side: "left" | "right";
  won: boolean;
}) {
  if (team === null) {
    return (
      <div className={`flex min-w-0 flex-1 items-center ${side === "left" ? "justify-end" : ""}`}>
        <span className="font-heading text-base italic text-text-dim md:text-lg">TBD</span>
      </div>
    );
  }

  const badge = <TeamBadge team={toBadge(team)} size={44} />;
  const name = (
    <span
      className={`truncate font-heading text-base font-medium group-hover:text-accent md:text-lg ${
        won ? "font-bold text-text-bright" : "text-text-muted"
      }`}
    >
      <span className="hidden md:inline">{team.name}</span>
      <span className="md:hidden">{team.code}</span>
    </span>
  );

  return (
    <TeamLink
      conf={conf}
      code={team.code}
      className={`group flex min-w-0 flex-1 flex-col gap-1 no-underline ${side === "left" ? "items-end" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {side === "left" ? (
          <>
            {name}
            {badge}
          </>
        ) : (
          <>
            {badge}
            {name}
          </>
        )}
      </div>
      {/* `record` is the season record, forfeits included, and it comes on the same row as the team —
          so it costs nothing here. Absent only on an API too old to serve it, where `0-0` would be a
          lie rather than a default. */}
      {team.record && (
        <span className="font-mono text-[11px] text-text-dim">
          {team.record.seriesWins}-{team.record.seriesLosses}
        </span>
      )}
    </TeamLink>
  );
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
