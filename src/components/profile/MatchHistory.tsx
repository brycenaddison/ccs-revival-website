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

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ProfileGame, ProfileMatch } from "../../lib/api";
import { fmtDay } from "../../lib/utils";
import { ACTION_QUIET } from "../admin/adminUi";
import { ProfileGameRow } from "./ProfileGameRow";
import { TeamChip, TeamLogo, useConfLabel, type TeamIndex } from "./profileUi";

/** Series shown before the reader asks for more. Roughly one season of play. */
const PAGE = 10;

interface Group {
  key: string;
  match: ProfileMatch | null;
  games: ProfileGame[];
}

interface Props {
  matches: readonly ProfileMatch[];
  games: readonly ProfileGame[];
  teamIndex: TeamIndex;
  puuids: ReadonlySet<string>;
}

export function MatchHistory({ matches, games, teamIndex, puuids }: Props) {
  const [shown, setShown] = useState(PAGE);
  const [openGame, setOpenGame] = useState<string | null>(null);

  const groups = useMemo(() => buildGroups(matches, games), [matches, games]);

  if (groups.length === 0) {
    return <p className="rounded-lg border border-border bg-bg2 px-4 py-6 text-sm text-text-dim">No games played.</p>;
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {groups.slice(0, shown).map(group => (
          <SeriesCard
            key={group.key}
            group={group}
            teamIndex={teamIndex}
            puuids={puuids}
            openGame={openGame}
            onToggleGame={id => setOpenGame(current => (current === id ? null : id))}
          />
        ))}
      </div>

      {shown < groups.length && (
        <button type="button" onClick={() => setShown(n => n + PAGE)} className={`${ACTION_QUIET} mt-3`}>
          Show more ({groups.length - shown} left)
        </button>
      )}
    </>
  );
}

function SeriesCard({
  group,
  teamIndex,
  puuids,
  openGame,
  onToggleGame,
}: {
  group: Group;
  teamIndex: TeamIndex;
  puuids: ReadonlySet<string>;
  openGame: string | null;
  onToggleGame: (matchId: string) => void;
}) {
  const confLabel = useConfLabel();
  const { match, games } = group;

  // An ungrouped game still needs a conf and a date to head its card; take them from the game.
  const conf = match?.conf ?? games[0]?.conf ?? "";
  const startTime = match?.startTime ?? games[0]?.startTime ?? null;
  const won = match ? match.gameWins > match.gameLosses : games.some(g => g.win);
  const seriesId = match?.scheduleMatchId ?? null;

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {match ? (
        <>
          <TeamChip
            conf={match.conf}
            code={match.team}
            team={teamIndex(match.conf, match.team)}
            stopPropagation
            className="flex-1 basis-[140px]"
          />
          <span
            className={`shrink-0 rounded px-2 py-0.5 font-display text-lg leading-none tracking-wider ${
              won ? "bg-ccs-green/20 text-ccs-green" : "bg-ccs-red/20 text-ccs-red"
            }`}
          >
            {match.gameWins}–{match.gameLosses}
          </span>
          <span className="flex flex-1 basis-[140px] items-center gap-2">
            <TeamLogo team={match.opponent} code={match.opponentCode ?? "?"} size={22} />
            <span className="truncate font-heading text-text-secondary">
              {match.opponent?.name ?? match.opponentCode ?? "Unknown"}
            </span>
          </span>
        </>
      ) : (
        <span className="flex-1 font-heading text-text-secondary">Other games</span>
      )}

      <span className="shrink-0 text-right text-[11px] text-text-dim">
        <span className="block">{confLabel(conf).short}</span>
        <span className="block">{fmtDay(startTime) || "—"}</span>
      </span>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg2">
      {/* Only a series with a scheduled match has a page of its own; a legacy grouping doesn't, and
          a link to nowhere is worse than no link — its games are still individually clickable. */}
      {seriesId !== null ? (
        <Link to={`/match/${seriesId}`} className="block px-3 py-2.5 no-underline hover:bg-bg3">
          {header}
        </Link>
      ) : (
        <div className="px-3 py-2.5">{header}</div>
      )}

      <ul className="flex flex-col">
        {games.map(game => (
          <ProfileGameRow
            key={game.matchId}
            game={game}
            puuids={puuids}
            open={openGame === game.matchId}
            onToggle={() => onToggleGame(game.matchId)}
          />
        ))}
      </ul>
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
