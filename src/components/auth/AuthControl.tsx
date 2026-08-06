import { Link } from "react-router-dom";
import { useAdminAccess } from "../../lib/adminAccess";
import { useAuth } from "../../lib/authContext";
import { CONTENT_ROLE } from "../../lib/api";
import { accountMenuEntries, UserMenu } from "./UserMenu";

/**
 * `nav` matches the desktop bar's right-hand cluster (alongside ThemeToggle); `menu` matches
 * the full-width rows of the mobile drop-down.
 */
type Variant = "nav" | "menu";

const LABEL = "font-heading text-sm tracking-wider uppercase whitespace-nowrap";

/** The drawer's full-width row, shared by the button and link branches. */
const ROW = `flex w-full items-center gap-2 text-left bg-transparent border-none py-3.5 px-5 border-l-[3px] border-l-transparent text-text-secondary ${LABEL}`;

interface Props {
  variant?: Variant;
  /**
   * Called when an entry navigates. The drawer that owns this control has to close itself — a
   * `menu`-variant link would otherwise leave the drawer open on top of the page it just opened.
   */
  onNavigate?: () => void;
}

export function AuthControl({ variant = "nav", onNavigate }: Props) {
  const { isAuthenticated, profile, loading, login, linkRiot, logout, hasRole } = useAuth();
  const { isSiteAdmin } = useAdminAccess();
  const canEditContent = isSiteAdmin || hasRole(CONTENT_ROLE);

  // Render nothing until the first /auth/me settles. A "Log in" button that flips to the
  // user's name a moment later reads as a bug, and the check is fast enough to just wait.
  if (loading) return null;

  const menu = variant === "menu";

  // JOIN CCS rides with the signed-out state rather than sitting in the nav on its own, so that one
  // component decides what the account cluster contains and there is no second `loading` check to
  // keep in step — a separately-rendered button would pop in before this one resolved. Someone
  // already signed in has joined, or is being recruited some other way.
  if (!isAuthenticated) {
    if (menu) {
      return (
        <>
          {/* `border-t-border` rather than `border-border`: the shorthand would also repaint the
              accent left rule, since it sets all four sides and wins on generated-CSS order. */}
          <Link
            to="/register"
            onClick={onNavigate}
            className={`block w-full text-left cursor-pointer py-3.5 px-5 border-t border-t-border border-l-[3px] border-l-accent text-accent no-underline ${LABEL}`}
          >
            Join CCS
          </Link>
          <button
            onClick={login}
            className={`block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 border-l-[3px] border-l-transparent text-text-secondary ${LABEL}`}
          >
            Log in
          </button>
        </>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Link
          to="/register"
          className={`text-[#0a0a0a] bg-accent rounded-md px-3 py-1 no-underline font-semibold ${LABEL}`}
        >
          Join CCS
        </Link>
        <button
          onClick={login}
          className={`bg-transparent border border-border rounded-md px-3 py-1 cursor-pointer text-text-secondary ${LABEL}`}
        >
          Log in
        </button>
      </div>
    );
  }

  const name = profile?.name ?? "Account";

  // The drawer is already a menu, so the same actions render as flat rows rather than a
  // nested popup — same list, same order, styled to match the tab rows above them.
  if (menu) {
    return (
      <>
        <div className="px-5 py-3 border-t border-border">
          <span className={`${LABEL} text-text-bright truncate`}>{name}</span>
        </div>
        {accountMenuEntries({ logout, linkRiot, isSiteAdmin, canEditContent }).map((entry, i) => {
          if (entry.kind === "divider") {
            return <div key={`divider-${i}`} role="separator" className="border-t border-border" />;
          }
          const Icon = entry.icon;
          const glyph = Icon && <Icon size={15} aria-hidden="true" className="shrink-0" />;
          const state = entry.disabled ? "opacity-50 cursor-default" : "cursor-pointer";

          if (entry.to && !entry.disabled) {
            return (
              <Link
                key={entry.label}
                to={entry.to}
                title={entry.title}
                onClick={onNavigate}
                className={`${ROW} ${state} no-underline`}
              >
                {glyph}
                {entry.label}
              </Link>
            );
          }

          return (
            <button
              key={entry.label}
              title={entry.title}
              aria-disabled={entry.disabled || undefined}
              onClick={entry.disabled ? undefined : entry.onSelect}
              className={`${ROW} ${state}`}
            >
              {glyph}
              {entry.label}
            </button>
          );
        })}
      </>
    );
  }

  return <UserMenu name={name} />;
}
