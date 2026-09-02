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
import { placementLabel } from "../../lib/api";
import type { ProfileGame, ProfileMatch } from "../../lib/api";
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
  //
  // The list is a grid and every series header is a subgrid of it (see `HEADER_COLUMNS`), so the
  // four header columns are sized once, across all the cards, rather than once per card. That is
  // what lines the scorelines up down the page: a card's own header cannot know how wide its
  // neighbors' league names are, and when each header sized itself the score landed wherever that
  // card's meta happened to leave it.
  return (
    <div className={`grid gap-x-3 gap-y-3 ${HEADER_COLUMNS}`}>
      {groups.map(group => (
        <SeriesCard key={group.key} group={group} teamIndex={teamIndex} />
      ))}
    </div>
  );
}

/**
 * The series header's columns: the player's team, the score, the opponent, the league and date.
 *
 * The player's team and the meta size to content (the widest of each in the list), the score to
 * its widest, and the opponent takes whatever is left and truncates. Content-sized rather than an
 * equal split because the player's team is the same name on nearly every card, so an equal split
 * left white space beside a short own-team name while the opponent beside it was cut to a few
 * letters. The two content columns are capped so one long league name on a phone cannot take the
 * whole row: past the cap they ellipsize, and the opponent still gets something.
 */
const HEADER_COLUMNS = "grid-cols-[fit-content(40%)_auto_minmax(0,1fr)_fit-content(45%)]";

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

  // The card, its header and the header's content row are each a subgrid of the list, so the
  // header's four cells sit in the list's shared columns. Every wrapper on the way down spans all
  // four; the games scroller does too, since it is not part of the header at all.
  return (
    <section className="col-span-4 grid grid-cols-subgrid overflow-hidden rounded-lg border border-border bg-bg2">
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
      <div
        className={`relative col-span-4 grid grid-cols-subgrid px-3 py-2.5 transition-colors ${
          seriesId !== null ? "hover:bg-bg-input" : ""
        }`}
      >
        {seriesId !== null && (
          <Link
            to={`/match/${seriesId}`}
            aria-label="Open this series"
            className="absolute inset-0 z-0"
          />
        )}

        {/*
          One row, never two. The header used to wrap, and what wrapped first was the league and
          date at the far right, which then sat alone under the scoreline looking like a stray
          caption. Now the row is four cells in the list's shared columns (`HEADER_COLUMNS`): the
          opponent is the only column that flexes, so it is the one name that truncates, and it does
          so only once the other three have what they need. A team name cut short still says who
          played; a header spilling onto a second line said nothing extra and cost the rows below
          their frame.

          The team cells are `overflow-hidden` for the grid's sake, not to clip anything visible: a
          grid item with visible overflow cannot be sized narrower than its longest word, and one
          long word in a team name would then hold its column open on a phone. Hidden overflow lets
          the column shrink and the chip's own `truncate` do the ellipsizing. The cell carries the
          chip's 4px hover bleed as its own negative margin and padding so the clip sits outside it.
        */}
        <div className="pointer-events-none relative z-10 col-span-4 grid grid-cols-subgrid items-center">
          {match ? (
            <>
              <span className="-mx-1 flex min-w-0 overflow-hidden px-1">
                <TeamChip
                  conf={match.conf}
                  code={match.team}
                  team={teamIndex(match.conf, match.team)}
                  className="pointer-events-auto w-fit max-w-full rounded px-1 hover:bg-brand/20"
                />
              </span>

              <span
                className={`justify-self-center rounded px-2 py-0.5 font-display text-lg leading-none ${
                  won ? "bg-ccs-green/20 text-ccs-green" : "bg-ccs-red/20 text-ccs-red"
                }`}
              >
                {match.gameWins}–{match.gameLosses}
              </span>

              <span className="-mx-1 flex min-w-0 overflow-hidden px-1">
                <TeamLink
                  conf={match.conf}
                  code={match.opponentCode}
                  className="pointer-events-auto flex w-fit min-w-0 max-w-full items-center gap-2 rounded px-1 no-underline hover:bg-brand/20"
                >
                  <TeamLogo team={match.opponent} code={match.opponentCode ?? "?"} size={22} />
                  <span className="truncate font-heading text-text-secondary hover:text-brand">
                    {match.opponent?.name ?? match.opponentCode ?? "Unknown"}
                  </span>
                </TeamLink>
              </span>
            </>
          ) : (
            <span className="col-span-3 min-w-0 truncate font-heading text-text-secondary">Other games</span>
          )}

          {/* Two lines: the league on top, then where in the season and when on one line beneath —
              "Playoffs · Semifinals · Mar 14". Three stacked lines made the header taller than the
              result it framed.

              Its column is content-sized and capped (`HEADER_COLUMNS`), so up to the cap it is the
              opponent that gives way, and past it each line ellipsizes rather than breaking, because
              a date wrapped onto a third line is the mess this header exists to avoid. */}
          <span className="min-w-0 overflow-hidden text-right text-[11px] text-text-dim">
            {/* The full league name, not `short`. `shortname` is deliberately shared between the
                divisions running concurrently, so it cannot tell two of them apart — and this card is
                as wide as the series header, which has room for the real thing. */}
            <span className="block truncate">{confLabel(conf).name}</span>
            <span className="block truncate">
              {placement && <span className="text-text-secondary">{placement} · </span>}
              {fmtDay(startTime) || "—"}
            </span>
          </span>
        </div>
      </div>

      {/* The games scroll sideways; the header above them does not. `GAME_GRID` has a minimum
          width, so on a phone this is a scroller rather than nine columns crushed to nothing — and
          the caption row has to live inside it or it would drift out of line with the rows the
          moment either one moved. */}
      <div className="col-span-4 overflow-x-auto">
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
