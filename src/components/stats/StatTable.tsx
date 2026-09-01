/**
 * The sortable, row-expandable stat table shared by all three stats tabs.
 *
 * Rows arrive pre-sorted. The caller sorts because it also feeds the same ordering to its bar view, and
 * because the default order is not always a column.
 *
 * ## Layout
 *
 * `table-fixed`, with explicit widths on the compare, caret and name columns and **no width on the stat
 * columns**. Under fixed layout the leftover space is divided equally among unsized columns, so the stat
 * cells stay equal to one another and fill the row.
 *
 * Auto layout was wrong here: it sizes columns to content *and then distributes slack in proportion*, so
 * the widest column got wider still — a "Damage Share" header ended up several times the width of its
 * four-character values while the rest of the row was cramped. Pinning the stat columns to a fixed width
 * fixed that but overcorrected, leaving a dead strip beside a narrow group.
 *
 * `minWidth` keeps a wide group (Teamfight has ten cells on top of four anchors) from crushing: past that
 * point the wrapper scrolls horizontally instead.
 *
 * The expand caret gets its own fixed-width column, ahead of the name. It used to trail the name, where
 * a three-letter team code and a fourteen-letter champion put it at a different offset on every row.
 */

import { Fragment, useEffect, useRef, useState } from "react";
import { cellText, type StatCell } from "../../lib/statGroups";

/** Fixed column widths, in px. */
const LEADING_W = 82;
const CARET_W = 28;
const NAME_W = 230;
const NAME_W_MOBILE = 150;

/** Narrowest a stat column may be squeezed to before the table starts scrolling instead. */
const MIN_STAT_W = 78;

interface Props<T> {
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  /** Anchor columns plus the active group's cells, assembled by the caller. */
  columns: readonly StatCell<T>[];
  nameHeader: string;
  /** Sort key the name column reports. Defaults to `"name"`. */
  nameSortKey?: string;
  renderName: (row: T) => React.ReactNode;
  /** Omit to get a plain table with no caret column and no click-to-expand. */
  renderExpanded?: (row: T) => React.ReactNode;
  /**
   * A leading cell for a per-row control that isn't a statistic — the compare toggle.
   *
   * Anything interactive in here must stop propagation, or clicking it also expands the row.
   */
  renderLeading?: (row: T) => React.ReactNode;
  leadingHeader?: string;
  sortKey: string;
  sortDir: 1 | -1;
  onSort: (key: string) => void;
  expandedKey: string | number | null;
  onExpand: (key: string | number | null) => void;
  isMobile?: boolean;
  caption?: React.ReactNode;
}

export function StatTable<T>({
  rows,
  rowKey,
  columns,
  nameHeader,
  nameSortKey = "name",
  renderName,
  renderExpanded,
  renderLeading,
  leadingHeader,
  sortKey,
  sortDir,
  onSort,
  expandedKey,
  onExpand,
  isMobile = false,
  caption,
}: Props<T>) {
  const arrow = (key: string) => (sortKey === key ? (sortDir === -1 ? " ▼" : " ▲") : "");
  const expandable = Boolean(renderExpanded);
  const nameWidth = isMobile ? NAME_W_MOBILE : NAME_W;

  /**
   * Width of the visible scroll window, so an expanded row can be sized to it.
   *
   * A detail row is a `td` spanning the whole table, and the table is often wider than the screen — so
   * reading the expansion meant scrolling sideways through it, which is miserable on a phone and pointless
   * when the content is label/value pairs that would happily fit. Sizing the detail to the *window* and
   * pinning it with `position: sticky` keeps it in view no matter where the row above it is scrolled to.
   *
   * Measured rather than assumed: it's a fraction of the viewport that depends on page padding and the
   * content column's max width, and it changes on rotate.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWindowWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The point past which the table stops fitting and starts scrolling.
  const minWidth =
    (renderLeading ? LEADING_W : 0) + (expandable ? CARET_W : 0) + nameWidth + columns.length * MIN_STAT_W;

  const span = columns.length + 1 + (expandable ? 1 : 0) + (renderLeading ? 1 : 0);

  return (
    <>
      <div ref={scrollRef} className="overflow-x-auto rounded-md">
        <table className="w-full table-fixed border-collapse bg-bg2 text-sm" style={{ minWidth }}>
          <thead>
            <tr className="bg-bg3 text-[10px] text-text-secondary uppercase tracking-wider">
              {renderLeading && (
                <th className="text-center py-2.5 px-2" style={{ width: LEADING_W }}>
                  {leadingHeader ?? ""}
                </th>
              )}
              {expandable && <th style={{ width: CARET_W }} aria-hidden="true" />}
              <th
                onClick={() => onSort(nameSortKey)}
                style={{ width: nameWidth }}
                className={`text-left py-2.5 px-3 cursor-pointer select-none ${
                  sortKey === nameSortKey ? "text-brand font-bold" : ""
                }`}
              >
                {nameHeader}
                {arrow(nameSortKey)}
              </th>
              {columns.map(c => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  title={c.label}
                  className={`text-center py-2.5 px-2 cursor-pointer select-none truncate ${
                    sortKey === c.key ? "text-brand font-bold" : ""
                  }`}
                >
                  {/* `short` exists because several labels are written for the bar view's select, where
                      there is no column header for context — "Share of Team Deaths" is right there and
                      far too wide here. */}
                  {c.short ?? c.label}
                  {arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const key = rowKey(row);
              const open = expandedKey === key;
              return (
                // A row and its detail row are siblings, so the key belongs on the Fragment that
                // wraps them — the shorthand `<>` cannot carry one.
                <Fragment key={key}>
                  <tr
                    onClick={expandable ? () => onExpand(open ? null : key) : undefined}
                    className={`border-t border-border ${expandable ? "hover:bg-bg3 cursor-pointer" : ""}`}
                  >
                    {renderLeading && (
                      <td className="text-center py-2.5 px-2" style={{ width: LEADING_W }}>
                        {renderLeading(row)}
                      </td>
                    )}
                    {expandable && (
                      <td className="pl-3 align-middle" style={{ width: CARET_W }}>
                        <span className="text-text-dim text-[9px]">{open ? "▲" : "▼"}</span>
                      </td>
                    )}
                    <td className="py-2.5 px-3 overflow-hidden" style={{ width: nameWidth }}>
                      {renderName(row)}
                    </td>
                    {columns.map(cell => (
                      <td key={cell.key} className="text-center py-2.5 px-2 font-mono text-xs">
                        {cellText(cell, row)}
                      </td>
                    ))}
                  </tr>

                  {open && renderExpanded && (
                    <tr className="border-t border-bg3 bg-bg3/40">
                      <td colSpan={span} className="p-0">
                        {/* Sized to the scroll window and pinned to its left edge, so the detail never
                            needs horizontal scrolling even when the row above it does. */}
                        <div
                          className="sticky left-0 px-3 py-3.5"
                          style={{ width: windowWidth || undefined }}
                        >
                          {renderExpanded(row)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {caption && <div className="mt-2 text-xs text-text-dim">{caption}</div>}
    </>
  );
}

/**
 * The full stat line, every group at once — what a row expands into.
 *
 * Shared so the Champions, Teams and Leaderboard detail views agree on layout; each tab adds its own
 * header above it (best player on a champion, a team's starters).
 */
export function StatGroupDetail<T>({
  groups,
  row,
  isMobile,
}: {
  groups: readonly { id: string; label: string; cells: readonly StatCell<T>[] }[];
  row: T;
  isMobile: boolean;
}) {
  return (
    // Two columns on a phone rather than one. A group at full width stretches each label/value pair the
    // width of the screen, leaving the labels stranded on the left and the numbers on the right with a
    // void between them; halving the column width pulls the pair back together.
    <div
      className="grid gap-x-4 gap-y-3"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 130 : 190}px, 1fr))` }}
    >
      {groups.map(g => (
        <div key={g.id}>
          <div className="font-heading text-[10px] font-semibold tracking-wider uppercase text-brand mb-1">
            {g.label}
          </div>
          {g.cells.map(cell => (
            <div
              key={cell.key}
              className="flex justify-between items-baseline gap-2 py-0.5 border-b border-bg3 last:border-b-0"
            >
              <span className="text-[10px] text-text-secondary truncate">{cell.label}</span>
              <span className="font-mono text-[11px] text-text shrink-0">{cellText(cell, row)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
