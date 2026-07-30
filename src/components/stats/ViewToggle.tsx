/**
 * Switches a stats tab between its presentations.
 *
 * Lifted out of `pages/Stats.tsx`, where it used to be a boolean Cards/Table switch owned by the page.
 * The page owning it was the reason flipping views threw away your filters: the two branches were
 * different components, so the panel unmounted. Each panel now holds its own view state and renders
 * this in the group switcher's trailing slot, and the selection survives.
 */

export type StatView = "table" | "bars";

export const STAT_VIEW_OPTIONS: readonly { value: StatView; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "bars", label: "Bars" },
];

interface Props<V extends string> {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}

export function ViewToggle<V extends string>({ options, value, onChange }: Props<V>) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border overflow-hidden">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          // Bold on both, so switching doesn't resize the control.
          className={`py-1.5 px-3 font-heading font-bold text-[10px] tracking-wider uppercase ${
            value === o.value ? "bg-accent text-white" : "bg-bg2 text-text-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
