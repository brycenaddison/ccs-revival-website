/**
 * What the signed-in profile is allowed to administer.
 *
 * Two sources have to agree. `/auth/me` enumerates the confs granted to a profile explicitly, but
 * the site admin role grants *every* league without listing any of them — so answering "which
 * leagues can I administer" needs the tournament list as well as the identity.
 *
 * That's why this is a hook and not part of `AuthProvider`: the tournament list lives in
 * `LeagueProvider`, which is mounted *inside* `AuthProvider` (see `main.tsx`), so the auth context
 * cannot reach it. Composing the two here keeps the provider order intact and puts the derivation
 * in the one place that needs it.
 */

import { useCallback, useMemo } from "react";
import { SITE_ADMIN_ROLE, sortByRecency, type AdminLeague, type Tournament } from "./api";
import { useAuth } from "./authContext";
import { useLeague } from "./leagueContext";

export interface AdminAccess {
  /** Leagues this profile can administer, newest first. Empty when it administers none. */
  leagues: AdminLeague[];
  isSiteAdmin: boolean;
  /** True if this profile can administer `conf`. */
  canAdminLeague: (conf: string) => boolean;
  /**
   * True once both `/auth/me` and `/tournaments` have settled.
   *
   * Gates must wait on this rather than reading an empty `leagues` as a refusal: a site admin's
   * access is derived from the tournament list, so before it lands they look identical to someone
   * with no access at all.
   */
  ready: boolean;
}

/**
 * Always the full `name` ("CCS 2026 Summer"), never `shortname`.
 *
 * `shortname` ("Summer '26") is deliberately shared between the divisions running concurrently, so
 * it cannot tell two administrable leagues apart — which is the one thing this label has to do.
 */
function labelFor(t: Tournament): string {
  return t.name;
}

export function useAdminAccess(): AdminAccess {
  const { hasRole, leagues: granted, isAuthenticated, loading: authLoading } = useAuth();
  const { tournaments, loading: leagueLoading } = useLeague();

  const isSiteAdmin = isAuthenticated && hasRole(SITE_ADMIN_ROLE);

  const leagues = useMemo<AdminLeague[]>(() => {
    if (!isAuthenticated) return [];

    // `tournaments` is already sorted newest-first by `LeagueProvider`, so a site admin's list
    // needs no ordering of its own.
    if (isSiteAdmin) return tournaments.map(t => ({ conf: t.conf, name: labelFor(t) }));

    // A granted conf the site knows about gets the site's own label and takes part in recency
    // ordering. One it doesn't know keeps the name `/auth/me` supplied and sorts last — an
    // unrecognised conf has no season to rank by, and dropping it would hide real access.
    const byConf = new Map(tournaments.map(t => [t.conf, t]));
    const known: Tournament[] = [];
    const unknown: AdminLeague[] = [];
    for (const league of granted) {
      const match = byConf.get(league.conf);
      if (match) known.push(match);
      else unknown.push(league);
    }

    return [
      ...sortByRecency(known).map(t => ({ conf: t.conf, name: labelFor(t) })),
      ...unknown,
    ];
  }, [isAuthenticated, isSiteAdmin, tournaments, granted]);

  const canAdminLeague = useCallback(
    (conf: string) => isSiteAdmin || leagues.some(l => l.conf === conf),
    [isSiteAdmin, leagues],
  );

  return useMemo<AdminAccess>(
    () => ({
      leagues,
      isSiteAdmin,
      canAdminLeague,
      ready: !authLoading && !leagueLoading,
    }),
    [leagues, isSiteAdmin, canAdminLeague, authLoading, leagueLoading],
  );
}
