/** Independent round stacks preserve fixture order without implying advancement paths. */
import { useRef, type ReactNode } from "react";
import { BracketMatchCard } from "./BracketMatchCard";
import { BracketRoundHeading } from "./BracketRoundHeading";
import { ScrollRail } from "../ScrollRail";
import { FullBleedScroller } from "../layout/FullBleedScroller";
import type { BracketLayout } from "../../lib/bracketLayout";
import type { SeasonBracketMatch, SeasonBracketPhase, SeasonBracketSide, SlotSide } from "../../lib/api";

interface Props {
  phase: SeasonBracketPhase;
  layout: BracketLayout;
  isMobile: boolean;
  slotControl?: (slot: SlotSide, side: SeasonBracketSide, match: SeasonBracketMatch) => ReactNode | null;
  /** First column of the strip, scrolled with the rounds; stacked above them on mobile. */
  leading?: ReactNode;
  /** The leading column's minimum width on desktop, in pixels; it grows to fit its content. */
  leadingWidth?: number;
  /** May take the window's gutters when too wide for the column, as the bracket canvas does. */
  bleed: boolean;
}

export function BracketRoundsView({
  phase, layout, isMobile, slotControl, leading, leadingWidth, bleed,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const strip = (
    <div className={isMobile ? "flex min-w-0 flex-col gap-5" : "flex w-max min-w-full items-start gap-5"}>
      {leading && (
        // Sized to its content past the minimum, so a table with several rule columns is not squeezed.
        <div className={isMobile ? "min-w-0" : "shrink-0"} style={isMobile ? undefined : { minWidth: leadingWidth }}>
          {leading}
        </div>
      )}
      {phase.rounds.map(round => (
        <section
          key={round.matchDay}
          aria-labelledby={`round-heading-${phase.id}-${round.matchDay}`}
          className={isMobile ? "min-w-0" : "w-[304px] shrink-0"}
        >
          <BracketRoundHeading
            id={`round-heading-${phase.id}-${round.matchDay}`}
            matchDay={round.matchDay}
            matches={round.matches}
          />
          <div className="flex flex-col gap-2.5">
            {round.matches.map(match => (
              <div key={match.matchId} className="min-w-0">
                <BracketMatchCard
                  match={match}
                  terminal={false}
                  layout={layout}
                  slotControl={slotControl}
                />
              </div>
            ))}
            {round.matches.length === 0 && <p className="text-sm text-text-dim">No matches in this round yet.</p>}
          </div>
        </section>
      ))}
    </div>
  );

  // The same breakout the bracket canvas uses: the strip runs into the page's gutters instead of
  // clipping at the column's edge. Inside a bordered panel it stays in its own scroller.
  if (!isMobile && bleed) return <FullBleedScroller label="Scroll the rounds">{strip}</FullBleedScroller>;

  return (
    <div className="min-w-0">
      <div ref={scrollRef} className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {strip}
      </div>
      {!isMobile && <ScrollRail target={scrollRef} className="mt-3" label="Scroll the rounds" />}
    </div>
  );
}
