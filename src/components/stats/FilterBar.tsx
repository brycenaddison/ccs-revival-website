/**
 * The filter row every stats tab shares.
 *
 * Layout is a labeled grid rather than a toolbar because a bare row of selects gives the reader no
 * way to tell "Min Games" from "Team" until they open one.
 *
 * `LABEL_CLASS` is the site's caption style for text that names a group or a section rather than one
 * control; a label for a control is `ui/label.tsx`, which wears the same style.
 */

import { useId } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/cn";

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
  /** A set of controls (a pill row) rather than one: the caption names the group. */
  group?: boolean;
  children: React.ReactNode;
}

/**
 * One captioned filter. A single control sits inside the `<label>`, which names it without an id; a
 * pill row is a group named by its caption instead, since a label can name only one control.
 */
export function FilterField({ label, span, group, children }: FieldProps) {
  const id = useId();
  const style = span ? { gridColumn: `span ${span}` } : undefined;

  if (group) {
    return (
      <div role="group" aria-labelledby={id} style={style}>
        <span id={id} className={LABEL_CLASS}>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className="block min-w-0" style={style}>
      <span className={LABEL_CLASS}>{label}</span>
      {children}
    </label>
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
 * The stats filter pills, on the shared Toggle Group.
 *
 * Works for both single-select (role filter, direction) and multi-select (the Leaderboard's roles),
 * because it only asks the caller whether a value is active and reports which pill was pressed; it
 * holds no selection state of its own. Each pill is a toggle button with `aria-pressed`.
 */
export function PillGroup({ options, isActive, onSelect, stretch }: PillGroupProps) {
  const value = options.filter(o => isActive(o.value)).map(o => o.value);

  return (
    <ToggleGroup
      type="multiple"
      variant="pill"
      size="xs"
      spacing={1}
      value={value}
      onValueChange={next => {
        // The one pill whose state changed, whichever direction it changed in.
        const pressed = options.find(o => next.includes(o.value) !== value.includes(o.value));
        if (pressed) onSelect(pressed.value);
      }}
      className={cn("flex-wrap", stretch && "w-full flex-nowrap")}
    >
      {options.map(o => (
        <ToggleGroupItem key={o.value} value={o.value} className={cn("tracking-wide", stretch && "flex-1 px-1")}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
