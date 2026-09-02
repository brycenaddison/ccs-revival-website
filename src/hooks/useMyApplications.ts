import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/authContext";
import { queries } from "../lib/queries";

/**
 * Whether the signed-in member is running a team application that is still alive, in a season that
 * is still taking them.
 *
 * For the account menu's "My applications" row. A started application was hard to find: the only
 * way back to it was the Apply Now button, which reads as a way to start one rather than a way to
 * return to one. The row is offered exactly when there is something to return to.
 *
 * Two reads, because there is no cross-conference "my applications" route: the open-season list
 * names the conferences intake is open for, and `GET /:conf/applications` is read once per open
 * conference. Both are the same queries the applicant page holds, so on that page this costs
 * nothing. Only applications the member *submitted* count, since those are the ones with anything
 * to do; a team they were invited to is the inbox's business.
 *
 * `false` while loading and while signed out. A row that appeared a moment after the menu opened
 * would read as a glitch, and there is nothing to offer an anonymous visitor.
 */
export function useHasLiveApplication(): boolean {
  const { isAuthenticated, profile } = useAuth();
  const myProfileId = profile?.id ?? null;

  const { data: seasons } = useQuery({
    ...queries.openApplicationSeasons(),
    enabled: isAuthenticated,
  });

  // Gated on the session as well as on the season list: the list is cached across a logout, and a
  // read fired for a signed-out visitor is a `401` for nothing.
  const confs = isAuthenticated && seasons ? seasons.map(s => s.conf) : [];

  return useQueries({
    queries: confs.map(conf => queries.myApplications(conf)),
    combine: results =>
      myProfileId !== null &&
      results.some(r => (r.data ?? []).some(a => a.submittedByProfileId === myProfileId)),
  });
}
