import type { ReactNode } from "react";
import { useAuth } from "../../lib/authContext";

interface Props {
  children: ReactNode;
  /** When set, the profile must hold at least one of these roles. */
  roles?: string[];
}

/**
 * Gates content behind a session.
 *
 * Prompts in place rather than redirecting to the login route. The API's OAuth callback
 * redirects to a fixed origin (the site root), so bouncing an unauthenticated visitor away
 * from a deep link would silently lose their destination — signing in would drop them on the
 * home page with no way back. Prompting where they stand means the page they wanted is still
 * the page they are on when the session lands.
 */
export function RequireAuth({ children, roles }: Props) {
  const { isAuthenticated, loading, error, hasRole, login } = useAuth();

  if (loading) {
    return <div className="py-16 text-center text-text-subtle">Checking your session...</div>;
  }

  if (!isAuthenticated) {
    return (
      <Panel
        title="SIGN IN REQUIRED"
        body={error ? `Couldn't reach the login service: ${error}` : "Log in with Discord to view this page."}
      >
        <button
          onClick={login}
          className="bg-transparent border border-accent rounded-md px-4 py-2 cursor-pointer text-text-bright font-heading text-sm tracking-wider uppercase"
        >
          Log in with Discord
        </button>
      </Panel>
    );
  }

  if (roles?.length && !hasRole(...roles)) {
    return <Panel title="NOT AUTHORIZED" body="Your account doesn't have access to this page." />;
  }

  return <>{children}</>;
}

function Panel({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="max-w-[500px] mx-auto mt-16 text-center px-5">
      <h2 className="font-display text-[24px] text-text-bright tracking-widest mb-2">{title}</h2>
      <p className="text-text-secondary mb-5">{body}</p>
      {children}
    </div>
  );
}
