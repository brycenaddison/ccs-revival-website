/**
 * Lock, reopen or void one event, with its own required audit reason.
 *
 * Every staff command carries the event's `revision` so a stale page cannot act on a changed event;
 * a 409 closes nothing and refreshes the week. The request ID is kept across an uncertain failure so
 * a retry repeats the same command. Revision numbers and event IDs stay out of the copy.
 *
 * A match market reopens until its kickoff. A custom market has no fixture, so reopening it needs a
 * new future deadline, sent as `closesAt`; the field locks with the reason while an attempt is
 * outstanding so a retry repeats the same command.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DateTimePicker } from "../../DateTimePicker";
import { FormDialog } from "../../FormDialog";
import { ErrorLine } from "../../admin/adminUi";
import { eventName } from "../../predictions/outcomeLabels";
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
import { FieldError } from "@/components/ui/field";
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

/** Custom markets have no result to settle on their own and no kickoff to reopen to. */
const CUSTOM_EFFECT: Partial<Record<PredictionEventAction, string>> = {
  lock: "No one can place new predictions. Existing predictions stay in the pool until you resolve or reopen it.",
  reopen: "Predictions open again until the new deadline.",
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
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const copy = ACTION_COPY[action];
  const effect = (event.kind === "custom" ? CUSTOM_EFFECT[action] : null) ?? copy.effect;
  const needsDeadline = event.kind === "custom" && action === "reopen";
  const deadlinePast = needsDeadline && closesAt !== null && Date.parse(closesAt) <= Date.now();

  const acting = useMutation({
    mutationFn: (id: string) => predictionAction(conf, event.id, action, event.revision!, reason.trim(), id, needsDeadline ? closesAt : null),
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
      description={<><span className="text-text-bright">{eventName(event)}</span>. {effect}</>}
      footer={
        <>
          <Button variant="outline" disabled={acting.isPending} onClick={onClose}>Cancel</Button>
          <Button
            variant={action === "void" ? "destructive" : "default"}
            disabled={acting.isPending || !reason.trim() || event.revision === null || (needsDeadline && (closesAt === null || deadlinePast))}
            onClick={submit}
          >
            {requestId && acting.isError ? "Retry" : copy.label}
          </Button>
        </>
      }
    >
      {needsDeadline && (
        <div className="mb-4">
          <Label htmlFor="prediction-action-deadline" className="mb-1">New deadline</Label>
          <DateTimePicker
            id="prediction-action-deadline"
            value={closesAt}
            onChange={setClosesAt}
            disabled={requestId !== null}
            aria-invalid={deadlinePast || undefined}
            aria-describedby={deadlinePast ? "prediction-action-deadline-error" : undefined}
          />
          {deadlinePast && <FieldError id="prediction-action-deadline-error" className="mt-1">Choose a time in the future.</FieldError>}
        </div>
      )}
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
