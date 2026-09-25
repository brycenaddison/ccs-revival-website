import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../lib/authContext";
import { queries, queryRoots } from "../../../lib/queries";
import { resolveRosterPlayer, resolveRosterDiscord, type PlayerSummary } from "../../../lib/api";
import type { RiotPlayerSource, DiscordPlayerSource } from "../../players/pickerTypes";

/** Authorization and roster side effects belong here, outside the reusable picker. */
export function useRosterPlayerSources(conf: string, canEdit: boolean) {
  const { profile, isAuthenticated, loading } = useAuth();
  const qc = useQueryClient();
  const viewerId = profile?.id ?? null;
  const enabled = canEdit && isAuthenticated && !loading && viewerId !== null && conf !== "";
  const contextKey = `${conf}:${viewerId}:${enabled}`;
  const current = useRef(contextKey);
  const active = useRef(true);
  current.current = contextKey;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      void qc.cancelQueries({ queryKey: queryRoots.rosterPlayers });
      qc.removeQueries({ queryKey: queryRoots.rosterPlayers });
    };
  }, [qc, contextKey]);

  async function accept(request: () => Promise<PlayerSummary>) {
    if (!active.current || !enabled || current.current !== contextKey) throw new Error("Player selection is no longer available. Reopen the picker.");
    const result = await request();
    // The request can finish after navigation or a session change; never apply it to another form.
    if (!active.current || current.current !== contextKey) throw new Error("Player selection context changed. Reopen the picker.");
    void qc.invalidateQueries({ queryKey: queryRoots.profiles });
    void qc.invalidateQueries({ queryKey: queryRoots.rosterPlayers, refetchType: "none" });
    void qc.invalidateQueries({ queryKey: queryRoots.teams });
    return result;
  }

  const riot: RiotPlayerSource = {
    contextKey, enabled,
    searchOptions: q => queries.profileSearch(q, null, "riot"),
    previewOptions: input => queries.rosterRiotPreview(conf, viewerId, input),
    accept: input => accept(() => resolveRosterPlayer(conf, input)),
  };
  const discord: DiscordPlayerSource = {
    contextKey, enabled,
    searchOptions: q => queries.rosterDiscordSearch(conf, viewerId, q),
    accept: input => accept(() => resolveRosterDiscord(conf, input)),
  };
  return { riot, discord };
}
