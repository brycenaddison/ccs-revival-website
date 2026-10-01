/**
 * A fixture's prediction on the match page's Preview tab, when one is published.
 *
 * Looked up with the anonymous `GET /predictions?scheduleMatchId=`, separate from the match page's
 * session-scoped result read. No row, or a failed lookup, renders nothing: the match page is about
 * the match. The teams are not repeated because the header right above already shows them, and the
 * predict flow itself stays on the detail page so there is one place that places predictions.
 */

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PoolBar } from "./PoolBar";
import { predictionPath } from "./PredictionCard";
import { PredictionStatusChip } from "./PredictionStatusChip";
import { closesText, usePredictionClock } from "./PredictionUi";
import { pickNames, usePredictionPositions } from "./usePredictionPositions";
import { pointsText } from "../../lib/predictionPoints";
import { queries } from "../../lib/queries";

export function MatchPredictionPanel({ scheduleMatchId }: { scheduleMatchId: number }) {
  const { data } = useQuery(queries.predictionForMatch(scheduleMatchId));
  const event = data?.items[0] ?? null;
  const { byEvent } = usePredictionPositions(event ? [[event.id]] : []);
  const now = usePredictionClock(event?.serverNow ?? null);
  if (!event) return null;

  const open = event.state === "open";
  const picked = pickNames(event, byEvent.get(event.id));

  return (
    <section aria-label="Prediction" className="mb-6 rounded-lg border border-border bg-bg2 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[15px] text-text-bright">Prediction</h2>
          <PredictionStatusChip state={event.state} />
        </div>
        <span className="font-heading text-xs text-text-secondary">
          {pointsText(event.totalPool)} points in the pool{open && ` · ${closesText(event.closesAt, now)}`}
        </span>
      </div>
      <PoolBar event={event} labels />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading text-xs text-text-secondary">{picked ? `Your pick: ${picked}` : open ? "Pick the series winner before kickoff." : ""}</p>
        <Button asChild size="sm" variant={open ? "default" : "outline"}>
          <Link to={predictionPath(event.id)}>{open ? "Predict" : "View prediction"}</Link>
        </Button>
      </div>
    </section>
  );
}
