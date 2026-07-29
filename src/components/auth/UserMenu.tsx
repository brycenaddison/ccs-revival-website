/**
 * The signed-in account control: a name button that opens a dropdown of account actions.
 *
 * The action list lives in `accountMenuEntries` rather than in the markup, because both nav
 * variants render the same actions in different shapes — a floating panel on desktop, flat
 * full-width rows inside the mobile drawer. Adding an option should mean editing one array,
 * not two components.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Link2, LogOut, type LucideIcon } from "lucide-react";
import { useAuth } from "../../lib/authContext";

export type MenuEntry =
  | { kind: "divider" }
  | {
      kind: "item";
      label: string;
      icon?: LucideIcon;
      /** Omitted for placeholders — an item with no handler is inert by construction. */
      onSelect?: () => void;
      disabled?: boolean;
      title?: string;
    };

/**
 * The account actions, in display order. Log out stays last; new options go above the divider.
 *
 * Riot linking is a placeholder: the identity payload already carries `profile.puuids`, but there
 * is no `/auth/riot/*` endpoint to send the user to yet, so the item renders disabled rather than
 * offering a click that would 404.
 */
export function accountMenuEntries(logout: () => Promise<void>): MenuEntry[] {
  return [
    { kind: "item", label: "Link Riot Account", icon: Link2, disabled: true, title: "Coming soon" },
    { kind: "divider" },
    { kind: "item", label: "Log out", icon: LogOut, onSelect: () => void logout() },
  ];
}

const LABEL = "font-heading text-sm tracking-wider uppercase whitespace-nowrap";

export function UserMenu({ name }: { name: string }) {
  const { logout } = useAuth();
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

  const entries = accountMenuEntries(logout);

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
                className={`flex w-full items-center gap-2 text-left bg-transparent border-none px-4 py-2.5 text-text-secondary ${LABEL} ${
                  entry.disabled
                    ? "opacity-50 cursor-default"
                    : "cursor-pointer hover:bg-bg-input hover:text-text-bright"
                }`}
              >
                {Icon && <Icon size={15} aria-hidden="true" className="shrink-0" />}
                {entry.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
