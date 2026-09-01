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
 *
 * **A site admin's list comes from `GET /admin/leagues`, not from `LeagueProvider`.** The public
 * `/tournaments` is a listed-only projection now, so a hidden upcoming conference is absent from it
 * — and a site admin who created one would find it missing from their own league picker, which is
 * the one surface that has to be able to manage it. A granted (non-site-admin) league admin needs
 * no equivalent: `/auth/me` enumerates their confs by name whether or not the conf is listed.
 *
 * That read is fetched only for a site admin (`enabled`), and the public list stands in while it
 * resolves so the picker is never empty for a moment.
 */

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LEAGUE_SCOPE_NAMES,
  SITE_ADMIN_ROLE,
  sortByRecency,
  type AdminLeague,
  type Tournament,
} from "./api";
import { useAuth } from "./authContext";
import { useLeague } from "./leagueContext";
import { queries } from "./queries";

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

  // Hidden drafts live only here. Not fetched at all for anyone else — the route is site-admin only
  // and would answer 401/403.
  const { data: allLeagues } = useQuery({ ...queries.adminLeagues(), enabled: isSiteAdmin });

  const leagues = useMemo<AdminLeague[]>(() => {
    if (!isAuthenticated) return [];

    if (isSiteAdmin) {
      // Both lists arrive newest-first already — `adminLeagues` sorts, and `LeagueProvider` sorts
      // the public list it stands in for — so this needs no ordering of its own.
      //
      // Every scope, spelled out rather than left empty. A site admin genuinely holds all four in
      // every conf, and `hasScope` reads `[]` as "cannot tell" — true enough to pass a check, but it
      // would make a site admin indistinguishable from a grant on a server too old to report scopes.
      return (allLeagues ?? tournaments).map(t => ({
        conf: t.conf,
        name: labelFor(t),
        scopes: [...LEAGUE_SCOPE_NAMES],
      }));
    }

    // A granted conf the site knows about gets the site's own label and takes part in recency
    // ordering. One it doesn't know keeps the name `/auth/me` supplied and sorts last — an
    // unrecognized conf has no season to rank by, and dropping it would hide real access.
    const byConf = new Map(tournaments.map(t => [t.conf, t]));
    const known: Tournament[] = [];
    const unknown: AdminLeague[] = [];
    for (const league of granted) {
      const match = byConf.get(league.conf);
      if (match) known.push(match);
      else unknown.push(league);
    }

    // The site's label, the grant's scopes. Taking only `{conf, name}` from the recognized rows —
    // which is what this did — dropped `scopes` on exactly the confs a league admin works in, and
    // `hasScope` reads a missing list off a row it was handed rather than off the grant.
    const scopesByConf = new Map(granted.map(league => [league.conf, league.scopes]));

    return [
      ...sortByRecency(known).map(t => ({
        conf: t.conf,
        name: labelFor(t),
        scopes: scopesByConf.get(t.conf) ?? [],
      })),
      ...unknown,
    ];
  }, [isAuthenticated, isSiteAdmin, allLeagues, tournaments, granted]);

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
