/**
 * The signed-in account control: an avatar-and-name button that opens a dropdown of account actions.
 *
 * The action list lives in `accountMenuEntries` rather than in the markup, because both nav
 * variants render the same actions in different shapes — a floating panel on desktop, flat
 * full-width rows inside the mobile drawer. Adding an option should mean editing one array,
 * not two components.
 */

import { Link } from "react-router-dom";
import { ChevronDown, ClipboardList, Coins, FileText, Inbox, Link2, LogOut, Settings, Shield, UserRound, type LucideIcon } from "lucide-react";
import { useAdminAccess } from "../../lib/adminAccess";
import { useAuth } from "../../lib/authContext";
import { CONTENT_ROLE } from "../../lib/api";
import { useHasLiveApplication } from "../../hooks/useMyApplications";
import { useHasInvitations } from "../../hooks/useInvitations";
import { PlayerAvatar } from "../players/PlayerIdentity";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  hasInvitations: boolean;
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
 * Takes an options object rather than positional arguments: the list is driven by several inputs
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
  hasInvitations,
  isSiteAdmin,
  canEditContent,
  profileId,
}: EntryOpts): MenuEntry[] {
  return [
    ...(profileId ? [{ kind: "item" as const, label: "View Profile", icon: UserRound, to: playerPath(profileId) }] : []),
    // Only while there is one to return to: the row disappears with the application, or when intake
    // closes on it. Its own page rather than `/register`: that page is built around starting a team,
    // and somebody coming back to check on one they already sent wants every league's cards in one
    // place with no form in the way.
    ...(hasApplication
      ? [{ kind: "item" as const, label: "My Applications", icon: ClipboardList, to: "/my-applications" }]
      : []),
    // Include answered invitations; the inbox remains useful for reviewing a past response.
    ...(hasInvitations
      ? [{ kind: "item" as const, label: "Team Invitations", icon: Inbox, to: "/team-invitations" }]
      : []),
    { kind: "item", label: "My Predictions", icon: Coins, to: "/my-predictions" },
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

const LABEL = "font-heading text-sm whitespace-nowrap";

/** Shared by the button and link branches, so the two are indistinguishable in the panel. */
const ITEM = `cursor-pointer gap-2 px-3 py-2 text-text-secondary no-underline focus:text-text-bright ${LABEL}`;

/**
 * The account trigger and its menu. Radix owns the floating layer: arrow-key navigation, Escape,
 * dismissal on an outside click and focus returning to the trigger.
 */
export function UserMenu({ name, avatar }: { name: string; avatar: string | null }) {
  const { logout, linkRiot, canLinkRiot, hasRole, profile } = useAuth();
  const { isSiteAdmin } = useAdminAccess();
  const hasApplication = useHasLiveApplication();
  const hasInvitations = useHasInvitations();

  const entries = accountMenuEntries({
    profileId: profile?.id ?? null,
    logout,
    linkRiot,
    canLinkRiot,
    hasApplication,
    hasInvitations,
    isSiteAdmin,
    canEditContent: isSiteAdmin || hasRole(CONTENT_ROLE),
  });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        title={name}
        className={`group flex items-center gap-1.5 bg-transparent border border-border rounded-md py-1 pl-1.5 pr-3 cursor-pointer text-text-secondary hover:text-text-bright data-[state=open]:text-text-bright ${LABEL}`}
      >
        {/* 20px, so the trigger stays the height of the outlined and filled buttons beside it. */}
        <PlayerAvatar src={avatar} size="small" className="size-5" />
        <span className="max-w-[7rem] lg:max-w-[10rem] truncate">{name}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[13rem]">
        {entries.map((entry, i) => {
          if (entry.kind === "divider") return <DropdownMenuSeparator key={`divider-${i}`} />;
          const Icon = entry.icon;
          const glyph = Icon && <Icon size={15} aria-hidden="true" className="shrink-0" />;

          // A navigation is a real link, not a button that navigates: middle-click and "copy link
          // address" should work on it like anywhere else in the nav.
          if (entry.to && !entry.disabled) {
            return (
              <DropdownMenuItem key={entry.label} asChild className={ITEM}>
                <Link to={entry.to} title={entry.title}>
                  {glyph}
                  {entry.label}
                </Link>
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem
              key={entry.label}
              title={entry.title}
              disabled={entry.disabled}
              onSelect={entry.onSelect}
              className={ITEM}
            >
              {glyph}
              {entry.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
