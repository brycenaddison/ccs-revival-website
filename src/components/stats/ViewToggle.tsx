/**
 * Switches a stats tab between its presentations.
 *
 * Lifted out of `pages/Stats.tsx`, where it used to be a boolean Cards/Table switch owned by the page.
 * The page owning it was the reason flipping views threw away your filters: the two branches were
 * different components, so the panel unmounted. Each panel now holds its own view state and renders
 * this in the group switcher's trailing slot, and the selection survives.
 */

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
    // A segmented pair: one item is always on, so pressing the selected one changes nothing.
    <ToggleGroup
      type="single"
      variant="pill"
      size="xs"
      value={value}
      onValueChange={next => next && onChange(next as V)}
      aria-label="View"
    >
      {options.map(o => (
        <ToggleGroupItem key={o.value} value={o.value} className="text-[10px] tracking-normal not-first:border-l-0">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
