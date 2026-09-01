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
import {
  errorMessage,
  resolveActive,
  sortByRecency,
  type ActiveSource,
  type Tournament,
} from "./api";
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
  /**
   * Which rule produced `activeConfs`. `flagged` is the only one the server shares, so it is the only
   * one under which a read may leave the conference to the server's default — see `useFeedQuery`.
   */
  activeSource: ActiveSource | null;
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
  const { tournaments, activeConfs, activeSource } = useMemo(() => {
    const list = sortByRecency(data ?? []);
    const active = resolveActive(list);
    return { tournaments: list, activeConfs: active.confs, activeSource: active.source };
  }, [data]);

  const loading = isPending;
  const error = failure ? errorMessage(failure) : null;

  const requested = searchParams.get(CONF_PARAM);
  const known = useMemo(() => new Set(tournaments.map(t => t.conf)), [tournaments]);

  /**
   * Ignore an unknown `?conf=` rather than rendering an error page for a stale link.
   *
   * **Only a listed season can be selected here**, and that is deliberate. An unlisted conf was
   * briefly allowed through so a link could open an unpublished league's Info page, which meant this
   * param — the one that steers every view on the site — could name a season with no teams, no
   * schedule and no name to put in the selector. The applicant form reads the league's rulebook link
   * out of the Info document directly instead, so nothing needs that any more; see
   * `components/apply/ApplicationForm.tsx`.
   *
   * A link naming the *only* conf that is running means the same thing as `CURRENT`, so it
   * canonicalizes to it: the picker offers that season under `CURRENT` alone, and leaving the raw
   * value would point the control at an option that isn't there. With several divisions running,
   * `?conf=` names one of them and is kept — that is a narrower selection than "the whole current
   * season", not a synonym for it.
   */
  const resolved = requested && known.has(requested) ? requested : CURRENT;
  const selection =
    activeConfs.length === 1 && activeConfs[0] === resolved ? CURRENT : resolved;

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
      activeSource,
      selection,
      setSelection,
      selectedConfs,
      // A conf that is running is current whether it was reached through `CURRENT` or named
      // directly. Keying this on the sentinel alone labeled a live division "PAST SEASON" the
      // moment someone selected it by name.
      isCurrent: selection === CURRENT || activeConfs.includes(selection),
      loading,
      error,
    }),
    [tournaments, activeConfs, activeSource, selection, setSelection, selectedConfs, loading, error],
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
