/**
 * Who is signed in.
 *
 * The session token is an httpOnly cookie, so JavaScript cannot read it — there is no token
 * to decode and no local storage to sync. Identity is discovered by asking the server
 * (`GET /auth/me`) once on mount, and re-asking after anything that could have changed it.
 *
 * Login is a full-page navigation to the API, not a fetch, so this provider does not observe
 * the login itself: the browser leaves, Discord redirects back to the site root, and the
 * fresh mount's `/auth/me` is what discovers the new session.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ANONYMOUS, auth, errorMessage, isAbort, type Identity, type SessionProfile } from "./api";

interface AuthContextValue {
  /** Always populated; `ANONYMOUS` until proven otherwise. Check `loading` before trusting it. */
  identity: Identity;
  profile: SessionProfile | null;
  roles: string[];
  isAuthenticated: boolean;
  /** True while the first `/auth/me` is in flight. Guards must wait rather than assume signed out. */
  loading: boolean;
  /** Set only for real faults — being signed out is not an error. */
  error: string | null;
  /** True if the profile holds any one of the given roles. */
  hasRole: (...roles: string[]) => boolean;
  /** Navigates away to Discord. Nothing after this call runs. */
  login: () => void;
  logout: () => Promise<void>;
  /** Ends sessions on every device, then drops local state. */
  logoutEverywhere: () => Promise<void>;
  /** Re-reads `/auth/me`; call after an action that may have changed roles or expired the session. */
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity>(ANONYMOUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await auth.me({ signal });
      if (signal?.aborted) return;
      setIdentity(next);
      setError(null);
    } catch (e) {
      if (isAbort(e)) return;
      // A fault means we cannot prove a session, so present as signed out — but surface the
      // reason, since "the API is down" and "you are logged out" look identical otherwise.
      setIdentity(ANONYMOUS);
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    read(ac.signal).finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [read]);

  const refresh = useCallback(() => read(), [read]);

  const login = useCallback(() => {
    window.location.assign(auth.loginUrl());
  }, []);

  const clear = useCallback(async (end: () => Promise<void>) => {
    // Swallow the failure deliberately: the cookie may already be gone, and leaving the UI
    // in a signed-in state when the user asked to leave is the worse outcome.
    try { await end(); } catch { /* fall through to clearing local state */ }
    setIdentity(ANONYMOUS);
    setError(null);
  }, []);

  const logout = useCallback(() => clear(() => auth.logout()), [clear]);
  const logoutEverywhere = useCallback(() => clear(() => auth.logoutAll()), [clear]);

  const hasRole = useCallback(
    (...roles: string[]) => roles.some(r => identity.roles.includes(r)),
    [identity.roles],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      identity,
      profile: identity.profile,
      roles: identity.roles,
      isAuthenticated: identity.authenticated,
      loading,
      error,
      hasRole,
      login,
      logout,
      logoutEverywhere,
      refresh,
    }),
    [identity, loading, error, hasRole, login, logout, logoutEverywhere, refresh],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
