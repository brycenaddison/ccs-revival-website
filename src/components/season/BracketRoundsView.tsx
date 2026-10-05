/** Independent round stacks preserve fixture order without implying advancement paths. */
import { useRef, type ReactNode } from "react";
import { BracketMatchCard } from "./BracketMatchCard";
import { BracketRoundHeading } from "./BracketRoundHeading";
import { ScrollRail } from "../ScrollRail";
import type { BracketLayout } from "../../lib/bracketLayout";
import type { SeasonBracketMatch, SeasonBracketPhase, SeasonBracketSide, SlotSide } from "../../lib/api";

interface Props {
  phase: SeasonBracketPhase;
  layout: BracketLayout;
  isMobile: boolean;
  slotControl?: (slot: SlotSide, side: SeasonBracketSide, match: SeasonBracketMatch) => ReactNode | null;
}

export function BracketRoundsView({
  phase, layout, isMobile, slotControl,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-w-0">
      <div ref={scrollRef} className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className={isMobile ? "flex min-w-0 flex-col gap-5" : "flex w-max min-w-full items-start gap-5"}>
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
      </div>
      {!isMobile && <ScrollRail target={scrollRef} className="mt-3" label="Scroll the rounds" />}
    </div>
  );
}
