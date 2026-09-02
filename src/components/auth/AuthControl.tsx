import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAdminAccess } from "../../lib/adminAccess";
import { useAuth } from "../../lib/authContext";
import { CONTENT_ROLE } from "../../lib/api";
import { queries } from "../../lib/queries";
import { useHasLiveApplication } from "../../hooks/useMyApplications";
import { accountMenuEntries, UserMenu } from "./UserMenu";

/**
 * `nav` matches the desktop bar's right-hand cluster (alongside ThemeToggle); `menu` matches
 * the full-width rows of the mobile drop-down.
 */
type Variant = "nav" | "menu";

const LABEL = "font-heading text-sm whitespace-nowrap";

/**
 * The one filled button in the nav — JOIN CCS signed out, APPLY NOW signed in.
 *
 * `text-white` rather than the near-black it used to carry. Accent is the same `#d20708` in both
 * themes, so near-black on it was only ever ~3.5:1 and on a white page it read as a muddy blob
 * rather than a button; white is ~6:1 and is already the pairing `::selection` and the old
 * registration CTA use. It also drops a raw hex, which the theme tokens exist to avoid.
 *
 * `border border-brand` is load-bearing, not decoration: this sits beside the outlined LOG IN and
 * account buttons, which are `border border-border`. Without a border of its own this box was two
 * pixels shorter than its neighbour and the pair looked misaligned on desktop.
 */
const CTA = `text-white bg-brand border border-brand rounded-md px-3 py-1 no-underline font-semibold ${LABEL}`;

/** The drawer's full-width row, shared by the button and link branches. */
const ROW = `flex w-full items-center gap-2 text-left bg-transparent border-none py-3.5 px-5 border-l-[3px] border-l-transparent text-text-secondary transition-colors hover:bg-bg-input hover:text-text-bright ${LABEL}`;

interface Props {
  variant?: Variant;
  /**
   * Called when an entry navigates. The drawer that owns this control has to close itself — a
   * `menu`-variant link would otherwise leave the drawer open on top of the page it just opened.
   */
  onNavigate?: () => void;
}

export function AuthControl({ variant = "nav", onNavigate }: Props) {
  const { isAuthenticated, profile, loading, login, linkRiot, canLinkRiot, logout, hasRole } = useAuth();
  const { isSiteAdmin } = useAdminAccess();
  const canEditContent = isSiteAdmin || hasRole(CONTENT_ROLE);

  /**
   * Whether *any* league is taking applications right now — answered for both session states.
   *
   * Two reads, because the two callers are different. Signed in, `/tournaments/applications/open`
   * is already in cache for the applicant page and names the conferences. Signed out that route is a
   * `401`, so the flag comes off the public `/home` payload, which carries it precisely so the nav
   * can stop saying "join" when it could say "we are recruiting".
   *
   * The `/home` read uses the site-wide key rather than the selected conference's, matching what the
   * flag means — it is not narrowed by `?conf=`. On the home page that is a second `/home` request
   * with a different key; it is `max-age=300` and the payload is small, which is a better trade than
   * a nav that quietly depends on which season a page happened to select.
   */
  const { data: openSeasons } = useQuery({
    ...queries.openApplicationSeasons(),
    enabled: isAuthenticated,
  });
  const { data: home } = useQuery({ ...queries.home(), enabled: !isAuthenticated });
  const applicationsOpen = isAuthenticated
    ? (openSeasons?.length ?? 0) > 0
    : home?.applicationsOpen === true;
  // For the drawer's flat copy of the account menu. `UserMenu` reads it itself on desktop.
  const hasApplication = useHasLiveApplication();

  // Render nothing until the first /auth/me settles. A "Log in" button that flips to the
  // user's name a moment later reads as a bug, and the check is fast enough to just wait.
  if (loading) return null;

  const menu = variant === "menu";

  // JOIN CCS rides with the signed-out state rather than sitting in the nav on its own, so that one
  // component decides what the account cluster contains and there is no second `loading` check to
  // keep in step — a separately-rendered button would pop in before this one resolved.
  //
  // It used to disappear entirely once you signed in, on the reasoning that someone signed in had
  // already joined. That was wrong: signing in is how you *reach* the application form, so the one
  // affordance for applying vanished at exactly the moment it became usable. Signed in, the same
  // slot carries APPLY NOW whenever a league is taking applications, off the same `CTA` class.
  if (!isAuthenticated) {
    if (menu) {
      return (
        <>
          {/* `border-t-border` rather than `border-border`: the shorthand would also repaint the
              accent left rule, since it sets all four sides and wins on generated-CSS order. */}
          <Link
            to="/register"
            onClick={onNavigate}
            className={`block w-full text-left cursor-pointer py-3.5 px-5 border-t border-t-border border-l-[3px] border-l-brand text-brand no-underline ${LABEL}`}
          >
            {applicationsOpen ? "Apply Now" : "Join CCS"}
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
          className={CTA}
        >
          {/* "Apply Now" when a league is recruiting, "Join CCS" otherwise — same slot, same fill,
              and the signed-in branch below reuses both. */}
          {applicationsOpen ? "Apply Now" : "Join CCS"}
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

  const name = profile?.nickname ?? profile?.name ?? "Account";

  // The drawer is already a menu, so the same actions render as flat rows rather than a
  // nested popup — same list, same order, styled to match the tab rows above them.
  if (menu) {
    return (
      <>
        {applicationsOpen && (
          <Link
            to="/register"
            onClick={onNavigate}
            className={`block w-full text-left cursor-pointer py-3.5 px-5 border-t border-t-border border-l-[3px] border-l-brand text-brand no-underline ${LABEL}`}
          >
            Apply Now
          </Link>
        )}
        <div className="px-5 py-3 border-t border-border">
          <span className={`${LABEL} text-text-bright truncate`}>{name}</span>
        </div>
        {accountMenuEntries({
          profileId: profile?.id ?? null,
          logout,
          linkRiot,
          canLinkRiot,
          hasApplication,
          isSiteAdmin,
          canEditContent,
        }).map((entry, i) => {
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

  // Same slot the signed-out JOIN CCS occupies, and the same accent fill, so the call to action sits
  // in one place regardless of session state.
  return (
    <div className="flex items-center gap-2">
      {applicationsOpen && (
        <Link
          to="/register"
          title="A league is taking team applications"
          className={CTA}
        >
          Apply Now
        </Link>
      )}
      <UserMenu name={name} />
    </div>
  );
}
