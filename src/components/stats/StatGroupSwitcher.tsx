/**
 * Picks which group of statistics is on screen.
 *
 * Shared by the Teams and Champions tabs so the two read as one control rather than two similar ones,
 * and so adding a group to `lib/statGroups.ts` is the only edit needed to surface it in both.
 */

import type { StatGroup } from "../../lib/statGroups";

interface Props<T> {
  groups: readonly StatGroup<T>[];
  activeId: string;
  onChange: (id: string) => void;
  /** Optional trailing content — a view toggle, a count. */
  children?: React.ReactNode;
}

export function StatGroupSwitcher<T>({ groups, activeId, onChange, children }: Props<T>) {
  return (
    <div className="flex gap-1 flex-wrap items-center mb-4">
      {groups.map(g => (
        <button
          key={g.id}
          onClick={() => onChange(g.id)}
          aria-pressed={g.id === activeId}
          className={`rounded-md border py-1.5 px-3 font-heading text-[11px] tracking-wide uppercase ${
            g.id === activeId
              ? "bg-accent border-accent text-white font-bold"
              : "bg-bg2 border-border text-text-secondary"
          }`}
        >
          {g.label}
        </button>
      ))}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
