/**
 * Series and games, as one list.
 *
 * These used to be two sections showing the same games twice — a flat "recent games" list and a
 * separate "series history" of scorelines with nothing under them. The payload already relates
 * them: `matches[].gameIds` names exactly the games in each series, so the join is a map lookup and
 * the two collapse into one thing a reader can actually follow.
 *
 * **Series order is the API's**, newest first, and is never re-sorted — upstream resolves
 * doubleheaders through `scheduleMatchId` in a way nothing here could reconstruct. Games *within* a
 * series are ordered by game number, which is presentation of a set rather than a ranking: G1
 * before G2 is how a series is read, and the served order is newest-first for the flat list this
 * replaced.
 *
 * The trailing "other games" group should never appear — `matches` is built from the same rows as
 * `games` — but it is three lines of insurance against silently dropping a game if that ever stops
 * being true.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { PhaseRef, ProfileGame, ProfileMatch } from "../../lib/api";
import { fmtDay } from "../../lib/utils";
import { GameRowHeader, ProfileGameRow } from "./ProfileGameRow";
import { TeamLink } from "../league/TeamLink";
import { TeamChip, TeamLogo, useConfLabel, type TeamIndex } from "./profileUi";

interface Group {
  key: string;
  match: ProfileMatch | null;
  games: ProfileGame[];
}

interface Props {
  matches: readonly ProfileMatch[];
  games: readonly ProfileGame[];
  teamIndex: TeamIndex;
}

export function MatchHistory({ matches, games, teamIndex }: Props) {
  const groups = useMemo(() => buildGroups(matches, games), [matches, games]);

  if (groups.length === 0) {
    return <p className="rounded-lg border border-border bg-bg2 px-4 py-6 text-sm text-text-dim">No games played.</p>;
  }

  // Everything, in one list. There was a "show more" here, which was pagination over data that had
  // already arrived — the whole career comes down in the single profile request, so the button
  // bought nothing and hid the rest of the page's own scroll position behind a click.
  return (
    <div className="flex flex-col gap-3">
      {groups.map(group => (
        <SeriesCard key={group.key} group={group} teamIndex={teamIndex} />
      ))}
    </div>
  );
}

function SeriesCard({ group, teamIndex }: { group: Group; teamIndex: TeamIndex }) {
  const confLabel = useConfLabel();
  const { match, games } = group;

  // An ungrouped game still needs a conf, a placement and a date to head its card; take them from
  // the game. Every game in a series shares one season day and one phase, so either source answers
  // the same.
  const conf = match?.conf ?? games[0]?.conf ?? "";
  const startTime = match?.startTime ?? games[0]?.startTime ?? null;
  const placement = placementLabel(
    match?.phase ?? games[0]?.phase ?? null,
    match?.seasonDay ?? games[0]?.seasonDay ?? 0,
  );
  const won = match ? match.gameWins > match.gameLosses : games.some(g => g.win);
  const seriesId = match?.scheduleMatchId ?? null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg2">
      {/*
        The whole header opens the series, but the two team names still open their own pages.
        That needs an *overlay* link rather than a wrapping one: an anchor cannot contain anchors,
        so the series link is an absolutely-positioned sibling covering the header, and the content
        sits above it. The content is `pointer-events-none` so clicks fall through to the overlay,
        and the team links opt back in with `pointer-events-auto` — which is also what makes them
        take precedence, since they are physically on top of the overlay where they overlap.

        The cost is that header text can't be selected. Acceptable for a row whose whole job is
        navigation; the numbers a reader might want to copy are all in the rows below.

        Only a series with a scheduled match has a page of its own. A legacy grouping gets no
        overlay and no hover — a link to nowhere is worse than no link, and its games are still
        individually clickable from the rows beneath.
      */}
      <div className={`relative px-3 py-2.5 transition-colors ${seriesId !== null ? "hover:bg-bg-input" : ""}`}>
        {seriesId !== null && (
          <Link
            to={`/match/${seriesId}`}
            aria-label="Open this series"
            className="absolute inset-0 z-0"
          />
        )}

        <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-x-3 gap-y-2">
          {match ? (
            <>
              <span className="flex flex-1 basis-[140px] justify-start">
                <TeamChip
                  conf={match.conf}
                  code={match.team}
                  team={teamIndex(match.conf, match.team)}
                  className="pointer-events-auto w-fit max-w-full rounded px-1 -mx-1 hover:bg-accent/20"
                />
              </span>

              <span
                className={`shrink-0 rounded px-2 py-0.5 font-display text-lg leading-none tracking-wider ${
                  won ? "bg-ccs-green/20 text-ccs-green" : "bg-ccs-red/20 text-ccs-red"
                }`}
              >
                {match.gameWins}–{match.gameLosses}
              </span>

              <span className="flex flex-1 basis-[140px] justify-start">
                <TeamLink
                  conf={match.conf}
                  code={match.opponentCode}
                  className="pointer-events-auto flex w-fit min-w-0 max-w-full items-center gap-2 rounded px-1 -mx-1 no-underline hover:bg-accent/20"
                >
                  <TeamLogo team={match.opponent} code={match.opponentCode ?? "?"} size={22} />
                  <span className="truncate font-heading text-text-secondary hover:text-accent">
                    {match.opponent?.name ?? match.opponentCode ?? "Unknown"}
                  </span>
                </TeamLink>
              </span>
            </>
          ) : (
            <span className="flex-1 font-heading text-text-secondary">Other games</span>
          )}

          {/* League, then where in the season, then the date. */}
          <span className="shrink-0 text-right text-[11px] text-text-dim">
            {/* The full league name, not `short`. `shortname` is deliberately shared between the
                divisions running concurrently, so it cannot tell two of them apart — and this card is
                as wide as the series header, which has room for the real thing. */}
            <span className="block">{confLabel(conf).name}</span>
            {placement && <span className="block text-text-secondary">{placement}</span>}
            <span className="block">{fmtDay(startTime) || "—"}</span>
          </span>
        </div>
      </div>

      {/* The games scroll sideways; the header above them does not. `GAME_GRID` has a minimum
          width, so on a phone this is a scroller rather than nine columns crushed to nothing — and
          the caption row has to live inside it or it would drift out of line with the rows the
          moment either one moved. */}
      <div className="overflow-x-auto">
        <GameRowHeader />
        <ul className="flex flex-col">
          {games.map(game => (
            <ProfileGameRow key={game.matchId} game={game} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Where in the season a series sat, in one line.
 *
 * Prefers the **phase**, which is what a player actually says — "semifinals", "week 3 of groups" —
 * over `seasonDay`, which is a season-wide ordinal and a join key first. `CLAUDE.md` keeps season day
 * off reader-facing surfaces for exactly that reason; it survives here only as the fallback for a
 * legacy conference that predates the phase list, where the alternative is saying nothing at all.
 *
 * Within a bracket, `roundName` wins when an operator typed one. It is the node's own label, and
 * naming a round from its depth is wrong for a third-place match and for every loser's bracket — so
 * an unlabeled bracket node gets the phase name and its day rather than an invented "Round 3".
 *
 * `matchDay` is deliberately *not* called a week: the API counts match days, and while CCS happens to
 * play one a week, a phase that ever doubled up would make the label a lie.
 */
function placementLabel(phase: PhaseRef | null, seasonDay: number): string | null {
  if (phase === null) return seasonDay > 0 ? `Week ${seasonDay}` : null;
  if (phase.roundName) return `${phase.name} · ${phase.roundName}`;
  if (phase.matchDays > 1) return `${phase.name} · Day ${phase.matchDay} of ${phase.matchDays}`;
  return phase.name;
}

/** G1 before G2. An unnumbered game sorts last, then by kickoff, so the order is always total. */
function byGameNumber(a: ProfileGame, b: ProfileGame): number {
  const an = a.game ?? Number.MAX_SAFE_INTEGER;
  const bn = b.game ?? Number.MAX_SAFE_INTEGER;
  if (an !== bn) return an - bn;
  return (a.startTime ?? "").localeCompare(b.startTime ?? "");
}

function buildGroups(matches: readonly ProfileMatch[], games: readonly ProfileGame[]): Group[] {
  const byId = new Map(games.map(game => [game.matchId, game]));
  const claimed = new Set<string>();

  const groups: Group[] = matches.map(match => {
    const lines = match.gameIds.flatMap(id => {
      const game = byId.get(id);
      if (!game) return [];
      claimed.add(id);
      return [game];
    });
    return { key: match.seriesId, match, games: lines.sort(byGameNumber) };
  });

  const orphans = games.filter(game => !claimed.has(game.matchId));
  if (orphans.length > 0) groups.push({ key: "ungrouped", match: null, games: orphans });

  return groups;
}
