/**
 * A bracket phase, drawn as a bracket.
 *
 * Two renderers, and the split is by axis rather than by size. On a wide screen the layout is the
 * *graph*: a column per match day, each card placed at the vertical center of the matches feeding
 * it, and a line along every advancement. On a narrow one it is a *list*: one section per match day,
 * full-width cards, no lines — because a graph you can see 1.2 columns of at a time is unreadable,
 * and connectors between stacked full-width cards are worse than none.
 *
 * Nothing is lost in the narrow view, and nothing is lost by the drops going undrawn in the wide one
 * either. What a line would say is also written on every unresolved slot as "Winner of Semifinal 1",
 * which is exactly why that fallback in `sideProvenance` matters.
 *
 * `slotControl` is the seam the League Admin bracket hangs off. Given one, this is the same bracket
 * with a team picker in each entry slot rather than a second layout to keep in sync.
 */

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BracketMatchCard } from "./BracketMatchCard";
import { BracketConnectors, useCardMeasurer } from "./BracketConnectors";
import { ScrollRail } from "../ScrollRail";
import { useDragScroll } from "../../hooks/useDragScroll";
import { bracketLayout, type BracketLayout } from "../../lib/bracketLayout";
import { fmtDay } from "../../lib/utils";
import type { SeasonBracketMatch, SeasonBracketPhase, SeasonBracketSide, SlotSide } from "../../lib/api";

interface Props {
  phase: SeasonBracketPhase;
  conf: string;
  isMobile: boolean;
  /**
   * Replaces the team/provenance area of a slot row. Return null to leave the row as it reads to a
   * viewer — which is what a derived slot should do even in an editor.
   */
  slotControl?: (slot: SlotSide, side: SeasonBracketSide, match: SeasonBracketMatch) => ReactNode | null;
  /**
   * Override the row unit, in pixels. Only needed when `slotControl` makes the cards taller than a
   * viewer's ever get — the layout guarantees a full unit between cards in a column, so this is what
   * keeps two of them apart.
   */
  rowPitch?: number;
  /**
   * Whether a bracket too wide for its column may take the whole window.
   *
   * **Only when it has to.** A bracket that fits stays in the content column, because the margins
   * are there for reading comfort and a group table or a four-card gauntlet is easier to read with
   * them. A bracket that does not fit has already lost that argument: the space is not carrying
   * anything, and spending it on travel is strictly better than making someone scroll past it.
   *
   * False inside a bordered panel, where reaching past the container means reaching outside the
   * card the content belongs to.
   */
  bleed?: boolean;
}

/**
 * Desktop geometry, in pixels.
 *
 * The row pitch is the unit `BracketNodeLayout.y` counts in, and the layout only guarantees a full
 * unit between two cards in a column — so it has to clear the tallest card a match can produce. For
 * a viewer that height is bounded: team names truncate rather than wrap, and the score and the
 * kickoff line never both appear. An editor's cards are taller, which is what `rowPitch` is for. The
 * canvas itself is *measured* rather than derived from this, so an over-estimate costs spacing
 * between rows and nothing else.
 */
const DEFAULT_ROW_PITCH = 150;
const COLUMN_W = 304;
const COLUMN_GAP = 40;
/** Room for the round heading above row 0. */
const HEADER_H = 46;
/**
 * The page's own margins, measured, when a bracket has broken out of its column.
 *
 * Null while it fits, which is the signal that no breakout is in effect.
 */
interface Gutters {
  left: number;
  right: number;
}

/** The day a column is played on, from the earliest kickoff on it. Empty when none is pinned yet. */
function columnDate(matches: readonly SeasonBracketMatch[]): string {
  const times = matches.map(m => m.scheduledAt).filter((t): t is string => t !== null);
  if (times.length === 0) return "";
  return fmtDay(times.reduce((a, b) => (a < b ? a : b)));
}

export function BracketPhaseView({
  phase,
  conf,
  isMobile,
  slotControl,
  rowPitch = DEFAULT_ROW_PITCH,
  bleed = true,
}: Props) {
  const layout = useMemo(() => {
    const built = bracketLayout(phase);
    // A dangling source only survives a delete, so it means the bracket upstream is not what it
    // should be. Said here and nowhere else: a reader cannot act on it, and the layout degrades on
    // its own — the affected nodes just lose their connectors.
    if (import.meta.env.DEV && built.dangling.length > 0) {
      console.warn(
        `[bracket] ${conf} phase ${phase.id} (${phase.name}): sources not in this phase:`,
        built.dangling.join(", "),
      );
    }
    return built;
  }, [phase, conf]);

  const empty = layout.columns.every(c => c.length === 0);

  if (empty) {
    return <div className="py-10 text-center text-[13px] text-text-dim">The bracket hasn&rsquo;t been drawn yet.</div>;
  }

  if (isMobile) {
    return (
      <div className="flex flex-col gap-5">
        {layout.columns
          .filter(column => column.length > 0)
          .map(column => (
            <div key={column[0].matchDay}>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="font-display text-[15px] text-text-bright">
                  Round {column[0].matchDay}
                </span>
                <span className="text-[10px] text-text-dim">
                  {columnDate(column.map(n => n.match))}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {column.map(placed => (
                  <BracketMatchCard
                    key={placed.node}
                    match={placed.match}
                    terminal={placed.terminal}
                    layout={layout}
                    conf={conf}
                    slotControl={slotControl}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
    );
  }

  return (
    <>
      <BracketCanvas
        layout={layout}
        conf={conf}
        rowPitch={rowPitch}
        slotControl={slotControl}
        bleed={bleed}
      />

      <div className="mt-3 flex items-center gap-4 text-[10px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="22" height="2" aria-hidden="true">
            <line x1="0" y1="1" x2="22" y2="1" stroke="var(--border2)" strokeWidth="2" />
          </svg>
          Winner advances
        </span>
        {/* Drops have no line — see the module header on `bracketLayout`. This is what says so. */}
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-text-dim">↓</span>
          Arrived by losing an earlier match
        </span>
      </div>
    </>
  );
}

/**
 * The scrolling canvas, and the only thing that measures.
 *
 * Its own component so the measurement is tied to *mounting* rather than to the layout object.
 * Crossing the mobile breakpoint attaches a wrapper that was not there before, and an effect keyed
 * on the layout would not re-run for it — the cards would be positioned and no line would be drawn.
 */
function BracketCanvas({
  layout,
  conf,
  rowPitch,
  slotControl,
  bleed,
}: {
  layout: BracketLayout;
  conf: string;
  rowPitch: number;
  slotControl: Props["slotControl"];
  bleed: boolean;
}) {
  const measurer = useCardMeasurer(layout);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [gutters, setGutters] = useState<Gutters | null>(null);

  const width =
    layout.columns.length * COLUMN_W + Math.max(0, layout.columns.length - 1) * COLUMN_GAP;
  // Measured once the cards exist, so the canvas contains them exactly; the analytic value is the
  // first-paint stand-in and is a deliberate over-estimate.
  const height = measurer.contentH > 0 ? measurer.contentH : HEADER_H + layout.rows * rowPitch;

  /*
   * The page's side margins, when the bracket is wide enough to want them.
   *
   * Measured off the *frame*, which is the thing that stays where the page put it — the scroller
   * itself is what moves, so measuring that would read back a number this effect had just written
   * and never settle. The frame's box does not change when its child grows negative margins, so the
   * observer below cannot loop.
   *
   * `documentElement.clientWidth` rather than `innerWidth`: it excludes the vertical scrollbar, and
   * a breakout computed against a width the page does not actually have is a horizontal scrollbar on
   * the whole document.
   */
  useLayoutEffect(() => {
    if (!bleed) {
      setGutters(null);
      return;
    }
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const rect = frame.getBoundingClientRect();
      if (width <= rect.width) {
        // It fits. Stay in the column — the margins are doing their job.
        setGutters(null);
        return;
      }
      setGutters({
        left: Math.max(0, rect.left),
        right: Math.max(0, document.documentElement.clientWidth - rect.right),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [bleed, width]);

  useDragScroll(scrollRef);

  /*
   * Take the whole window, then put the margins back as *canvas*, not as container padding.
   *
   * The scroller spans the window edge to edge, so the scrollbar does too and nothing is ever cut off
   * at some inset that reads as a black strip. Inside it, the first column starts `left` in and the
   * last ends `right` in — the same offsets the page gives the heading and the tab strip. So at rest
   * the bracket lines up with everything above it and runs off the right of the screen; scrolled all
   * the way over, its last column lands under the right end of the tab strip's rule and the early
   * rounds have gone off the left. The gutters are spent on travel rather than on stationary bars.
   *
   * Baked into the canvas as width and an offset rather than set as CSS padding on the scroller:
   * trailing padding on a horizontal scroll container has a long history of being dropped from the
   * scrollable overflow, which would silently cost the right-hand alignment.
   */
  const padL = gutters?.left ?? 0;
  const padR = gutters?.right ?? 0;
  const canvasW = padL + width + padR;

  /*
   * A strip that scrolls sideways, not a wrapping grid. A bracket reads left to right — day 1 feeds
   * day 2 — and wrapping day 3 onto a second row breaks the one spatial cue the layout has.
   *
   * The native scrollbar is hidden and `ScrollRail` below draws one in the content column instead. A
   * native horizontal bar spans its container's padding box and cannot be inset, and this container
   * is deliberately as wide as the window — so the bar would run the full width with the bracket's
   * gutters empty beneath it. The rail is a real control, not a decoration; scrolling itself is
   * untouched and still native.
   *
   * `overflow-y-hidden` is not belt-and-braces. Setting `overflow-x` to anything but `visible` makes
   * `overflow-y` compute to `auto`, so this is a vertical scroll container whether we want one or
   * not — and it wants one the moment the child is a pixel taller than its own box. The child's
   * height is measured from the cards it contains, so it never legitimately is.
   */
  return (
    <div ref={frameRef}>
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={gutters ? { marginLeft: -padL, marginRight: -padR } : undefined}
      >
        {/*
          Absolute positioning, not a flex column per round.

          A bracket's vertical axis carries meaning — a semifinal belongs level with the midpoint of
          the two quarterfinals feeding it — and an evenly-stacked column throws that away, leaving
          the connectors to do work the placement should have done. `y` is fractional for exactly
          this, so the cards go where it says and the lines follow.
        */}
        <div ref={measurer.wrapRef} className="relative" style={{ width: canvasW, height }}>
          {/*
            First in the DOM so the cards paint over it. Every sibling here is positioned, so paint
            order is DOM order — which is the whole reason this can be a plain sibling instead of
            needing a z-index.
          */}
          <BracketConnectors
            edges={layout.edges}
            boxes={measurer.boxes}
            width={canvasW}
            height={height}
          />

          {layout.columns.map((column, index) => (
            <div
              key={`head-${index}`}
              className="absolute top-0"
              style={{ left: padL + index * (COLUMN_W + COLUMN_GAP), width: COLUMN_W }}
            >
              <div className="font-display text-[14px] text-text-bright">
                Round {column[0]?.matchDay ?? index + 1}
              </div>
              {/* The date, not the season day: that number is an internal ordinal, and a reader
                  seeing "Day 14" next to "Round 4" reads it as a contradiction. */}
              <div className="text-[10px] text-text-dim">{columnDate(column.map(n => n.match))}</div>
            </div>
          ))}

          {layout.columns.flat().map(placed => (
            <div
              key={placed.node}
              className="absolute"
              style={{
                left: padL + placed.column * (COLUMN_W + COLUMN_GAP),
                top: HEADER_H + placed.y * rowPitch,
                width: COLUMN_W,
              }}
            >
              <BracketMatchCard
                match={placed.match}
                terminal={placed.terminal}
                layout={layout}
                conf={conf}
                measureRef={measurer.register(placed.node)}
                slotControl={slotControl}
              />
            </div>
          ))}
        </div>
      </div>

      {/*
        Outside the scroller and inside the frame, which is what confines it to the content column
        while the thing it drives spans the window. Hides itself when the bracket fits.
      */}
      <ScrollRail target={scrollRef} className="mt-3" label="Scroll the bracket" />
    </div>
  );
}
