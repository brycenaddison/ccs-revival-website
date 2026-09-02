/**
 * Legacy game linking — attaching a played game to a scheduled match after the fact.
 *
 * Every season played before the schedule existed has games with no scheduled match, and they list here
 * forever. That is why `unscheduled_games` is the one audit view allowed to be non-empty: **this is a
 * worklist, not an alarm**, and an empty one is not the goal for an old split.
 *
 * The better tool is almost always the other one. Registering the codes (see `MatchCodes`) ingests and
 * numbers games properly, and shows you the game before it commits; linking only labels a row that is
 * already stored. So this exists for the case where the codes are gone.
 *
 * The one thing to be clear about in the UI: **linking never rewrites a game's season day.** That number
 * is what `series` grouped on and what the standings were computed from, so changing it retroactively
 * would move a result between series. A candidate whose day is nowhere near the match's is normal — the
 * day ranks the answers rather than filtering them, because legacy numbering predates the phases and is
 * exactly the thing that may not line up.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Unlink } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ACTION_SM, ACTION_SM_PRIMARY, ErrorLine, Pill } from "../../admin/adminUi";
import { queries, queryRoots } from "../../../lib/queries";
import { errorMessage, linkGame, type ScheduleDay, type UnscheduledGame } from "../../../lib/api";

interface Props {
  conf: string;
  /** The schedule, for naming the match a game would be linked to. */
  days: readonly ScheduleDay[];
  onSaved: (message: string) => void;
}

export function LinkingPanel({ conf, days, onSaved }: Props) {
  const games = useQuery(queries.unscheduledGames(conf));
  const [target, setTarget] = useState<number | null>(null);

  const candidates = useQuery(queries.gameCandidates(target));

  const matches = days.flatMap(day =>
    day.matches
      .filter(m => m.kind === "match")
      .map(m => ({
        id: m.id,
        seasonDay: day.seasonDay,
        label: `Day ${day.seasonDay} · ${m.teamA?.code ?? "TBD"} vs ${m.teamB?.code ?? "TBD"}`,
        complete: m.teamA !== null && m.teamB !== null,
      })),
  );

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="font-heading text-xs text-text-secondary mb-1">
          Unlinked games
        </h3>
        <p className="text-text-secondary text-sm">
          Games recorded with no scheduled match. Old seasons list here permanently — this is a worklist,
          not something that has to reach zero.
        </p>
      </div>

      {games.isPending ? (
        <p className="text-text-dim text-sm">Loading…</p>
      ) : games.isError ? (
        <ErrorLine message={`Couldn't load the worklist: ${errorMessage(games.error)}`} />
      ) : games.data.length === 0 ? (
        <p className="text-text-dim text-sm">
          Every recorded game in this league is linked to a scheduled match.
        </p>
      ) : (
        <>
          <p className="text-text-dim text-xs">
            {games.data.length} unlinked {games.data.length === 1 ? "game" : "games"}.
          </p>
          <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {games.data.map(game => (
              <GameRow key={game.matchId} game={game} />
            ))}
          </ul>
        </>
      )}

      <div className="border-t border-border pt-4">
        <label className={LABEL_CLASS} htmlFor="linking-target">
          Find games for a scheduled match
        </label>
        <select
          id="linking-target"
          value={target ?? ""}
          onChange={e => setTarget(e.target.value === "" ? null : Number(e.target.value))}
          className={CONTROL_CLASS}
        >
          <option value="">Choose a match…</option>
          {matches.map(m => (
            <option key={m.id} value={m.id} disabled={!m.complete}>
              {m.label}
              {m.complete ? "" : " — needs both teams first"}
            </option>
          ))}
        </select>
        <p className="text-text-dim text-xs mt-1.5">
          Candidates are matched on the <span className="text-text">team pair</span>, then ordered by how
          close their recorded day is. A distant day is normal for a legacy season.
        </p>
      </div>

      {target !== null && (
        <CandidateList
          matchId={target}
          loading={candidates.isPending}
          error={candidates.isError ? errorMessage(candidates.error) : null}
          candidates={candidates.data?.candidates ?? []}
          seasonDay={candidates.data?.seasonDay ?? 0}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}

function GameRow({ game }: { game: UnscheduledGame }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2 bg-bg3 border border-border rounded-md px-3 py-2">
      <Pill muted>Day {game.seasonDay}</Pill>
      <span className="text-sm text-text-bright">
        {game.winner ?? "?"} <span className="text-text-dim">beat</span> {game.loser ?? "?"}
      </span>
      <span className="text-text-dim text-xs">game {game.game}</span>
      <code className="ml-auto font-mono text-[10px] text-text-dim break-all">{game.matchId}</code>
    </li>
  );
}

function CandidateList({
  matchId,
  loading,
  error,
  candidates,
  seasonDay,
  onSaved,
}: {
  matchId: number;
  loading: boolean;
  error: string | null;
  candidates: readonly UnscheduledGame[];
  seasonDay: number;
  onSaved: (message: string) => void;
}) {
  const qc = useQueryClient();

  const link = useMutation({
    mutationFn: (input: { gameId: string; linked: boolean }) =>
      linkGame(matchId, input.gameId, input.linked),
    onSuccess: async (_result, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
        qc.invalidateQueries({ queryKey: queryRoots.stats }),
      ]);
      onSaved(input.linked ? "Game linked." : "Link cleared.");
    },
  });

  if (error) return <ErrorLine message={`Couldn't load candidates: ${error}`} />;
  if (loading) return <p className="text-text-dim text-sm">Looking for games…</p>;

  if (candidates.length === 0) {
    return (
      <p className="text-text-dim text-sm">
        No unlinked game in this league was played between those two teams.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {candidates.map(game => (
        <li
          key={game.matchId}
          className="flex flex-wrap items-center gap-2 bg-bg3 border border-border rounded-md px-3 py-2"
        >
          <Pill muted>Day {game.seasonDay}</Pill>
          {game.seasonDay !== seasonDay && (
            <span className="text-text-dim text-xs">
              ({game.seasonDay > seasonDay ? "+" : ""}
              {game.seasonDay - seasonDay} from this match)
            </span>
          )}
          <span className="text-sm text-text-bright">
            {game.winner ?? "?"} <span className="text-text-dim">beat</span> {game.loser ?? "?"}
          </span>
          <span className="text-text-dim text-xs">game {game.game}</span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => link.mutate({ gameId: game.matchId, linked: true })}
              disabled={link.isPending}
              className={ACTION_SM_PRIMARY}
            >
              <Link2 size={13} aria-hidden="true" />
              Link
            </button>
            <button
              type="button"
              onClick={() => link.mutate({ gameId: game.matchId, linked: false })}
              disabled={link.isPending}
              title="Clears any existing link on this game"
              className={ACTION_SM}
            >
              <Unlink size={13} aria-hidden="true" />
            </button>
          </div>
        </li>
      ))}

      <ErrorLine message={link.isError ? errorMessage(link.error) : null} />
      <p className="text-text-dim text-xs">
        Linking records which scheduled match a game belongs to. It never changes the day the game was
        recorded on — that number is what the standings were computed from.
      </p>
    </ul>
  );
}
