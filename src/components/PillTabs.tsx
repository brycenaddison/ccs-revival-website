/**
 * The bordered pill switch used inside admin sections, where an underline strip would compete with
 * the section's own heading. Local state only, on the shared Toggle Group: one pill is always
 * selected and takes the brand border, and arrow keys move between them.
 */

import type { LucideIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface PillTab<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
}

export function PillTabs<K extends string>({
  tabs,
  selected,
  onSelect,
  label,
}: {
  tabs: readonly PillTab<K>[];
  selected: K;
  onSelect: (key: K) => void;
  /** Names the switch for assistive technology, such as "Schedule view". */
  label?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={1.5}
      value={selected}
      // Pressing the selected pill would otherwise empty the group; a view is always showing.
      onValueChange={key => key && onSelect(key as K)}
      aria-label={label}
      className="flex-wrap"
    >
      {tabs.map(({ key, label, icon: Icon }) => (
        <ToggleGroupItem key={key} value={key}>
          {Icon && <Icon size={13} aria-hidden="true" />}
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
