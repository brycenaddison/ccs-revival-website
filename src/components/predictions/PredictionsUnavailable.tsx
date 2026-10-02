import { Coins, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PREDICTIONS_UNAVAILABLE_STAFF_TEXT } from "./predictionLabels";

/**
 * What a predictions surface shows in place of its content when the API answers
 * `predictions_unavailable`. A state rather than an error: no retry changes it. Readers get an empty
 * state; staff get a warning that names the cause.
 */
export function PredictionsUnavailable({ audience = "public" }: { audience?: "public" | "staff" }) {
  if (audience === "staff") {
    return (
      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Predictions are unavailable</AlertTitle>
        <AlertDescription>
          <p>{PREDICTIONS_UNAVAILABLE_STAFF_TEXT}</p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Empty className="border bg-bg2">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Coins aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>Predictions aren&apos;t running right now</EmptyTitle>
        <EmptyDescription>Points, picks and the leaderboard will be back once predictions reopen.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
