/** An event's state as a small chip. Only an open event is emphasized: it is the one you can act on. */

import { Pill } from "../admin/adminUi";
import type { PredictionState } from "../../lib/api";
import { STATE_LABEL } from "./predictionLabels";

export function PredictionStatusChip({ state }: { state: PredictionState }) {
  return <Pill muted={state !== "open"}>{STATE_LABEL[state]}</Pill>;
}
