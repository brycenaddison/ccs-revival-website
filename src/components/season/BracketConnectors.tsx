/**
 * The lines between bracket cards.
 *
 * An SVG overlay, sized to the card canvas and sitting behind it, with one orthogonal path per edge.
 *
 * **Why not CSS pseudo-elements.** The classic `::before`/`::after` bracket trick only works for a
 * perfect binary tree, where a node's two feeders are its neighbours in the previous column. This is
 * a general DAG: a node's winner goes one way and its loser goes another, feeders can be several
 * columns back, and a lower bracket crosses the upper one. Those edges cannot be expressed as a
 * border on the card they end at.
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

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardMeasurer {
  /** Ref callback to hand each card, keyed by node id. */
  register: (node: number) => (el: HTMLDivElement | null) => void;
  /** Put this on the positioned wrapper the cards and the SVG share. */
  wrapRef: RefObject<HTMLDivElement | null>;
  boxes: Map<number, Box>;
  size: { w: number; h: number };
}

export function useCardMeasurer(layout: BracketLayout): CardMeasurer {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<number, HTMLDivElement>());
  const [boxes, setBoxes] = useState<Map<number, Box>>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });

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
      for (const [node, el] of cards.current) {
        const r = el.getBoundingClientRect();
        // Relative to the wrapper, so the numbers are content coordinates and survive scrolling.
        next.set(node, { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
      }
      setBoxes(next);
      setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
    };

    measure();

    // Catches a window resize, a font finishing loading, and a card growing when its team name
    // arrives — all of which move the anchors without changing the layout object.
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    for (const el of cards.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);

  return { register, wrapRef, boxes, size };
}

/** The elbow from one card's right edge to another's left, with the corners rounded. */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y2 - y1) < 1) return `M ${x1} ${y1} H ${x2}`;

  const mid = (x1 + x2) / 2;
  const dir = Math.sign(y2 - y1);
  // Never round more than half the vertical run, or the two corners would overlap and the path
  // would double back on itself.
  const r = Math.min(8, Math.abs(y2 - y1) / 2, Math.abs(mid - x1), Math.abs(x2 - mid));

  return [
    `M ${x1} ${y1}`,
    `H ${mid - r}`,
    `Q ${mid} ${y1} ${mid} ${y1 + dir * r}`,
    `V ${y2 - dir * r}`,
    `Q ${mid} ${y2} ${mid + r} ${y2}`,
    `H ${x2}`,
  ].join(" ");
}

export function BracketConnectors({
  edges,
  boxes,
  size,
}: {
  edges: readonly BracketEdge[];
  boxes: Map<number, Box>;
  size: { w: number; h: number };
}) {
  // Before the first measurement every box is missing and every path would collapse onto the
  // origin, which reads as a scribble in the corner for one frame. Draw nothing instead.
  if (size.w === 0) return null;

  return (
    // `left-0 top-0` rather than `inset-0`: the width and height attributes define the coordinate
    // system, and stretching the element to the parent as well would be a second, silently
    // disagreeing answer the moment the two ever differ.
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={size.w}
      height={size.h}
      aria-hidden="true"
    >
      {edges.map(edge => {
        const from = boxes.get(edge.from);
        const to = boxes.get(edge.to);
        if (!from || !to) return null;

        return (
          <path
            key={`${edge.from}-${edge.to}-${edge.side}`}
            d={elbow(from.x + from.w, from.y + from.h / 2, to.x, to.y + to.h / 2)}
            fill="none"
            // The path a team actually took lights up in that team's colour; everything still
            // hypothetical stays a hairline in the border grey.
            stroke={edge.live ?? "var(--border2)"}
            strokeWidth={edge.live ? 2 : 1.5}
            strokeOpacity={edge.live ? 0.9 : 0.55}
            // A drop into the lower bracket is a genuinely different kind of edge from an
            // advancement, and dashing is the cheapest way to say so without a second colour axis.
            strokeDasharray={edge.output === "loser" ? "4 3" : undefined}
          />
        );
      })}
    </svg>
  );
}
