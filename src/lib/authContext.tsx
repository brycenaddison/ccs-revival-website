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
 *
 * Linking a Riot account is different — it runs in a popup and reports back by `postMessage`, so
 * this provider does see it through, and re-reads `/auth/me` afterwards for the new puuid. Riot
 * Sign On is not a login: it only attaches an account to an already-signed-in profile.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toast } from "../components/Toast";
import {
  ANONYMOUS,
  auth,
  errorMessage,
  isAbort,
  type AdminLeague,
  type Identity,
  type RiotLinkMessage,
  type RiotLinkStatus,
  type SessionProfile,
} from "./api";

interface AuthContextValue {
  /** Always populated; `ANONYMOUS` until proven otherwise. Check `loading` before trusting it. */
  identity: Identity;
  profile: SessionProfile | null;
  roles: string[];
  /**
   * Confs granted to this profile explicitly. Not the whole answer to "what can they administer" —
   * a site admin gets every league without any of them appearing here. Use `useAdminAccess()`
   * (`lib/adminAccess.ts`) rather than reading this directly.
   */
  leagues: AdminLeague[];
  isAuthenticated: boolean;
  /** True while the first `/auth/me` is in flight. Guards must wait rather than assume signed out. */
  loading: boolean;
  /** Set only for real faults — being signed out is not an error. */
  error: string | null;
  /** True if the profile holds any one of the given roles. */
  hasRole: (...roles: string[]) => boolean;
  /** Navigates away to Discord. Nothing after this call runs. */
  login: () => void;
  /**
   * Attaches a Riot account to this profile, via a popup. Resolves when the popup reports back or
   * is closed; the outcome is surfaced as a notice rather than returned.
   */
  linkRiot: () => Promise<void>;
  logout: () => Promise<void>;
  /** Ends sessions on every device, then drops local state. */
  logoutEverywhere: () => Promise<void>;
  /** Re-reads `/auth/me`; call after an action that may have changed roles or expired the session. */
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

/**
 * Riot account linking is off for now. Flip this back to `true` to restore it — the flow itself is
 * intact and unchanged; this only withdraws the two ways to start it (the account menu entry and the
 * button in Settings › Connections) and makes `linkRiot` a no-op so no other path can open the popup.
 *
 * Already-linked accounts still list in Settings › Connections: hiding what a profile is carrying
 * would be a different, larger change than pausing new links.
 */
// Annotated `boolean` rather than left as the literal `false`, so the code behind the flag stays
// live to the type checker instead of narrowing to unreachable.
export const RIOT_LINKING_ENABLED: boolean = false;

/**
 * What to say about a failed link. `denied` is the user cancelling at Riot's consent screen, so it
 * reads as a cancellation rather than a fault.
 */
const FAILURE_TEXT: Partial<Record<RiotLinkStatus, string>> = {
  denied: "Riot linking cancelled.",
  invalid_state: "That link request expired or didn't match your session. Try again.",
  no_profile: "Your session is no longer valid — sign in again.",
  bad_gateway: "Riot didn't respond. Try again in a moment.",
  bad_request: "Couldn't link that Riot account.",
  error: "Couldn't link that Riot account.",
};

function successText(m: RiotLinkMessage): string {
  const who = m.riotId?.trim() || "your Riot account";
  if (m.status === "already_linked") return `${who} is already on your profile.`;
  // A merge absorbed another profile, which is worth saying out loud — it is not reversible.
  if (m.merged || m.status === "merged") return `Linked ${who}, merging in the profile that held it.`;
  return `Linked ${who}.`;
}

interface Notice {
  text: string;
  tone: "success" | "error";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity>(ANONYMOUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

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

  const linkRiot = useCallback(async () => {
    if (!RIOT_LINKING_ENABLED) return;

    const popup = window.open(auth.riotLinkUrl(), "ccs-riot-link", "width=520,height=720");
    if (!popup) {
      setNotice({ text: "Allow pop-ups for this site to link a Riot account.", tone: "error" });
      return;
    }

    // Resolves with the callback's report, or `null` if the window went away without one — a
    // deployment with RSO unconfigured 404s, and cross-origin that looks the same as being closed.
    const result = await new Promise<RiotLinkMessage | null>(resolve => {
      let poll: ReturnType<typeof setInterval> | undefined;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearInterval(poll);
      };
      // Hoisted, so `cleanup` can reference it before this line.
      function onMessage(e: MessageEvent) {
        if (!auth.isRiotLinkMessage(e)) return;
        cleanup();
        resolve(e.data);
      }
      window.addEventListener("message", onMessage);
      poll = setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        resolve(null);
      }, 500);
    });

    // Closed without reporting: the user walked away. Nothing happened, so say nothing.
    if (result === null) return;

    if (result.ok) {
      // The new puuid is already in `/auth/me`, so re-read it rather than trusting the payload.
      await read();
      setNotice({ text: successText(result), tone: "success" });
      return;
    }
    setNotice({ text: FAILURE_TEXT[result.status] ?? "Couldn't link that Riot account.", tone: "error" });
  }, [read]);

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
      leagues: identity.leagues,
      isAuthenticated: identity.authenticated,
      loading,
      error,
      hasRole,
      login,
      linkRiot,
      logout,
      logoutEverywhere,
      refresh,
    }),
    [identity, loading, error, hasRole, login, linkRiot, logout, logoutEverywhere, refresh],
  );

  return (
    <AuthCtx.Provider value={value}>
      {children}
      {/* The provider owns the Riot-link result because it owns the flow, and because the two nav
          variants that start it both unmount their menu on click — neither could show it. */}
      <Toast
        message={notice?.text ?? null}
        type={notice?.tone ?? "success"}
        onClose={() => setNotice(null)}
      />
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
