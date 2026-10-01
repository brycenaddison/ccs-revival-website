/**
 * The signed-in viewer's positions for the events on screen, keyed by event ID.
 *
 * Public event reads are identical for every caller, so "your pick" can never come from them. This
 * reads the private `me/positions` route once per loaded page of cards, splitting a page larger
 * than the route's 50-ID limit. Grouping by page keeps earlier pages' keys stable when "Show more"
 * adds one. Anonymous viewers issue nothing and get an empty map.
 */

import { useQueries } from "@tanstack/react-query";
import { outcomeById, outcomeName } from "./outcomeLabels";
import { useAuth } from "../../lib/authContext";
import { PREDICTION_POSITIONS_MAX, type PredictionEvent, type PredictionPosition } from "../../lib/api";
import { isPositivePoints } from "../../lib/predictionPoints";
import { queries } from "../../lib/queries";

export function usePredictionPositions(pages: readonly (readonly number[])[]): {
  byEvent: ReadonlyMap<number, PredictionPosition>;
  error: unknown;
} {
  const { profile, loading } = useAuth();
  const viewerId = loading ? null : profile?.id ?? null;
  const chunks = pages.flatMap(ids => {
    const out: number[][] = [];
    for (let i = 0; i < ids.length; i += PREDICTION_POSITIONS_MAX) out.push(ids.slice(i, i + PREDICTION_POSITIONS_MAX));
    return out;
  });
  const results = useQueries({ queries: chunks.map(ids => queries.predictionPositions(viewerId, ids)) });
  const byEvent = new Map<number, PredictionPosition>();
  for (const result of results) for (const position of result.data ?? []) byEvent.set(position.eventId, position);
  return { byEvent, error: results.find(result => result.error)?.error ?? null };
}

/** The outcomes the viewer put points on: those with nonzero principal. Several are allowed. */
export function pickedOutcomeIds(position: PredictionPosition | null | undefined): number[] {
  return (position?.outcomes ?? []).filter(pick => isPositivePoints(pick.paid)).map(pick => pick.outcomeId);
}

/** "Alpha", "Alpha and Bravo" or "A, B and C", from the event's own outcome names. Null without a pick. */
export function pickNames(event: PredictionEvent, position: PredictionPosition | null | undefined): string | null {
  const names = pickedOutcomeIds(position).map(outcomeId => {
    const outcome = outcomeById(event, outcomeId);
    return outcome ? outcomeName(event, outcome) : "another outcome";
  });
  if (names.length === 0) return null;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
