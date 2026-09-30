/**
 * Correct an already paid result: choose a new exact result or a void with refunds, give a reason,
 * preview, then apply.
 *
 * The preview is the review step. It shows the previous and proposed winners, how many games the
 * API reviewed, promotional points minted and every player whose points change. Applying sends the
 * preview's token with a fresh request ID; changed evidence since the preview answers 409 and needs
 * another preview. Changing the kind or reason discards the preview, because the token is for that
 * exact command. Debt from a correction stays on the ledger; spendable points floor at zero.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormDialog } from "../../FormDialog";
import { PillTabs } from "../../PillTabs";
import { ErrorLine } from "../../admin/adminUi";
import { PlayerIdentity } from "../../players/PlayerIdentity";
import { TeamLabel } from "../../predictions/MatchupLabel";
import { voidReasonText } from "../../predictions/predictionLabels";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { Button } from "../../ui/button";
import {
  ApiError,
  applyPredictionCorrection,
  errorMessage,
  PREDICTION_REASON_MAX,
  previewPredictionCorrection,
  type PredictionCorrectionKind,
  type PredictionCorrectionPreview,
  type PredictionEvent,
} from "../../../lib/api";
import { pointsText, signedPointsText, signedPointsTone } from "../../../lib/predictionPoints";
import { queryRoots } from "../../../lib/queries";

const KINDS = [
  { key: "result" as const, label: "Correct result" },
  { key: "void" as const, label: "Void and refund" },
];

export function CorrectionDialog({ conf, event, onClose, onDone }: {
  conf: string;
  event: PredictionEvent;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<PredictionCorrectionKind>("result");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PredictionCorrectionPreview | null>(null);
  const [applyId, setApplyId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryRoots.predictions });

  const previewing = useMutation({
    mutationFn: () => previewPredictionCorrection(conf, event.id, event.revision!, reason.trim(), kind),
    onSuccess: result => { setPreview(result); setApplyId(null); },
    onError: async error => { if (error instanceof ApiError && error.status === 409) await refresh(); },
  });
  const applying = useMutation({
    mutationFn: ({ reviewed, id }: { reviewed: PredictionCorrectionPreview; id: string }) => applyPredictionCorrection(conf, reviewed, id),
    onSuccess: async () => {
      await refresh();
      onDone("Correction applied.");
      onClose();
    },
    onError: async error => {
      if (!(error instanceof ApiError) || error.status >= 500) return;
      setApplyId(null);
      if (error.status === 409) { setPreview(null); await refresh(); }
    },
  });
  const busy = previewing.isPending || applying.isPending;
  const change = (next: () => void) => { next(); setPreview(null); setApplyId(null); previewing.reset(); applying.reset(); };
  const apply = () => {
    if (!preview) return;
    const id = applyId ?? crypto.randomUUID();
    setApplyId(id);
    applying.mutate({ reviewed: preview, id });
  };
  const teamOf = (teamId: number | null) => event.outcomes.find(outcome => outcome.teamId !== null && outcome.teamId === teamId)?.team ?? null;
  const matchup = `${event.outcomes[0].team?.name ?? "TBD"} vs ${event.outcomes[1].team?.name ?? "TBD"}`;

  return (
    <FormDialog
      open
      onOpenChange={open => { if (!open && !busy) onClose(); }}
      title="Correct the result?"
      description={<><span className="text-text-bright">{matchup}</span> has already paid out. Corrections post the difference to each player; earlier payouts stay on record.</>}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          {preview ? (
            <Button variant={preview.correction === "void" ? "destructive" : "default"} disabled={busy} onClick={apply}>
              {applyId && applying.isError ? "Retry" : "Apply correction"}
            </Button>
          ) : (
            <Button disabled={busy || !reason.trim() || event.revision === null} onClick={() => previewing.mutate()}>Preview</Button>
          )}
        </>
      }
    >
      {/* Locked while an apply attempt is outstanding, so a retry repeats the same command. */}
      <PillTabs tabs={KINDS} selected={kind} onSelect={next => { if (applyId === null && !busy) change(() => setKind(next)); }} />
      <label htmlFor="prediction-correction-reason" className={`${LABEL_CLASS} mt-4`}>Reason</label>
      <textarea
        id="prediction-correction-reason"
        className={`${CONTROL_CLASS} min-h-20`}
        maxLength={PREDICTION_REASON_MAX}
        value={reason}
        disabled={applyId !== null}
        onChange={e => { const value = e.target.value; change(() => setReason(value)); }}
        placeholder="Recorded in the audit log"
      />

      {preview && (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-bg3 p-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
            <dt className="text-text-secondary">Previous winner</dt>
            <dd>{teamOf(preview.oldWinnerTeamId) ? <TeamLabel team={teamOf(preview.oldWinnerTeamId)} conf={conf} linked={false} /> : "None"}</dd>
            <dt className="text-text-secondary">Proposed</dt>
            <dd>
              {preview.newWinnerTeamId === null
                ? `Void${preview.voidReason ? `: ${voidReasonText(preview.voidReason)}` : ""}`
                : <TeamLabel team={teamOf(preview.newWinnerTeamId)} conf={conf} linked={false} />}
              {preview.score && <span className="ml-2 font-mono text-text-secondary">{preview.score.teamA}-{preview.score.teamB}</span>}
            </dd>
            <dt className="text-text-secondary">Games reviewed</dt>
            <dd className="font-mono">{preview.evidenceCount}</dd>
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
      <ErrorLine message={previewing.error ? errorMessage(previewing.error) : applying.error ? errorMessage(applying.error) : null} />
    </FormDialog>
  );
}
