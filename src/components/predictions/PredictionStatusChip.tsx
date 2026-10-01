/** An event's state as a small chip. Only an open event is emphasized: it is the one you can act on. */


import { Badge } from "@/components/ui/badge";
import type { PredictionState } from "../../lib/api";
import { STATE_LABEL } from "./predictionLabels";

export function PredictionStatusChip({ state }: { state: PredictionState }) {
  return <Badge variant={state !== "open" ? "muted" : "default"}>{STATE_LABEL[state]}</Badge>;
}
