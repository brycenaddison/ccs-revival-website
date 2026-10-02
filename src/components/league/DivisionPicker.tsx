import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Picks one of several concurrent divisions on Standings, Teams and Stats. A local filter, so a
 * single-choice Toggle Group rather than tabs; hidden with one conf, where there is nothing to pick.
 * Labels come from `groupLabels`, so every page names a conf the same way.
 *
 * Callers hold the pick locally and must not call `setSelection`: that collapses `selectedConfs` to
 * the one conf, which hides this picker the instant it is used.
 */
export function DivisionPicker({ confs, selected, labels, onSelect }: {
  confs: readonly string[];
  selected: string | null;
  labels: ReadonlyMap<string, string>;
  onSelect: (conf: string) => void;
}) {
  if (confs.length < 2) return null;
  return (
    <ToggleGroup
      type="single"
      variant="pill"
      spacing={1}
      value={selected ?? ""}
      // Radix answers "" when the pressed item is pressed again; a division is always selected.
      onValueChange={conf => { if (conf) onSelect(conf); }}
      aria-label="Division"
      className="mb-4 flex-wrap"
    >
      {confs.map(conf => (
        <ToggleGroupItem key={conf} value={conf}>{labels.get(conf) ?? conf.toUpperCase()}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
