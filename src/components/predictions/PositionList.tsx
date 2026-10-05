/**
 * The viewer's positions, from `me/positions`.
 *
 * `PositionBreakdown` is one event's position on its detail page, pick by pick, which works after
 * settlement too. `PositionList` is the My predictions list of unsettled events, one compact row
 * each. Amounts are served; potential returns are the API's estimates and change until the market
 * closes. Picks are matched to outcomes by `outcomeId`; a custom row shows its title.
 *
 * A hidden event (`event: null` in `/me`) keeps its amounts and reads "Hidden prediction".
 */

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MatchupLabel, OutcomeLabel } from "./MatchupLabel";
import { predictionPath } from "./PredictionCard";
import { closingPoint } from "./PredictionUi";
import { PredictionStatusChip } from "./PredictionStatusChip";
import { outcomeById, outcomeName } from "./outcomeLabels";
import { pickedOutcomeIds } from "./usePredictionPositions";
import type { PredictionEvent, PredictionPosition } from "../../lib/api";
import { isPositivePoints, pointsText } from "../../lib/predictionPoints";

const TERM = "font-heading text-[10px] text-text-muted";
const VALUE = "font-mono text-sm text-text-bright";

export function PositionBreakdown({ event, position }: { event: PredictionEvent; position: PredictionPosition }) {
  const picks = position.outcomes.filter(pick => isPositivePoints(pick.paid));
  const state = position.state ?? event.state;
  return (
    <section className="rounded-lg border border-border bg-bg2 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-[22px] text-text-bright">Your position</h2>
        <PredictionStatusChip state={state} />
      </div>
      <ul className="space-y-3">
        {picks.map(pick => {
          const outcome = outcomeById(event, pick.outcomeId);
          return (
            <li key={pick.outcomeId} className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
              {outcome
                ? <OutcomeLabel event={event} outcome={outcome} size={24} className="font-heading text-sm text-text-bright" />
                : <span className="font-heading text-sm text-text-muted">Another outcome</span>}
              <dl className="flex gap-6">
                <Amount term="Points in" value={pointsText(pick.paid)} />
                {pick.estimatedReturn !== null && <Amount term="Potential return" value={pointsText(pick.estimatedReturn)} />}
              </dl>
            </li>
          );
        })}
      </ul>
      {(isPositivePoints(position.bonus) || position.returned !== null || position.refunded !== null) && (
        <dl className="mt-4 flex flex-wrap gap-6 border-t border-border pt-3">
          {isPositivePoints(position.bonus) && <Amount term="First-prediction bonus" value={pointsText(position.bonus)} />}
          {position.returned !== null && <Amount term="Returned" value={pointsText(position.returned)} />}
          {position.refunded !== null && <Amount term="Refunded" value={pointsText(position.refunded)} />}
        </dl>
      )}
      {picks.some(pick => pick.estimatedReturn !== null) && (
        <p className="mt-3 text-xs text-text-dim">Estimates change as others predict, until {closingPoint(event.kind)}.</p>
      )}
    </section>
  );
}

export interface PositionListRow {
  eventId: number;
  event: PredictionEvent | null;
  /** From `me/positions`; absent while it loads or for a row it omitted. */
  position: PredictionPosition | null;
  /** From `/me`, for hidden fixtures and before positions arrive. */
  paid: string | null;
}

export function PositionList({ rows }: { rows: readonly PositionListRow[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-bg2">
      {rows.map(row => <PositionRow key={row.eventId} row={row} />)}
    </ul>
  );
}

function PositionRow({ row }: { row: PositionListRow }) {
  const { event, position } = row;
  const picks = pickedOutcomeIds(position);
  const returns = (position?.outcomes ?? []).filter(pick => isPositivePoints(pick.paid) && pick.estimatedReturn !== null);
  const nameOf = (outcomeId: number) => {
    const outcome = event ? outcomeById(event, outcomeId) : null;
    return event && outcome ? outcomeName(event, outcome) : "another outcome";
  };
  // The match label mutes the other team, keyed by team ID.
  const pickedTeams = event?.outcomes.filter(outcome => picks.includes(outcome.id) && outcome.teamId !== null).map(outcome => outcome.teamId!);

  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        {!event ? <span className="font-heading text-sm text-text-muted">Hidden prediction</span>
          : event.kind === "custom" ? <span className="block min-w-0 truncate font-heading text-sm text-text-bright">{event.title}</span>
          : <MatchupLabel teamA={event.outcomes[0].team} teamB={event.outcomes[1].team} picked={pickedTeams} />}
      </div>
      <dl className="flex flex-wrap gap-6">
        <Amount term="Points in" value={pointsText(position?.paid ?? row.paid)} />
        {returns.map(pick => (
          <Amount
            key={pick.outcomeId}
            term={returns.length > 1 || event?.kind === "custom" ? `If ${nameOf(pick.outcomeId)} wins` : "Potential return"}
            value={pointsText(pick.estimatedReturn)}
          />
        ))}
      </dl>
      {event && (
        <div className="flex items-center gap-2">
          <PredictionStatusChip state={event.state} />
          <Button asChild variant="ghost" size="sm">
            <Link to={predictionPath(event.id)}>View</Link>
          </Button>
        </div>
      )}
    </li>
  );
}

function Amount({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className={TERM}>{term}</dt>
      <dd className={VALUE}>{value}</dd>
    </div>
  );
}
