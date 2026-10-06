import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Conf codes are never empty, and Radix reserves "" for "nothing pressed". */
const ALL = "*";

/**
 * Picks one of several concurrent divisions on Standings, Teams, Stats and Predictions. A local
 * filter, so a single-choice Toggle Group rather than tabs; hidden with one conf, where there is
 * nothing to pick. Labels come from `groupLabels`, so every page names a conf the same way.
 *
 * `all` adds a leading item for every division, pressed while `selected` is null. Without it a
 * division is always selected.
 *
 * Callers hold the pick locally and must not call `setSelection`: that collapses `selectedConfs` to
 * the one conf, which hides this picker the instant it is used.
 */
export function DivisionPicker({ confs, selected, labels, onSelect, all }: {
  confs: readonly string[];
  selected: string | null;
  labels: ReadonlyMap<string, string>;
  onSelect: (conf: string) => void;
  all?: { label: string; onSelect: () => void };
}) {
  if (confs.length < 2) return null;
  return (
    <ToggleGroup
      type="single"
      variant="pill"
      spacing={1}
      value={selected ?? (all ? ALL : "")}
      // Radix answers "" when the pressed item is pressed again; something is always selected.
      onValueChange={value => {
        if (value === ALL) all?.onSelect();
        else if (value) onSelect(value);
      }}
      aria-label="Division"
      className="mb-4 flex-wrap"
    >
      {all && <ToggleGroupItem value={ALL}>{all.label}</ToggleGroupItem>}
      {confs.map(conf => (
        <ToggleGroupItem key={conf} value={conf}>{labels.get(conf) ?? conf.toUpperCase()}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
