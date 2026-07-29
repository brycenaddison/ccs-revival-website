import { useAuth } from "../../lib/authContext";
import { accountMenuEntries, UserMenu } from "./UserMenu";

/**
 * `nav` matches the desktop bar's right-hand cluster (alongside ThemeToggle); `menu` matches
 * the full-width rows of the mobile drop-down.
 */
type Variant = "nav" | "menu";

const LABEL = "font-heading text-sm tracking-wider uppercase whitespace-nowrap";

export function AuthControl({ variant = "nav" }: { variant?: Variant }) {
  const { isAuthenticated, profile, loading, login, linkRiot, logout } = useAuth();

  // Render nothing until the first /auth/me settles. A "Log in" button that flips to the
  // user's name a moment later reads as a bug, and the check is fast enough to just wait.
  if (loading) return null;

  const menu = variant === "menu";

  if (!isAuthenticated) {
    return (
      <button
        onClick={login}
        className={
          menu
            ? `block w-full text-left bg-transparent border-none cursor-pointer py-3.5 px-5 border-l-[3px] border-l-transparent text-text-secondary ${LABEL}`
            : `bg-transparent border border-border rounded-md px-3 py-1 cursor-pointer text-text-secondary ${LABEL}`
        }
      >
        Log in
      </button>
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
        {accountMenuEntries(logout, linkRiot).map((entry, i) => {
          if (entry.kind === "divider") {
            return <div key={`divider-${i}`} role="separator" className="border-t border-border" />;
          }
          const Icon = entry.icon;
          return (
            <button
              key={entry.label}
              title={entry.title}
              aria-disabled={entry.disabled || undefined}
              onClick={entry.disabled ? undefined : entry.onSelect}
              className={`flex w-full items-center gap-2 text-left bg-transparent border-none py-3.5 px-5 border-l-[3px] border-l-transparent text-text-secondary ${LABEL} ${
                entry.disabled ? "opacity-50 cursor-default" : "cursor-pointer"
              }`}
            >
              {Icon && <Icon size={15} aria-hidden="true" className="shrink-0" />}
              {entry.label}
            </button>
          );
        })}
      </>
    );
  }

  return <UserMenu name={name} />;
}
