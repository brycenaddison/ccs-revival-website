/**
 * The filter row every stats tab now shares.
 *
 * The two class strings below were already the de-facto standard — the Leaderboard hoisted them and
 * every other control copied them by hand, which is how three near-identical selects ended up with
 * three slightly different paddings. Exporting them makes the copy unnecessary.
 *
 * Layout is a labeled grid rather than a toolbar because a bare row of selects gives the reader no
 * way to tell "Min Games" from "Team" until they open one.
 */

export const CONTROL_CLASS =
  "bg-bg2 border border-border rounded-md text-text text-sm font-body px-3 py-2 focus:outline-none focus:border-brand w-full";

export const LABEL_CLASS =
  "block text-[10px] font-heading font-medium text-text-secondary mb-1";

interface BarProps {
  isMobile: boolean;
  /** Desktop column count. Mobile always collapses to two. */
  columns?: number;
  children: React.ReactNode;
}

export function FilterBar({ isMobile, columns = 5, children }: BarProps) {
  const cols = isMobile ? 2 : columns;
  return (
    <div
      className="grid gap-2.5 mb-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  /** Columns to span. Use the grid's full width for a pill row. */
  span?: number;
  children: React.ReactNode;
}

export function Field({ label, span, children }: FieldProps) {
  return (
    <div style={span ? { gridColumn: `span ${span}` } : undefined}>
      <span className={LABEL_CLASS}>{label}</span>
      {children}
    </div>
  );
}

interface PillGroupProps {
  options: readonly { value: string; label: string }[];
  isActive: (value: string) => boolean;
  onSelect: (value: string) => void;
  /** Fill the row evenly rather than sizing to content — for a 3-option direction switch. */
  stretch?: boolean;
}

/**
 * The active/inactive pill pair, which was the single most-duplicated class string in the repo.
 *
 * Works for both single-select (role filter, direction) and multi-select (the Leaderboard's roles),
 * because it only asks the caller whether a value is active — it holds no selection state of its own.
 *
 * `font-bold` is on every pill, not just the selected one. Bolding only the selection changed that
 * button's text width, so the whole row shifted sideways as you clicked along it. Selection is carried
 * by the fill and border instead, which cost nothing in layout.
 */
export function PillGroup({ options, isActive, onSelect, stretch }: PillGroupProps) {
  return (
    <div className="flex gap-1 flex-wrap items-center">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onSelect(o.value)}
          aria-pressed={isActive(o.value)}
          className={`rounded-md border py-1.5 px-3 font-heading font-bold text-[11px] tracking-wide whitespace-nowrap ${
            stretch ? "flex-1 px-1" : ""
          } ${
            isActive(o.value)
              ? "bg-brand border-brand text-white"
              : "bg-bg2 border-border text-text-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
