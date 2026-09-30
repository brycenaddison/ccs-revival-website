/**
 * The bordered pill switch used inside admin sections, where an underline strip would compete with
 * the section's own heading. Local state only; the selected pill takes the brand border.
 */

import type { LucideIcon } from "lucide-react";

export interface PillTab<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
}

const PILL =
  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 bg-transparent font-heading text-xs text-text-bright cursor-pointer hover:bg-accent";

export function PillTabs<K extends string>({
  tabs,
  selected,
  onSelect,
}: {
  tabs: readonly PillTab<K>[];
  selected: K;
  onSelect: (key: K) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          aria-current={key === selected ? "true" : undefined}
          className={`${PILL} ${key === selected ? "border-brand" : "border-border"}`}
        >
          {Icon && <Icon size={13} aria-hidden="true" />}
          {label}
        </button>
      ))}
    </div>
  );
}
