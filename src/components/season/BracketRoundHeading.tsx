import { fmtDay } from "../../lib/utils";
import type { SeasonBracketMatch } from "../../lib/api";

/** The date is the earliest served kickoff, never the internal season-day join key. */
export function BracketRoundHeading({ matchDay, matches, id }: {
  matchDay: number;
  matches: readonly SeasonBracketMatch[];
  id?: string;
}) {
  const times = matches.map(match => match.scheduledAt).filter((time): time is string => time !== null);
  const date = times.length ? fmtDay(times.reduce((a, b) => a < b ? a : b)) : null;

  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-2">
      <h3 id={id} className="font-display text-[15px] text-text-bright">Round {matchDay}</h3>
      {date && <span className="text-[10px] text-text-dim">{date}</span>}
    </div>
  );
}
