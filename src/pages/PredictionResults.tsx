/**
 * The Results tab of the predictions hub: `/predictions/results`. Each selected conf's closed match
 * and custom predictions in every closed state (locked, in review, settled, voided), newest
 * deadline first (`sort=-closesAt`).
 */

import { PredictionFeed } from "../components/predictions/PredictionFeed";
import { queries } from "../lib/queries";
import { usePredictionsHub } from "./PredictionsHub";

const EMPTY = "No closed predictions yet.";

export default function PredictionResults() {
  const { confs, labels } = usePredictionsHub();
  return <PredictionFeed confs={confs} labels={labels} list={queries.predictionResults} empty={EMPTY} />;
}
