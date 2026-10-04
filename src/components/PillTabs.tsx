/**
 * The bordered pill switch used inside admin sections, where an underline strip would compete with
 * the section's own heading. Local state on the shared Toggle Group: an available choice stays
 * selected and takes the brand border, and arrow keys move between the choices.
 */

import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
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
  ...groupProps
}: {
  tabs: readonly PillTab<K>[];
  /** Null leaves the choices unselected when the saved value is unavailable. */
  selected: K | null;
  onSelect: (key: K) => void;
  /** Names the switch for assistive technology, such as "Schedule view". */
  label?: string;
} & Pick<ComponentProps<typeof ToggleGroup>, "disabled" | "aria-labelledby" | "aria-describedby" | "aria-invalid">) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={1.5}
      value={selected ?? ""}
      // Pressing the selected pill must not clear an existing choice.
      onValueChange={key => key && onSelect(key as K)}
      aria-label={label}
      className="flex-wrap"
      {...groupProps}
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
