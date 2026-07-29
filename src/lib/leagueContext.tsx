/**
 * Which season the site is currently showing.
 *
 * There is one set of views for every season — past and present — driven by a single
 * selection. The selection lives in the `?conf=` query param so any view is linkable.
 *
 * `selectedConfs` is an array, not a string. The league expects to run several divisions
 * concurrently, so "the current league" is a *set* of confs; showing a picker for them is a
 * later presentation change rather than a data-layer one.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, resolveActiveConfs, sortByRecency, type Tournament } from "./api";
import { queries } from "./queries";

/** Selection sentinel meaning "whatever is running now", however many confs that is. */
export const CURRENT = "current";

/** Query param the selection lives in. Exported so links can carry it between sections. */
export const CONF_PARAM = "conf";

interface LeagueContextValue {
  /** All tournaments, newest first. */
  tournaments: Tournament[];
  /** Confs that make up the league running now. */
  activeConfs: string[];
  /** Either `CURRENT` or a specific conf id. */
  selection: string;
  setSelection: (value: string) => void;
  /** The confs the selection resolves to. */
  selectedConfs: string[];
  /** True when viewing the league that is running now. */
  isCurrent: boolean;
  loading: boolean;
  error: string | null;
}

const LeagueCtx = createContext<LeagueContextValue | null>(null);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // The same query any other consumer of `/tournaments` uses, so the list is fetched once for the
  // session. Ordering and "which season is now" are derived here rather than served — see
  // `lib/api/league.ts`.
  const { data, isPending, error: failure } = useQuery(queries.tournaments());
  const { tournaments, activeConfs } = useMemo(() => {
    const list = sortByRecency(data ?? []);
    return { tournaments: list, activeConfs: resolveActiveConfs(list) };
  }, [data]);

  const loading = isPending;
  const error = failure ? errorMessage(failure) : null;

  const requested = searchParams.get(CONF_PARAM);
  const known = useMemo(() => new Set(tournaments.map(t => t.conf)), [tournaments]);

  // Ignore an unknown ?conf= rather than rendering an error page for a stale link.
  const selection = requested && known.has(requested) ? requested : CURRENT;

  const setSelection = useCallback(
    (value: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (value === CURRENT) next.delete(CONF_PARAM);
          else next.set(CONF_PARAM, value);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const selectedConfs = useMemo(
    () => (selection === CURRENT ? activeConfs : [selection]),
    [selection, activeConfs],
  );

  const value = useMemo<LeagueContextValue>(
    () => ({
      tournaments,
      activeConfs,
      selection,
      setSelection,
      selectedConfs,
      isCurrent: selection === CURRENT,
      loading,
      error,
    }),
    [tournaments, activeConfs, selection, setSelection, selectedConfs, loading, error],
  );

  return <LeagueCtx.Provider value={value}>{children}</LeagueCtx.Provider>;
}

export function useLeague(): LeagueContextValue {
  const ctx = useContext(LeagueCtx);
  if (!ctx) throw new Error("useLeague must be used inside a LeagueProvider");
  return ctx;
}

/**
 * Builds a link to another part of the site that keeps the season being viewed.
 *
 * The selection lives in the query string, so a plain `<Link to="/teams">` navigates with an empty
 * query and drops it — every tab click would snap the site back to the current season. Only the
 * season travels; any other param belongs to the page that set it.
 *
 * Carries the *resolved* selection rather than the raw param, so a stale `?conf=` that no longer
 * names a tournament is dropped instead of being propagated.
 */
export function useSeasonLink(): (pathname: string) => { pathname: string; search: string } {
  const { selection } = useLeague();
  return useCallback(
    (pathname: string) => ({
      pathname,
      search: selection === CURRENT ? "" : `?${CONF_PARAM}=${encodeURIComponent(selection)}`,
    }),
    [selection],
  );
}
