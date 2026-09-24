import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/authContext";
import { queries } from "../lib/queries";

/** Show the account-menu inbox only when this profile has an invitation, including an answered one. */
export function useHasInvitations(): boolean {
  const { isAuthenticated, profile } = useAuth();
  const profileId = profile?.id ?? null;
  const { data } = useQuery({
    ...queries.myInvitations(profileId),
    enabled: isAuthenticated && profileId !== null,
  });

  return isAuthenticated && (data?.length ?? 0) > 0;
}
