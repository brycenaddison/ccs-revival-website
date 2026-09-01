/**
 * One setup gate for the route tree.
 *
 * Keeping this above Routes makes `setupRequired` a session invariant instead of a convention each
 * signed-in page has to remember. Anonymous readers are untouched; incomplete signed-in profiles may
 * reach only `/setup`, whose normal page chrome still exposes logout.
 */

import { useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/authContext";
import { playerPath } from "../profile/PlayerLink";

export function SetupGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, profile } = useAuth();
  const { pathname } = useLocation();

  /*
   * Whether this visit to `/setup` began with setup actually outstanding.
   *
   * The completion write and the redirect out are the same event: saving the presentation form sets
   * `setupRequired: false` and refreshes the session, so the moment it lands this gate would bounce
   * the page it landed on. That was fine while `/setup` was one form, and it makes any step *after*
   * the save impossible — the Riot accounts prompt that now follows it would unmount before it
   * rendered. Remembering that setup was pending on arrival hands the rest of the flow back to the
   * page, which navigates itself when the player is done.
   *
   * A ref rather than state: nothing renders differently for it, and it must not be a dependency of
   * anything. It resets on reload, which is the behavior we want — coming back to `/setup` later,
   * with nothing left to set up, still goes to the profile.
   */
  const inFlow = useRef(false);
  if (profile?.setupRequired && pathname === "/setup") inFlow.current = true;

  if (loading) {
    return <div className="min-h-screen bg-bg grid place-items-center text-text-subtle">Checking your session…</div>;
  }

  if (isAuthenticated && profile?.setupRequired && pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  if (
    isAuthenticated &&
    profile &&
    !profile.setupRequired &&
    pathname === "/setup" &&
    !inFlow.current
  ) {
    return <Navigate to={playerPath(profile.id)} replace />;
  }

  return <>{children}</>;
}
