/**
 * Player statistics for the selected season(s), as leaderboard rows.
 *
 * Split out of `useLeagueData` for the same reason as `useSeason`: only one view needs it. The
 * roster no longer does — `/teams/:conf` names every player itself — so the Teams view would
 * otherwise pay for a stats request it never reads.
 *
 * Pass an empty `confs` to load nothing. The Stats tab's own tables query the same conf under the
 * same key, so whichever view is opened second reads the first one's copy.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { errorMessage } from "../lib/api";
import { toPlayers } from "../lib/leagueAdapters";
import { queries, resultsKey } from "../lib/queries";
import type { Player, Team } from "../types/league";

interface Options {
  /** Confs to load, or `[]` to load nothing. */
  confs: readonly string[];
  /** Teams already loaded, so a row can link to its team. */
  teams: readonly Team[];
}

export interface PlayersState {
  players: Player[];
  loading: boolean;
  error: string | null;
}

export function usePlayers({ confs, teams }: Options): PlayersState {
  // Depend on the joined value so a new array with the same contents is a no-op.
  const confKey = confs.join(",");
  const list = useMemo(() => (confKey === "" ? [] : confKey.split(",")), [confKey]);

  const results = useQueries({ queries: list.map(conf => queries.playerStats(conf)) });
  const key = resultsKey(results);

  const players = useMemo(() => {
    const teamsById = new Map(teams.map(t => [t.id, t]));
    return toPlayers(results.flatMap(r => r.data ?? []), teamsById);
    // `results` is a new array each render; `key` changes only when one of them actually does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, teams]);

  const loading = results.some(r => r.isLoading);
  const failed = results.find(r => r.error);
  const error = failed ? errorMessage(failed.error) : null;

  return useMemo(() => ({ players, loading, error }), [players, loading, error]);
}
