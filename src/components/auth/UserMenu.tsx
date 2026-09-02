/**
 * The signed-in account control: a name button that opens a dropdown of account actions.
 *
 * The action list lives in `accountMenuEntries` rather than in the markup, because both nav
 * variants render the same actions in different shapes — a floating panel on desktop, flat
 * full-width rows inside the mobile drawer. Adding an option should mean editing one array,
 * not two components.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ClipboardList, FileText, Inbox, Link2, LogOut, Settings, Shield, UserRound, type LucideIcon } from "lucide-react";
import { useAdminAccess } from "../../lib/adminAccess";
import { useAuth } from "../../lib/authContext";
import { CONTENT_ROLE } from "../../lib/api";
import { useHasLiveApplication } from "../../hooks/useMyApplications";
import { playerPath } from "../profile/PlayerLink";

export type MenuEntry =
  | { kind: "divider" }
  | {
      kind: "item";
      label: string;
      icon?: LucideIcon;
      /**
       * A route. Rendered as a `<Link>`, so the entry can be middle-clicked and copied like any
       * other navigation. Mutually exclusive with `onSelect`.
       */
      to?: string;
      /** Omitted for placeholders — an item with no handler is inert by construction. */
      onSelect?: () => void;
      disabled?: boolean;
      title?: string;
    };

interface EntryOpts {
  profileId: number | null;
  logout: () => Promise<void>;
  linkRiot: () => Promise<void>;
  /** `useAuth().canLinkRiot` — the local switch and the deployment's RSO configuration, resolved. */
  canLinkRiot: boolean;
  /**
   * `useHasLiveApplication()`: whether the member is running a team application in a season that is
   * still taking them. Offers the way back to it; the Apply Now button beside the menu reads as a way
   * to start one, and a started application was otherwise hard to find again.
   */
  hasApplication: boolean;
  isSiteAdmin: boolean;
  /**
   * Whether to offer the writers' portal. Already OR'd with site admin by the caller, matching the
   * API's `content` guard — which lets an admin through, since they could grant themselves the role
   * in one request anyway.
   */
  canEditContent: boolean;
}

/**
 * The account actions, in display order. Log out stays last; new options go above the divider.
 *
 * Takes an options object rather than positional arguments: the list is now driven by three inputs
 * and will keep growing, and `accountMenuEntries(logout, linkRiot, true)` says nothing at the call
 * site about what `true` means.
 *
 * Riot linking opens a popup and reports its outcome through the auth provider's notice, so
 * nothing here has to wait on the promise — the menu is closed by then either way. It stays even
 * though Settings › Connections now exists: that page is where you *see* what's linked, not the
 * only way to start linking. When RSO is unavailable the entry is dropped rather than shown grayed
 * out: a dead row in a four-item menu is noise, with nothing here to explain it. Adding an account
 * by name lives only in Settings, because it is a form rather than one click.
 */
export function accountMenuEntries({
  logout,
  linkRiot,
  canLinkRiot,
  hasApplication,
  isSiteAdmin,
  canEditContent,
  profileId,
}: EntryOpts): MenuEntry[] {
  return [
    ...(profileId ? [{ kind: "item" as const, label: "View profile", icon: UserRound, to: playerPath(profileId) }] : []),
    // Only while there is one to return to: the row disappears with the application, or when intake
    // closes on it. Its own page rather than `/register`: that page is built around starting a team,
    // and somebody coming back to check on one they already sent wants every league's cards in one
    // place with no form in the way.
    ...(hasApplication
      ? [{ kind: "item" as const, label: "My applications", icon: ClipboardList, to: "/my-applications" }]
      : []),
    // Unconditional, unlike the Apply Now button beside this menu. An invitation can arrive long
    // after intake closes — staff review takes days — and this is the only page that can answer it,
    // since the Discord DM is best-effort and may never have been delivered.
    { kind: "item", label: "Team invitations", icon: Inbox, to: "/team-invitations" },
    { kind: "item", label: "Settings", icon: Settings, to: "/settings" },
    ...(canEditContent
      ? [{ kind: "item" as const, label: "Content", icon: FileText, to: "/content" }]
      : []),
    ...(isSiteAdmin
      ? [{ kind: "item" as const, label: "Site Admin", icon: Shield, to: "/admin" }]
      : []),
    ...(canLinkRiot
      ? [
          { kind: "divider" as const },
          {
            kind: "item" as const,
            label: "Link Riot Account",
            icon: Link2,
            title: "Verify a Riot account and attach it to your profile",
            onSelect: () => void linkRiot(),
          },
        ]
      : []),
    { kind: "divider" },
    { kind: "item", label: "Log out", icon: LogOut, onSelect: () => void logout() },
  ];
}

const LABEL = "font-heading text-sm tracking-wider uppercase whitespace-nowrap";

/** Shared by the button and link branches, so the two are indistinguishable in the panel. */
const ITEM = `flex w-full items-center gap-2 text-left bg-transparent border-none px-4 py-2.5 text-text-secondary ${LABEL}`;

export function UserMenu({ name }: { name: string }) {
  const { logout, linkRiot, canLinkRiot, hasRole, profile } = useAuth();
  const { isSiteAdmin } = useAdminAccess();
  const hasApplication = useHasLiveApplication();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Focus would otherwise land on <body>, stranding keyboard users outside the nav.
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const entries = accountMenuEntries({
    profileId: profile?.id ?? null,
    logout,
    linkRiot,
    canLinkRiot,
    hasApplication,
    isSiteAdmin,
    canEditContent: isSiteAdmin || hasRole(CONTENT_ROLE),
  });

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name}
        className={`flex items-center gap-1.5 bg-transparent border border-border rounded-md px-3 py-1 cursor-pointer text-text-secondary hover:text-text-bright ${LABEL}`}
      >
        <span className="max-w-[7rem] lg:max-w-[10rem] truncate">{name}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[13rem] bg-bg2 border border-border rounded-md py-1 z-[200] shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
        >
          {entries.map((entry, i) => {
            if (entry.kind === "divider") {
              return <div key={`divider-${i}`} role="separator" className="my-1 border-t border-border" />;
            }
            const Icon = entry.icon;
            const glyph = Icon && <Icon size={15} aria-hidden="true" className="shrink-0" />;
            const state = entry.disabled
              ? "opacity-50 cursor-default"
              : "cursor-pointer hover:bg-bg-input hover:text-text-bright";

            // A navigation is a real link, not a button that navigates — middle-click and
            // "copy link address" should work on it like anywhere else in the nav.
            if (entry.to && !entry.disabled) {
              return (
                <Link
                  key={entry.label}
                  role="menuitem"
                  to={entry.to}
                  title={entry.title}
                  onClick={() => setOpen(false)}
                  className={`${ITEM} ${state} no-underline`}
                >
                  {glyph}
                  {entry.label}
                </Link>
              );
            }

            return (
              <button
                key={entry.label}
                role="menuitem"
                title={entry.title}
                aria-disabled={entry.disabled || undefined}
                onClick={
                  entry.disabled
                    ? undefined
                    : () => {
                        setOpen(false);
                        entry.onSelect?.();
                      }
                }
                className={`${ITEM} ${state}`}
              >
                {glyph}
                {entry.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
