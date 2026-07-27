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

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { errorMessage, getLeagueContext, isAbort, type Tournament } from "./api";

/** Selection sentinel meaning "whatever is running now", however many confs that is. */
export const CURRENT = "current";

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
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeConfs, setActiveConfs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    getLeagueContext({ signal: ac.signal })
      .then(ctx => {
        setTournaments(ctx.tournaments);
        setActiveConfs(ctx.activeConfs);
      })
      .catch(e => { if (!isAbort(e)) setError(errorMessage(e)); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, []);

  const requested = searchParams.get("conf");
  const known = useMemo(() => new Set(tournaments.map(t => t.conf)), [tournaments]);

  // Ignore an unknown ?conf= rather than rendering an error page for a stale link.
  const selection = requested && known.has(requested) ? requested : CURRENT;

  const setSelection = useCallback(
    (value: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (value === CURRENT) next.delete("conf");
          else next.set("conf", value);
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
