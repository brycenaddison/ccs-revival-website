/**
 * A bracket phase, drawn as a bracket.
 *
 * Two renderers, and the split is by axis rather than by size. On a wide screen the layout is the
 * *graph*: columns derived from the wiring, cards ordered so a match sits level with what feeds it,
 * and lines between them. On a narrow one it is *chronology*: one section per match day, full-width
 * cards, no lines — because a graph you can see 1.2 columns of at a time is unreadable, and
 * connectors between stacked full-width cards are worse than none.
 *
 * Nothing is lost in the narrow view. What the lines say is also written on every unresolved slot as
 * "Winner of Semifinal 1", which is exactly why that fallback in `sideProvenance` matters.
 */

import { useMemo } from "react";
import { BracketMatchCard } from "./BracketMatchCard";
import { BracketConnectors, useCardMeasurer } from "./BracketConnectors";
import { bracketLayout } from "../../lib/bracketLayout";
import type { SeasonBracketPhase } from "../../lib/api";

interface Props {
  phase: SeasonBracketPhase;
  conf: string;
  isMobile: boolean;
}

/** "Day 9", or "Days 9–10" when a derived column spans two. */
function dayLabel(days: readonly number[]): string {
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (unique.length === 0) return "";
  if (unique.length === 1) return `Day ${unique[0]}`;
  return `Days ${unique[0]}–${unique[unique.length - 1]}`;
}

export function BracketPhaseView({ phase, conf, isMobile }: Props) {
  const layout = useMemo(() => {
    const built = bracketLayout(phase);
    // A cycle is refused at save time and a dangling source only survives a delete, so either means
    // the bracket upstream is not what it should be. Said here and nowhere else: a reader cannot act
    // on it, and the layout degrades on its own — the affected nodes just lose their connectors.
    if (import.meta.env.DEV && (built.cyclic.length > 0 || built.dangling.length > 0)) {
      console.warn(
        `[bracket] ${conf} phase ${phase.id} (${phase.name}):`,
        built.cyclic.length ? `nodes in a cycle: ${built.cyclic.join(", ")}` : "",
        built.dangling.length ? `sources not in this phase: ${built.dangling.join(", ")}` : "",
      );
    }
    return built;
  }, [phase, conf]);
  const measurer = useCardMeasurer(layout);
  const empty = layout.columns.every(c => c.length === 0);

  if (empty) {
    return <div className="py-10 text-center text-[13px] text-text-dim">The bracket hasn&rsquo;t been drawn yet.</div>;
  }

  if (isMobile) {
    return (
      <div className="flex flex-col gap-5">
        {phase.rounds.map(round => (
          <div key={round.matchDay}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-display text-[15px] tracking-widest text-text-bright">
                ROUND {round.matchDay}
              </span>
              <span className="text-[10px] text-text-dim">Day {round.seasonDay}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {round.matches.map(match => (
                <BracketMatchCard
                  key={match.node}
                  match={match}
                  terminal={layout.byNode.get(match.node)?.terminal ?? false}
                  layout={layout}
                  conf={conf}
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
      {/*
        A strip that scrolls sideways, not a wrapping grid. A bracket reads left to right — column 1
        feeds column 2 — and wrapping column 3 onto a second row breaks the one spatial cue the
        layout has. `-mx-8 px-8` cancels the page shell's own padding so the scroll edge sits flush
        with the content rather than clipping a column mid-padding.
      */}
      <div className="-mx-8 overflow-x-auto px-8">
        <div ref={measurer.wrapRef} className="relative w-max pb-2">
          <BracketConnectors edges={layout.edges} boxes={measurer.boxes} size={measurer.size} />

          {/*
            `relative` is load-bearing, not decoration. The overlay is absolutely positioned, and a
            positioned element paints above static in-flow siblings whatever the DOM order — so
            without this the lines would be drawn *over* the cards, straight through the team names.
            Positioning this too puts both in the same layer, where DOM order decides and the cards
            win.
          */}
          <div className="relative flex items-start gap-10">
            {layout.columns.map((column, index) => (
              <div key={index} className="flex w-[19rem] shrink-0 flex-col gap-3">
                <div className="mb-1">
                  <div className="font-display text-[14px] tracking-widest text-text-bright">
                    ROUND {index + 1}
                  </div>
                  {/* The day is chronology and the column is the graph, so a column can legitimately
                      hold two days — upstream permits a feeder and its consumer on one match day. */}
                  <div className="text-[10px] text-text-dim">{dayLabel(column.map(n => n.seasonDay))}</div>
                </div>

                {column.map(placed => (
                  <BracketMatchCard
                    key={placed.node}
                    match={placed.match}
                    terminal={placed.terminal}
                    layout={layout}
                    conf={conf}
                    measureRef={measurer.register(placed.node)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-[10px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="22" height="2" aria-hidden="true">
            <line x1="0" y1="1" x2="22" y2="1" stroke="var(--border2)" strokeWidth="2" />
          </svg>
          Winner advances
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="22" height="2" aria-hidden="true">
            <line x1="0" y1="1" x2="22" y2="1" stroke="var(--border2)" strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Loser drops
        </span>
      </div>
    </>
  );
}
