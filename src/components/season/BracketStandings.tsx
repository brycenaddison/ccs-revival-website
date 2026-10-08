/**
 * A bracket phase's standings table, for a Swiss stage or any bracket whose final order seeds a later
 * phase. Rendered only when the phase serves `standings`.
 *
 * The table counts results **through `lockedThrough`** alone, so a series won early in a round moves
 * nothing until every match in that round is decided. The caption and the note under it say so, or
 * the table would look stale the moment a series ends. Before round 1 every team is 0-0 at a shared
 * rank 1; that is the table, not an empty state. Eliminated teams stay listed, and a team without a
 * fixture in a round simply earns nothing for it, so there is no bye row.
 */

import { useQuery } from "@tanstack/react-query";
import { GroupTable, ruleColumns } from "./GroupTable";
import { TiebreakerNote } from "./TiebreakerNote";
import { queries } from "../../lib/queries";
import { roundIndex, standingsCaption } from "../../lib/seeding";
import type { SeasonBracketPhase } from "../../lib/api";

export function BracketStandings({
  phase,
  conf,
  isMobile,
}: {
  phase: SeasonBracketPhase;
  conf: string;
  isMobile: boolean;
}) {
  // The table renders without it: a failed read only drops the note and the time columns.
  const { data: tiebreakers } = useQuery(queries.tiebreakers(conf));

  if (!phase.standings) return null;

  const round = roundIndex(
    phase.rounds.filter(r => r.matches.length > 0).map(r => r.matchDay),
    phase.lockedThrough ?? 0,
  );

  return (
    <div>
      <GroupTable
        group={{ name: standingsCaption(phase, round), standings: phase.standings }}
        showName
        subtitle={phase.final ? undefined : "Updates when every match in the round is decided."}
        scenarios={false}
        emptyText="No teams have been placed in this phase yet."
        // Every rule with a per-row figure, so a seed's order can be read straight off the table.
        rules={ruleColumns(tiebreakers)}
        isMobile={isMobile}
      />
      {tiebreakers && <TiebreakerNote doc={tiebreakers} />}
    </div>
  );
}
