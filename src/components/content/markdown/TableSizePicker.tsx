import { useId, useRef, useState } from "react";
import { ACTION, ACTION_PRIMARY } from "../../admin/adminUi";
import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, type TableSize } from "./commands";

/** Shared by the toolbar and context menu through the editor's insertion popover. */
export function TableSizePicker({ onInsert, onCancel }: {
  onInsert: (size: TableSize) => void;
  onCancel: () => void;
}) {
  const [size, setSize] = useState<TableSize>({ columns: 2, rows: 3 });
  const grid = useRef<HTMLDivElement>(null);
  const hintId = useId();
  return (
    <div className="space-y-3">
      <p className="font-semibold text-text-bright">Insert table</p>
      <p aria-live="polite" aria-atomic="true" className="text-text-secondary">
        {size.columns} {size.columns === 1 ? "column" : "columns"} × {size.rows} {size.rows === 1 ? "row" : "rows"}
      </p>
      <div ref={grid} role="grid" aria-label="Table size" aria-describedby={hintId}
        aria-rowcount={TABLE_MAX_ROWS} aria-colcount={TABLE_MAX_COLUMNS} aria-multiselectable="true" className="space-y-1">
        {Array.from({ length: TABLE_MAX_ROWS }, (_, r) => {
          const rows = r + 1;
          return <div key={rows} role="row" className="grid grid-cols-8 gap-1">
            {Array.from({ length: TABLE_MAX_COLUMNS }, (_, c) => {
              const columns = c + 1;
              const selected = columns <= size.columns && rows <= size.rows;
              return <button key={columns} type="button" role="gridcell"
                aria-label={`${columns} ${columns === 1 ? "column" : "columns"}, ${rows} ${rows === 1 ? "row" : "rows"}`}
                aria-selected={selected} aria-colindex={columns} aria-rowindex={rows}
                data-columns={columns} data-rows={rows}
                tabIndex={columns === size.columns && rows === size.rows ? 0 : -1}
                className={`aspect-square min-w-0 cursor-pointer rounded-sm border outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover ${selected ? "border-brand bg-brand/20" : "border-border bg-bg3"}`}
                onPointerEnter={event => { if (event.pointerType === "mouse") setSize({ columns, rows }); }}
                onFocus={() => setSize({ columns, rows })}
                onClick={() => onInsert({ columns, rows })}
                onKeyDown={event => {
                  let next = { columns, rows };
                  switch (event.key) {
                    case "ArrowLeft": next.columns--; break;
                    case "ArrowRight": next.columns++; break;
                    case "ArrowUp": next.rows--; break;
                    case "ArrowDown": next.rows++; break;
                    case "Home": next = { columns: 1, rows: event.ctrlKey ? 1 : rows }; break;
                    case "End": next = { columns: TABLE_MAX_COLUMNS, rows: event.ctrlKey ? TABLE_MAX_ROWS : rows }; break;
                    default: return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  next = { columns: Math.max(1, Math.min(TABLE_MAX_COLUMNS, next.columns)), rows: Math.max(1, Math.min(TABLE_MAX_ROWS, next.rows)) };
                  grid.current?.querySelector<HTMLButtonElement>(`[data-columns="${next.columns}"][data-rows="${next.rows}"]`)?.focus();
                }} />;
            })}
          </div>;
        })}
      </div>
      <p id={hintId} className="text-xs text-text-secondary">First row is the header. Choose a cell, or use arrow keys and Enter.</p>
      <div className="flex gap-2">
        <button type="button" className={ACTION_PRIMARY} onClick={() => onInsert(size)}>Insert table</button>
        <button type="button" className={ACTION} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
