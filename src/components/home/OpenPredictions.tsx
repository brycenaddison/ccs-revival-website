/**
 * Up to three open predictions, in Home's competition column after the upcoming schedule.
 *
 * Reads the same `status=open&sort=closesAt` key per conf as the predictions Matches tab, so the
 * cache is shared. With several divisions, cards fill in division order, each division in served
 * order; merging divisions by kickoff would re-sort served rows. Hidden entirely when nothing is
 * open or a read fails, so Home never shows an empty or broken block.
 */

import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { PredictionCard } from "../predictions/PredictionCard";
import { usePredictionPositions } from "../predictions/usePredictionPositions";
import { useLeague, useSeasonLink } from "../../lib/leagueContext";
import { queries } from "../../lib/queries";

const SHOWN = 3;

export function OpenPredictions() {
  const { selectedConfs } = useLeague();
  const seasonLink = useSeasonLink();
  const results = useQueries({ queries: selectedConfs.map(conf => queries.openPredictions(conf)) });
  const events = results.some(result => result.error || result.isPending)
    ? []
    : results.flatMap(result => result.data?.items ?? []).slice(0, SHOWN);
  const { byEvent } = usePredictionPositions(events.length ? [events.map(event => event.id)] : []);

  if (events.length === 0) return null;

  return (
    <section aria-label="Open predictions" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[15px] text-text-bright">Open predictions</h2>
        <Button asChild variant="outline" size="sm">
          <Link to={seasonLink("/predictions")}>All predictions</Link>
        </Button>
      </div>
      {events.map(event => <PredictionCard key={event.id} event={event} position={byEvent.get(event.id)} compact />)}
    </section>
  );
}
