/**
 * The lines between bracket cards.
 *
 * An SVG overlay, sized to the card canvas and sitting behind it, with one orthogonal path per edge.
 *
 * **Why not CSS pseudo-elements.** The classic `::before`/`::after` bracket trick only works for a
 * perfect binary tree, where a node's two feeders are its neighbours in the previous column. Even
 * with the drops left undrawn this is not that: columns are match days, so a winner can skip one
 * entirely, and the lower bracket sits below the upper with no structural relationship between the
 * rows. Those edges cannot be expressed as a border on the card they end at.
 *
 * **Why measure rather than compute.** Card heights differ — a played card carries two scores, a
 * pending one carries a kickoff line — so the anchor points are not derivable from a row index and a
 * pitch. Reading them back off the DOM is also what keeps the lines correct through a font swap or a
 * long team name wrapping.
 *
 * The overlay lives *inside* the scrolling content rather than over the scroll container, so
 * scrolling the strip sideways moves the lines with the cards and needs no recomputation at all.
 */

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { BracketEdge, BracketLayout } from "../../lib/bracketLayout";
import type { SlotSide } from "../../lib/api";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Vertical center of each slot row, in the same content coordinates as `y`.
   *
   * A line lands on the *row* it fills, not on the middle of the card, which is the difference
   * between "these two matches are connected somehow" and "this winner becomes that top seed". Read
   * off `[data-slot]` inside the card rather than derived from a header height this file would
   * otherwise have to know.
   */
  slot: Record<SlotSide, number>;
}

export interface CardMeasurer {
  /** Ref callback to hand each card, keyed by node id. */
  register: (node: number) => (el: HTMLDivElement | null) => void;
  /** Put this on the positioned wrapper the cards and the SVG share. */
  wrapRef: RefObject<HTMLDivElement | null>;
  boxes: Map<number, Box>;
  /**
   * Bottom edge of the lowest card, or 0 before the first measurement.
   *
   * The canvas is sized to this rather than to `rows × pitch`, so it contains its cards *exactly*
   * instead of approximately. The pitch is a safe over-estimate of a card's height by design; sizing
   * the container by it leaves dead space at the bottom, and — because the scroll container's
   * `overflow-y` is `auto` whether we ask for it or not — being wrong by even a fraction of a pixel
   * in the other direction is a scrollbar. Measuring settles both.
   */
  contentH: number;
}

export function useCardMeasurer(layout: BracketLayout): CardMeasurer {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<number, HTMLDivElement>());
  const [boxes, setBoxes] = useState<Map<number, Box>>(new Map());
  const [contentH, setContentH] = useState(0);

  // One callback per node, cached. A fresh closure each render is a *different* ref, so React would
  // detach and reattach every card on every render — which empties the map and refills it, and
  // means the observer below is watching elements that are no longer the ones being measured.
  const refs = useRef(new Map<number, (el: HTMLDivElement | null) => void>());
  const register = useCallback((node: number) => {
    let cb = refs.current.get(node);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) cards.current.set(node, el);
        else cards.current.delete(node);
      };
      refs.current.set(node, cb);
    }
    return cb;
  }, []);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const measure = () => {
      const origin = wrap.getBoundingClientRect();
      const next = new Map<number, Box>();
      let bottom = 0;
      for (const [node, el] of cards.current) {
        const r = el.getBoundingClientRect();
        // Relative to the wrapper, so the numbers are content coordinates and survive scrolling.
        const box = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
        const rowY = (side: SlotSide) => {
          const row = el.querySelector(`[data-slot="${side}"]`);
          // The card center is the honest fallback: a card with no slot rows is one whose markup
          // changed, and a line to the middle of it is wrong by a few pixels rather than by a card.
          if (!row) return box.y + box.h / 2;
          const rr = row.getBoundingClientRect();
          return rr.top - origin.top + rr.height / 2;
        };
        next.set(node, { ...box, slot: { top: rowY("top"), bottom: rowY("bottom") } });
        bottom = Math.max(bottom, box.y + box.h);
      }
      setBoxes(next);
      // Not `wrap.scrollHeight`: that is this element's own height read back off the DOM, which the
      // element is then resized to. Rounded up by even one pixel, the box no longer contains itself.
      setContentH(bottom);
    };

    measure();

    // Catches a window resize, a font finishing loading, and a card growing when its team name
    // arrives — all of which move the anchors without changing the layout object.
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    for (const el of cards.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);

  return { register, wrapRef, boxes, contentH };
}

/**
 * How far left of the target card the vertical run sits.
 *
 * Anchoring the turn to the *target* rather than to the midpoint is what draws the classic bracket
 * shape: both feeders of a match turn on the same x, so their verticals meet as one stroke into the
 * card instead of two lines converging at an angle. It also keeps a long edge — a winner skipping a
 * column — horizontal for as far as possible, so it crosses the column between at one predictable
 * height rather than cutting through it diagonally.
 */
const GUTTER = 22;

/** The elbow from one card's right edge to a slot row on another's left, with the corners rounded. */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y2 - y1) < 1) return `M ${x1} ${y1} H ${x2}`;

  const turn = Math.max(x2 - GUTTER, x1 + 6);
  const dir = Math.sign(y2 - y1);
  // Never round more than half the vertical run or half either horizontal one, or the two corners
  // would overlap and the path would double back on itself.
  const r = Math.min(9, Math.abs(y2 - y1) / 2, Math.abs(turn - x1), Math.abs(x2 - turn));

  return [
    `M ${x1} ${y1}`,
    `H ${turn - r}`,
    `Q ${turn} ${y1} ${turn} ${y1 + dir * r}`,
    `V ${y2 - dir * r}`,
    `Q ${turn} ${y2} ${turn + r} ${y2}`,
    `H ${x2}`,
  ].join(" ");
}

export function BracketConnectors({
  edges,
  boxes,
  width,
  height,
}: {
  edges: readonly BracketEdge[];
  boxes: Map<number, Box>;
  /** The canvas the caller laid out. **Not** read back off the DOM — see `contentH`. */
  width: number;
  height: number;
}) {
  // Before the first measurement every box is missing and every path would collapse onto the
  // origin, which reads as a scribble in the corner for one frame. Draw nothing instead.
  if (boxes.size === 0) return null;

  return (
    // `left-0 top-0` rather than `inset-0`: the width and height attributes define the coordinate
    // system, and stretching the element to the parent as well would be a second, silently
    // disagreeing answer the moment the two ever differ.
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      aria-hidden="true"
    >
      {edges.map(edge => {
        const from = boxes.get(edge.from);
        const to = boxes.get(edge.to);
        if (!from || !to) return null;

        return (
          <path
            key={`${edge.from}-${edge.to}-${edge.side}`}
            // Out of the middle of the source card, into the slot row it fills. Every edge here is
            // an advancement, so there is no second line style to distinguish — the drops are not
            // drawn at all.
            d={elbow(from.x + from.w, from.y + from.h / 2, to.x, to.slot[edge.side])}
            fill="none"
            // The path a team actually took lights up in that team's color; everything still
            // hypothetical stays a hairline in the border gray.
            stroke={edge.live ?? "var(--border2)"}
            strokeWidth={edge.live ? 2 : 1.5}
            strokeOpacity={edge.live ? 0.9 : 0.55}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
