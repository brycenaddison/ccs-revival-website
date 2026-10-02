/**
 * Settle a prediction by hand: resolve an unpaid custom market, or correct an already paid result.
 * Give a reason, preview, then apply.
 *
 * `resolve` picks a custom market's winning outcome. `correct` on a match market chooses a new exact
 * result (recomputed upstream from the fixture) or a void with refunds; on a custom market it picks
 * another outcome or voids.
 *
 * The preview is the review step. It shows the previous and proposed winners, how many games the
 * API reviewed (match markets only), promotional points minted and every player whose points
 * change. Applying sends the preview's token with a fresh request ID; anything changed since the
 * preview answers 409 and needs another preview. Changing the mode, outcome or reason discards the
 * preview, because the token is for that exact command. Debt from a correction stays on the ledger;
 * spendable points floor at zero.
 */

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormDialog } from "../../FormDialog";
import { PillTabs, type PillTab } from "../../PillTabs";
import { ErrorLine } from "../../admin/adminUi";
import { PlayerIdentity } from "../../players/PlayerIdentity";
import { OutcomeLabel } from "../../predictions/MatchupLabel";
import { eventName, outcomeById } from "../../predictions/outcomeLabels";
import { predictionErrorText, voidReasonText } from "../../predictions/predictionLabels";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  applyPredictionSettlement,
  PREDICTION_REASON_MAX,
  previewPredictionSettlement,
  type PredictionCorrectionKind,
  type PredictionEvent,
  type PredictionSettlementCommand,
  type PredictionSettlementPreview,
} from "../../../lib/api";
import { pointsText, signedPointsText, signedPointsTone } from "../../../lib/predictionPoints";
import { queryRoots } from "../../../lib/queries";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export type SettlementMode = "resolve" | "correct";

const MATCH_CORRECTIONS: readonly PillTab<PredictionCorrectionKind>[] = [
  { key: "result", label: "Correct result" },
  { key: "void", label: "Void and refund" },
];
const CUSTOM_CORRECTIONS: readonly PillTab<PredictionCorrectionKind>[] = [
  { key: "outcome", label: "Pick another outcome" },
  { key: "void", label: "Void and refund" },
];

export function SettlementDialog({ conf, event, mode, onClose, onDone }: {
  conf: string;
  event: PredictionEvent;
  mode: SettlementMode;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const qc = useQueryClient();
  const radioId = useId();
  const custom = event.kind === "custom";
  const [correction, setCorrection] = useState<PredictionCorrectionKind>(custom ? "outcome" : "result");
  const [outcomeId, setOutcomeId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PredictionSettlementPreview | null>(null);
  const [applyId, setApplyId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryRoots.predictions });

  const picksOutcome = mode === "resolve" || correction === "outcome";
  const command: PredictionSettlementCommand | null = mode === "resolve"
    ? outcomeId === null ? null : { action: "preview_resolution", outcomeId }
    : correction === "outcome"
      ? outcomeId === null ? null : { action: "preview_correction", correction, outcomeId }
      : { action: "preview_correction", correction };

  const previewing = useMutation({
    mutationFn: (next: PredictionSettlementCommand) => previewPredictionSettlement(conf, event, next, reason.trim()),
    onSuccess: result => { setPreview(result); setApplyId(null); },
    onError: async error => { if (error instanceof ApiError && error.status === 409) await refresh(); },
  });
  const applying = useMutation({
    mutationFn: ({ reviewed, id }: { reviewed: PredictionSettlementPreview; id: string }) => applyPredictionSettlement(conf, reviewed, id),
    onSuccess: async () => {
      await refresh();
      onDone(mode === "resolve" ? "Prediction resolved." : "Correction applied.");
      onClose();
    },
    onError: async error => {
      if (!(error instanceof ApiError) || error.status >= 500) return;
      setApplyId(null);
      if (error.status === 409) { setPreview(null); await refresh(); }
    },
  });
  const busy = previewing.isPending || applying.isPending;
  // Locked while an apply attempt is outstanding, so a retry repeats the same command.
  const frozen = applyId !== null || busy;
  const change = (next: () => void) => {
    if (frozen) return;
    next(); setPreview(null); setApplyId(null); previewing.reset(); applying.reset();
  };
  const apply = () => {
    if (!preview) return;
    const id = applyId ?? crypto.randomUUID();
    setApplyId(id);
    applying.mutate({ reviewed: preview, id });
  };
  const voiding = preview?.command.action === "preview_correction" && preview.command.correction === "void";
  const winnerLabel = (id: number | null) => {
    const outcome = outcomeById(event, id);
    return outcome ? <OutcomeLabel event={event} outcome={outcome} linked={false} /> : "None";
  };

  return (
    <FormDialog
      open
      onOpenChange={open => { if (!open && !busy) onClose(); }}
      title={mode === "resolve" ? "Resolve this prediction?" : "Correct the result?"}
      description={mode === "resolve"
        ? <><span className="text-text-bright">{eventName(event)}</span>. Pick the winning outcome; its pool pays out to everyone who picked it.</>
        : <><span className="text-text-bright">{eventName(event)}</span> has already paid out. Corrections post the difference to each player; earlier payouts stay on record.</>}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          {preview ? (
            <Button variant={voiding ? "destructive" : "default"} disabled={busy} onClick={apply}>
              {applyId && applying.isError ? "Retry" : mode === "resolve" ? "Resolve" : "Apply correction"}
            </Button>
          ) : (
            <Button
              disabled={busy || !command || !reason.trim() || event.revision === null}
              onClick={() => command && previewing.mutate(command)}
            >
              Preview
            </Button>
          )}
        </>
      }
    >
      {mode === "correct" && (
        <PillTabs
          label="Correction"
          tabs={custom ? CUSTOM_CORRECTIONS : MATCH_CORRECTIONS}
          selected={correction}
          onSelect={next => change(() => setCorrection(next))}
        />
      )}
      {picksOutcome && (
        <fieldset className={mode === "correct" ? "mt-4" : ""}>
          <legend className="mb-2 font-heading text-sm text-text-bright">{mode === "resolve" ? "Winning outcome" : "New winning outcome"}</legend>
          <RadioGroup
            value={outcomeId === null ? "" : String(outcomeId)}
            onValueChange={value => change(() => setOutcomeId(Number(value)))}
            disabled={frozen}
            className="gap-2"
          >
            {event.outcomes.map(outcome => (
              <div key={outcome.id} className="flex min-w-0 items-center gap-2">
                <RadioGroupItem id={`${radioId}-${outcome.id}`} value={String(outcome.id)} />
                <Label htmlFor={`${radioId}-${outcome.id}`} className="min-w-0 cursor-pointer font-normal">
                  <OutcomeLabel event={event} outcome={outcome} linked={false} className="text-sm text-text-bright" />
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      )}
      <Label htmlFor="prediction-settlement-reason" className="mb-1 mt-4">Reason</Label>
      <Textarea
        id="prediction-settlement-reason"
        className="min-h-20"
        maxLength={PREDICTION_REASON_MAX}
        value={reason}
        disabled={applyId !== null}
        onChange={e => { const value = e.target.value; change(() => setReason(value)); }}
        placeholder="Recorded in the audit log"
      />

      {preview && (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-bg3 p-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
            {mode === "correct" && <>
              <dt className="text-text-secondary">Previous winner</dt>
              <dd className="min-w-0">{winnerLabel(preview.oldWinnerOutcomeId)}</dd>
            </>}
            <dt className="text-text-secondary">Proposed</dt>
            <dd className="min-w-0">
              {preview.newWinnerOutcomeId === null
                ? `Void${preview.voidReason ? `: ${voidReasonText(preview.voidReason)}` : ""}`
                : winnerLabel(preview.newWinnerOutcomeId)}
              {!custom && preview.score && <span className="ml-2 font-mono text-text-secondary">{preview.score.teamA}-{preview.score.teamB}</span>}
            </dd>
            {preview.evidenceCount !== null && <>
              <dt className="text-text-secondary">Games reviewed</dt>
              <dd className="font-mono">{preview.evidenceCount}</dd>
            </>}
            {preview.promotionMint !== null && <>
              <dt className="text-text-secondary">Promotional points minted</dt>
              <dd className="font-mono">{pointsText(preview.promotionMint)}</dd>
            </>}
          </dl>
          {preview.affected.length === 0 ? <p className="text-text-secondary">No one&apos;s points change.</p> : (
            <ul className="space-y-1.5 border-t border-border pt-3">
              {preview.affected.map(row => (
                <li key={row.profileId} className="flex min-w-0 items-center justify-between gap-3">
                  <PlayerIdentity small player={row.player ?? { profileId: row.profileId, name: null, avatar: null, verified: false }} />
                  <span className="shrink-0 text-right font-mono text-xs">
                    <span className={signedPointsTone(row.delta)}>{signedPointsText(row.delta)}</span>
                    <span className="text-text-dim"> · balance {pointsText(row.resultingBalance)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ErrorLine message={previewing.error ? predictionErrorText(previewing.error, "staff") : applying.error ? predictionErrorText(applying.error, "staff") : null} />
    </FormDialog>
  );
}
