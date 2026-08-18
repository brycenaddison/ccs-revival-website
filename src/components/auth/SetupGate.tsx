/**
 * One setup gate for the route tree.
 *
 * Keeping this above Routes makes `setupRequired` a session invariant instead of a convention each
 * signed-in page has to remember. Anonymous readers are untouched; incomplete signed-in profiles may
 * reach only `/setup`, whose normal page chrome still exposes logout.
 */

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/authContext";
import { playerPath } from "../profile/PlayerLink";

export function SetupGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, profile } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-bg grid place-items-center text-text-subtle">Checking your session…</div>;
  }

  if (isAuthenticated && profile?.setupRequired && pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  if (isAuthenticated && profile && !profile.setupRequired && pathname === "/setup") {
    return <Navigate to={playerPath(profile.id)} replace />;
  }

  return <>{children}</>;
}
