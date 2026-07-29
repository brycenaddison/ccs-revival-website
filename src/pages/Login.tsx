import { useEffect } from "react";
import { auth } from "../lib/api";

/**
 * A shareable front door for signing in: `/login` hands off to the API's OAuth entry point.
 *
 * The handoff is a full-page `location.replace`, not a fetch and not a router navigation —
 * the browser has to follow the redirect chain to Discord itself, and the `oauth_state`
 * cookie the callback validates is only set on a document request. See `lib/api/auth.ts`.
 *
 * `replace` rather than `assign` so this page leaves no history entry: the API's callback
 * lands the visitor on the site root, and a lingering `/login` step would make Back bounce
 * them straight into another login round-trip.
 *
 * Deliberately does not wait on `useAuth` to skip the trip for an existing session. That
 * would trade an instant redirect for a `/auth/me` round-trip on every visit, and Discord
 * re-approves an already-authorized account without prompting anyway.
 */
export default function Login() {
  useEffect(() => {
    window.location.replace(auth.loginUrl());
  }, []);

  return (
    <div className="bg-bg min-h-screen text-text font-body flex items-center justify-center px-5">
      <div className="text-center">
        <h1 className="font-display text-[22px] text-text-bright tracking-widest mb-2">SIGNING IN</h1>
        <p className="text-text-secondary mb-5">Redirecting you to Discord...</p>
        {/* Escape hatch: covers a blocked automatic navigation, and gives the page something
            actionable if the API is unreachable and the redirect stalls. */}
        <a
          href={auth.loginUrl()}
          className="text-accent text-[11px] font-heading tracking-wider uppercase no-underline hover:text-text-bright"
        >
          Continue to Discord
        </a>
      </div>
    </div>
  );
}
