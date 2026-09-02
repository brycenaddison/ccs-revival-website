/**
 * The Bars view: pick one statistic, see the field ranked on it.
 *
 * A table answers "what are this row's numbers?"; bars answer "who leads this, and by how much?" —
 * a question a column of monospace figures makes the reader do arithmetic for.
 *
 * The caller passes the *active stat group's* cells rather than the whole catalog, so the picker
 * lists five to ten stats instead of forty and the group pills mean the same thing in both views.
 *
 * Stat and direction are owned by the caller, not held here: they are selections, and switching to the
 * Table view and back should not silently reset them.
 */

import { useMemo } from "react";
import { dec } from "../../lib/statFormat";
import type { FlatStatCell } from "../../lib/statGroups";
import { rampColor } from "../../lib/statUi";
import { BarLeaderboard, type BarLeaderboardRow } from "./BarLeaderboard";
import { CONTROL_CLASS, Field, FilterBar, PillGroup } from "./FilterBar";

export type BarDirection = "highest" | "lowest" | "all";

const DIRECTIONS: readonly { value: string; label: string }[] = [
  { value: "highest", label: "▲ Top" },
  { value: "lowest", label: "▼ Bottom" },
  { value: "all", label: "All" },
];

const TOP_N = 10;

/**
 * Which end of a stat to open on.
 *
 * `lowerIsBetter` has been declared on the deaths, ban-turn and objectives-given cells since the
 * catalog was written and read by nothing. Opening "Deaths / Game" on the top ten is showing the
 * reader the worst players and calling it a leaderboard, so it decides the default here.
 */
export function defaultDirection<T>(cell: FlatStatCell<T> | undefined): BarDirection {
  return cell?.lowerIsBetter ? "lowest" : "highest";
}

interface Props<T> {
  /** Plural subject, sentence case — "Champions", "Teams", "Players". */
  subject: string;
  rows: readonly T[];
  /** The active group's numeric cells. */
  catalog: readonly FlatStatCell<T>[];
  statKey: string;
  /** Receives the suggested direction for the new stat alongside it; the caller decides whether to take it. */
  onStatKey: (key: string, suggested: BarDirection) => void;
  direction: BarDirection;
  onDirection: (d: BarDirection) => void;
  rowMeta: (row: T) => Omit<BarLeaderboardRow, "value" | "display">;
  /**
   * Where a bar's color comes from.
   *
   * `"brand"` uses the color the row supplies — teams and players have one, and brand recognition
   * beats any palette we could invent. `"value"` places the row on the ramp instead, for champions,
   * which have no identity color at all and would otherwise all be one flat hue.
   */
  colorBy?: "brand" | "value";
  isMobile: boolean;
  /** Size of the pool the rows were drawn from, for the "10 of 84" badge. Defaults to `rows.length`. */
  poolSize?: number;
  note?: string;
  selectedKeys?: readonly string[];
  selectColors?: readonly string[];
  onSelect?: (key: string) => void;
}

export function StatBars<T>({
  subject,
  rows,
  catalog,
  statKey,
  onStatKey,
  direction,
  onDirection,
  rowMeta,
  colorBy = "brand",
  isMobile,
  poolSize,
  note,
  selectedKeys,
  selectColors,
  onSelect,
}: Props<T>) {
  const cell = catalog.find(c => c.key === statKey) ?? catalog[0];
  const groups = useMemo(() => [...new Set(catalog.map(c => c.group))], [catalog]);

  const ranked = useMemo<BarLeaderboardRow[]>(() => {
    const read = cell?.value;
    if (!read) return [];
    const format = cell.format ?? dec(2);

    const pairs = rows.flatMap(row => {
      const v = read(row);
      // A row that doesn't report this stat is left out rather than drawn as a zero-length bar,
      // which would read as "worst" instead of "unknown".
      return v === null ? [] : [{ row, v }];
    });

    // Explicit comparator rather than subtraction: a deathless KDA is Infinity, and Infinity minus
    // Infinity is NaN, which makes the sort order undefined once two rows are both deathless.
    const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
    pairs.sort((x, y) => (direction === "lowest" ? cmp(x.v, y.v) : cmp(y.v, x.v)));
    const shown = direction === "all" ? pairs : pairs.slice(0, TOP_N);

    // The ramp spans the rows actually on screen, so the full palette gets used instead of being
    // compressed by outliers that were sliced off. Infinity clamps to the top of the range.
    let min = Infinity;
    let max = -Infinity;
    for (const { v } of shown) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = Number.isFinite(min) && max > min ? max - min : 0;

    return shown.map(({ row, v }) => {
      const meta = rowMeta(row);
      if (colorBy === "brand") return { ...meta, value: v, display: format(v) };
      // Everyone tied reads as everyone leading, not as everyone failing.
      const goodness = span === 0 ? 1 : (Math.min(Math.max(v, min), max) - min) / span;
      return {
        ...meta,
        value: v,
        display: format(v),
        color: rampColor(cell.lowerIsBetter ? 1 - goodness : goodness),
        // A ramp color says how good the value is; running it into a team's secondary would say
        // something else halfway along the bar.
        colorEnd: undefined,
      };
    });
  }, [rows, cell, direction, rowMeta, colorBy]);

  const pool = poolSize ?? rows.length;
  const scope =
    direction === "all" ? `All ${subject.toLowerCase()}` : direction === "lowest" ? `Bottom ${TOP_N}` : `Top ${TOP_N}`;
  const heading = `${scope} · ${cell?.label ?? ""}`;

  /**
   * Gold, silver and bronze only when the first rows really are the leaders.
   *
   * "Bottom 10" of a higher-is-better stat puts the worst row first, and handing it a gold numeral
   * says the opposite of what the view is showing. The medals belong to whichever end of the stat is
   * actually good — the low end for a `lowerIsBetter` cell, the high end otherwise.
   */
  const showsLeaders = direction !== "all" && (direction === "lowest") === Boolean(cell?.lowerIsBetter);

  return (
    <div>
      <FilterBar isMobile={isMobile} columns={2}>
        <Field label="Stat">
          <select
            value={statKey}
            onChange={e => onStatKey(e.target.value, defaultDirection(catalog.find(c => c.key === e.target.value)))}
            className={CONTROL_CLASS}
          >
            {groups.length > 1
              ? groups.map(g => (
                  <optgroup key={g} label={g}>
                    {catalog
                      .filter(c => c.group === g)
                      .map(c => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                  </optgroup>
                ))
              : catalog.map(c => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
          </select>
        </Field>

        <Field label="Show">
          <PillGroup
            options={DIRECTIONS}
            isActive={v => v === direction}
            onSelect={v => onDirection(v as BarDirection)}
            stretch
          />
        </Field>
      </FilterBar>

      <BarLeaderboard
        title={heading}
        rows={ranked}
        badge={`${ranked.length} of ${pool} shown`}
        note={note}
        isMobile={isMobile}
        medals={showsLeaders}
        emptyMessage={`No ${subject.toLowerCase()} match these filters, or none report ${cell?.label ?? "this stat"}.`}
        selectedKeys={selectedKeys}
        selectColors={selectColors}
        onSelect={onSelect}
      />
    </div>
  );
}
