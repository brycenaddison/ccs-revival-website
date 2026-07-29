/**
 * Ranked standings for the selected season(s).
 *
 * Separate from `useLeagueData` on purpose. A team card only needs a record, and every
 * `/teams/:conf` row already carries one — so the Teams view costs no extra request. A standings
 * *table* needs more: `rank`, `place` and `streak` exist only on `/standings/:conf`, and only the
 * views that show them pay for the call.
 *
 * The order returned by the API is preserved end to end. It resolves series record, then game win
 * percentage, then head-to-head — and head-to-head cannot be reconstructed from anything else the
 * site fetches, so re-sorting here would replace a correct ranking with a worse one.
 *
 * Pass an empty `confs` to load nothing. That is how a caller says "not showing this right now";
 * anything already cached stays cached, so coming back is instant.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { errorMessage, type Tournament } from "../lib/api";
import { groupLabels, toStandings } from "../lib/leagueAdapters";
import { queries, resultsKey } from "../lib/queries";
import type { Standing, Team } from "../types/league";

interface Options {
  /** Confs to load, or `[]` to load nothing. */
  confs: readonly string[];
  /** Teams already loaded, so rows reuse those identities instead of synthesising new ones. */
  teams: readonly Team[];
  /** Tournament metadata, for the group label when several confs are active at once. */
  tournaments: readonly Tournament[];
}

export interface StandingsState {
  standings: Standing[];
  loading: boolean;
  error: string | null;
}

export function useStandings({ confs, teams, tournaments }: Options): StandingsState {
  // Depend on the joined value so a new array with the same contents is a no-op.
  const confKey = confs.join(",");
  const list = useMemo(() => (confKey === "" ? [] : confKey.split(",")), [confKey]);

  const results = useQueries({ queries: list.map(conf => queries.standings(conf)) });
  const key = resultsKey(results);

  const standings = useMemo(() => {
    const teamsById = new Map(teams.map(t => [t.id, t]));
    // One conf needs no group label — a division tab with a single entry is noise.
    const labels = list.length > 1 ? groupLabels(tournaments, list) : null;
    // Flattened conf by conf, so each conf's ranking stays contiguous and in order.
    return list.flatMap((conf, i) => {
      const rows = results[i]?.data ?? [];
      // Pin the conf asked for: every identity is keyed on (conf, code), and the teams these rows
      // join against were keyed the same way.
      const pinned = rows.map(r => (r.conf === conf ? r : { ...r, conf }));
      return toStandings(pinned, teamsById, labels?.get(conf));
    });
    // `results` is a new array each render; `key` changes only when one of them actually does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, list, teams, tournaments]);

  const loading = results.some(r => r.isLoading);
  const failed = results.find(r => r.error);
  const error = failed ? errorMessage(failed.error) : null;

  return useMemo(() => ({ standings, loading, error }), [standings, loading, error]);
}
