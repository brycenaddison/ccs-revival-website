/**
 * The Open tab of the predictions hub: `/predictions`. Each selected conf's open match and custom
 * predictions, next deadline first (`sort=closesAt`). Closed states live on the Results tab.
 */

import { PredictionFeed } from "../components/predictions/PredictionFeed";
import { queries } from "../lib/queries";
import { usePredictionsHub } from "./PredictionsHub";

const EMPTY = "No open predictions right now. New predictions are published each week.";

export default function Predictions() {
  const { confs, labels } = usePredictionsHub();
  return <PredictionFeed confs={confs} labels={labels} list={queries.openPredictions} empty={EMPTY} />;
}
