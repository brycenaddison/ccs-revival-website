/**
 * The brand-underlined tab strip: an underline rail with the selected tab filled.
 *
 * Two modes, chosen by whether the entries carry `to`:
 *
 *  - **Link mode** for tabs that are URLs (the game viewer, the predictions hub). Real navigation
 *    uses `Link` with `aria-current="page"`, never tablist semantics (`AGENTS.md`).
 *  - **Button mode** for local state (a match's Preview and Results, a season's phases), with
 *    `aria-current="true"` on the selected button.
 *
 * Hidden with fewer than two entries: a strip with one tab is noise.
 *
 * `overflow-y-hidden` is load-bearing. Setting `overflow-x` to anything but `visible` makes
 * `overflow-y` compute to `auto`, so the strip is a vertical scroll container too, and a couple of
 * pixels of overflow put a scrollbar on a single row of tabs. The strip scrolls sideways rather than
 * wrapping because its entries are ordered, and `shrink-0` keeps a long label from squeezing its
 * neighbors instead of overflowing.
 */

import type { ReactNode } from "react";
import { Link, type To } from "react-router-dom";

export interface UnderlineTab<K extends string | number> {
  key: K;
  label: ReactNode;
  /** Link mode. Every entry in a strip either has one or none does. */
  to?: To;
}

const RAIL = "mb-4 flex flex-nowrap overflow-x-auto overflow-y-hidden border-b-2 border-brand";
const TAB = "inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-none bg-transparent px-4 py-2.5 font-heading text-[13px] no-underline";
const SELECTED = "border-b-2 border-b-brand bg-bg-input text-text-bright";
const IDLE = "border-b-2 border-b-transparent text-text-muted hover:text-text-bright";

export function UnderlineTabs<K extends string | number>({
  tabs,
  selected,
  onSelect,
  label,
  replace,
}: {
  tabs: readonly UnderlineTab<K>[];
  selected: K;
  /** Button mode. */
  onSelect?: (key: K) => void;
  /** Link mode's `nav` label, e.g. "Game views". */
  label?: string;
  /** Link mode: switch tabs without adding history, so one Back press leaves the page. */
  replace?: boolean;
}) {
  if (tabs.length < 2) return null;

  if (tabs.every(tab => tab.to !== undefined)) {
    return (
      <nav aria-label={label} className={RAIL}>
        {tabs.map(tab => (
          <Link
            key={tab.key}
            to={tab.to!}
            replace={replace}
            aria-current={tab.key === selected ? "page" : undefined}
            className={`${TAB} ${tab.key === selected ? SELECTED : IDLE}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <div className={RAIL}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect?.(tab.key)}
          aria-current={tab.key === selected ? "true" : undefined}
          className={`${TAB} ${tab.key === selected ? SELECTED : IDLE}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
