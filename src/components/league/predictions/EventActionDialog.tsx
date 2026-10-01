/**
 * Lock, reopen or void one event, with its own required audit reason.
 *
 * Every staff command carries the event's `revision` so a stale page cannot act on a changed event;
 * a 409 closes nothing and refreshes the week. The request ID is kept across an uncertain failure so
 * a retry repeats the same command. Revision numbers and event IDs stay out of the copy.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormDialog } from "../../FormDialog";
import { ErrorLine } from "../../admin/adminUi";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  errorMessage,
  predictionAction,
  PREDICTION_REASON_MAX,
  type PredictionEvent,
  type PredictionEventAction,
} from "../../../lib/api";
import { queryRoots } from "../../../lib/queries";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const ACTION_COPY: Record<PredictionEventAction, { label: string; title: string; effect: string; done: string }> = {
  lock: {
    label: "Lock",
    title: "Lock predictions",
    effect: "No one can place new predictions. Existing predictions stay in the pool until the result settles or you reopen it.",
    done: "Predictions locked.",
  },
  reopen: {
    label: "Reopen",
    title: "Reopen predictions",
    effect: "Predictions open again until kickoff. The API first checks that the kickoff is still ahead and no games are recorded.",
    done: "Predictions reopened.",
  },
  void: {
    label: "Void",
    title: "Void this prediction",
    effect: "Every point placed is refunded and the prediction closes for good. This cannot be undone.",
    done: "Prediction voided and refunded.",
  },
};

export function EventActionDialog({ conf, event, action, onClose, onDone }: {
  conf: string;
  event: PredictionEvent;
  action: PredictionEventAction;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const copy = ACTION_COPY[action];
  const matchup = `${event.outcomes[0].team?.name ?? "TBD"} vs ${event.outcomes[1].team?.name ?? "TBD"}`;

  const acting = useMutation({
    mutationFn: (id: string) => predictionAction(conf, event.id, action, event.revision!, reason.trim(), id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      onDone(copy.done);
      onClose();
    },
    onError: async error => {
      if (!(error instanceof ApiError) || error.status >= 500) return;
      setRequestId(null);
      if (error.status === 409) await qc.invalidateQueries({ queryKey: queryRoots.predictions });
    },
  });
  const submit = () => {
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    acting.mutate(id);
  };

  return (
    <FormDialog
      open
      onOpenChange={open => { if (!open && !acting.isPending) onClose(); }}
      title={`${copy.title}?`}
      description={<><span className="text-text-bright">{matchup}</span>. {copy.effect}</>}
      footer={
        <>
          <Button variant="outline" disabled={acting.isPending} onClick={onClose}>Cancel</Button>
          <Button
            variant={action === "void" ? "destructive" : "default"}
            disabled={acting.isPending || !reason.trim() || event.revision === null}
            onClick={submit}
          >
            {requestId && acting.isError ? "Retry" : copy.label}
          </Button>
        </>
      }
    >
      <Label htmlFor="prediction-action-reason" className="mb-1">Reason</Label>
      <Textarea
        id="prediction-action-reason"
        className="min-h-20"
        maxLength={PREDICTION_REASON_MAX}
        value={reason}
        disabled={requestId !== null}
        onChange={e => setReason(e.target.value)}
        placeholder="Recorded in the audit log"
      />
      <ErrorLine message={acting.error ? errorMessage(acting.error) : null} />
    </FormDialog>
  );
}
