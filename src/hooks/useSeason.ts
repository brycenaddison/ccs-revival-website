/**
 * One conference's season document — the Standings tab's whole data source.
 *
 * Deliberately **one conf**, unlike `useLeagueData`, which fans out across `selectedConfs` and
 * merges the results — as the standings hook this replaces used to. A season is per-conference: two
 * divisions can be on different phases, with different groups and different brackets, and a merged
 * table would be describing a competition nobody is playing. The Standings tab picks a conf and
 * renders that one.
 *
 * Pass `null` to load nothing. That is how a page says "not showing this right now"; anything
 * already cached stays cached, so coming back is instant.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, type SeasonPayload } from "../lib/api";
import { queries } from "../lib/queries";

export interface SeasonState {
  /** Null while loading, and also for a conf whose season the API has nothing for. */
  season: SeasonPayload | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSeason(conf: string | null): SeasonState {
  // The key still has to be a string when the query is disabled, so a placeholder stands in. Nothing
  // fetches it: `enabled` is what decides, and the entry is never written.
  const q = useQuery({ ...queries.seasonView(conf ?? ""), enabled: conf !== null && conf !== "" });

  // Destructured so the memo depends on the four values rather than on `q`, which is a new object
  // every render — memoizing on that would rebuild the result each time and push a new prop into
  // every consumer. `refetch` is stable across renders in react-query v5.
  const { data, isLoading, error, refetch } = q;

  return useMemo(
    () => ({
      season: data ?? null,
      // `isLoading`, not `isPending`: a disabled query is pending forever, and a tab that isn't
      // asking for a season is not waiting for one.
      loading: isLoading,
      error: error ? errorMessage(error) : null,
      refetch: () => void refetch(),
    }),
    [data, isLoading, error, refetch],
  );
}
