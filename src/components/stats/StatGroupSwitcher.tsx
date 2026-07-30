/**
 * Picks which group of statistics is on screen — and hosts the rest of the control row with it.
 *
 * Shared by all three data tabs so they read as one control rather than three similar ones, and so
 * adding a group to `lib/statGroups.ts` is the only edit needed to surface it everywhere.
 *
 * It renders in *both* the table and bars views. It used to be hidden in bars mode, which made the role
 * filter below it jump position on every switch. In bars mode the active group scopes the stat picker
 * instead, so the pills mean the same thing either way: which area of the game am I looking at.
 *
 * The `inline` slot holds the row's other filter — the role pills — separated by a rule so the two pill
 * groups don't read as one long undifferentiated run. `children` is the trailing, right-aligned slot for
 * the view toggle.
 */

import type { StatGroup } from "../../lib/statGroups";

interface Props<T> {
  groups: readonly StatGroup<T>[];
  activeId: string;
  onChange: (id: string) => void;
  /** Rendered immediately after the group pills, behind a divider — the role filter. */
  inline?: React.ReactNode;
  /** Optional trailing content — a view toggle, a count. */
  children?: React.ReactNode;
}

export function StatGroupSwitcher<T>({ groups, activeId, onChange, inline, children }: Props<T>) {
  return (
    <div className="flex gap-1 flex-wrap items-center mb-4">
      {groups.map(g => (
        <button
          key={g.id}
          onClick={() => onChange(g.id)}
          aria-pressed={g.id === activeId}
          // Bold on every pill, not just the active one: bolding on selection changed the button's
          // width and shifted the rest of the row sideways.
          className={`rounded-md border py-1.5 px-3 font-heading font-bold text-[11px] tracking-wide uppercase ${
            g.id === activeId
              ? "bg-accent border-accent text-white"
              : "bg-bg2 border-border text-text-secondary"
          }`}
        >
          {g.label}
        </button>
      ))}

      {inline && (
        <>
          <span className="w-px h-5 bg-border mx-1.5 shrink-0" aria-hidden="true" />
          {inline}
        </>
      )}

      {children && <div className="ml-auto flex items-center gap-2 pl-2">{children}</div>}
    </div>
  );
}
