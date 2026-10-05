/**
 * Placing a prediction, on the detail page. The only place on the site that places one.
 *
 * Pick an outcome (a team on match markets, any served outcome on custom ones), enter points (the
 * presets only fill the input; any amount can be typed), and the estimate updates as a debounced
 * read-only query. One button places it, by `outcomeId`. The server rechecks the deadline, recorded
 * play and funds at acceptance, so every check here is guidance.
 *
 * The request ID is a command identity. An uncertain failure (network, 5xx) keeps it and locks the
 * inputs so "Retry" repeats exactly the same command, which the API answers with the saved receipt.
 * A 4xx is a definite answer: the attempt is dropped, and a 409 refreshes the state it disagreed
 * with.
 *
 * When the event is not open the panel becomes the result summary instead.
 */

import { useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ErrorLine } from "../admin/adminUi";
import { TeamBadge } from "../TeamBadge";
import { OutcomeLabel } from "./MatchupLabel";
import { shareText } from "./PoolBar";
import { closingPoint } from "./PredictionUi";
import { outcomeById, outcomeName } from "./outcomeLabels";
import { predictionErrorText, PUBLIC_PICKS_NOTICE, REVIEW_REASON_LABEL, voidReasonText } from "./predictionLabels";
import type { PredictionWallet } from "./usePredictionWallet";
import { useDebounced } from "../../hooks/useDebounced";
import { useAuth } from "../../lib/authContext";
import { ApiError, placePrediction, type PredictionEvent } from "../../lib/api";
import { toBadge } from "../../lib/leagueAdapters";
import {
  exceedsPoints,
  isPositivePoints,
  minorToPointInput,
  pointInputToMinor,
  pointsText,
  PREDICTION_QUICK_AMOUNTS,
} from "../../lib/predictionPoints";
import { queries, queryRoots } from "../../lib/queries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PANEL = "rounded-lg border border-border bg-bg2 p-5";
const TITLE = "mb-3 font-display text-[22px] text-text-bright";

interface Attempt { requestId: string; outcomeId: number; paid: string }

export function PredictPanel({ event, wallet, onPlaced }: {
  event: PredictionEvent;
  wallet: PredictionWallet;
  onPlaced: (message: string) => void;
}) {
  if (event.state !== "open") return <ResultSummary event={event} />;

  if (wallet.authLoading) return null;
  if (!wallet.signedIn) {
    return (
      <section className={PANEL}>
        <h2 className={TITLE}>Make your prediction</h2>
        <p className="mb-4 text-sm text-text-secondary">Sign in to predict with your points. {PUBLIC_PICKS_NOTICE}</p>
        <Button variant="outline" onClick={wallet.login}>Sign in</Button>
      </section>
    );
  }
  const summary = wallet.summary.data;
  if (wallet.summary.isPending) return <p role="status" className="text-sm text-text-dim">Checking your points…</p>;
  if (!summary) return null;
  if (summary.enrolled !== true) {
    return (
      <section className={PANEL}>
        <h2 className={TITLE}>Make your prediction</h2>
        <p className="mb-4 text-sm text-text-secondary">Get this season's starting points to make this prediction. {PUBLIC_PICKS_NOTICE}</p>
        <Button disabled={wallet.enrolling} onClick={wallet.enroll}>Start predicting</Button>
      </section>
    );
  }
  return <PredictForm event={event} viewerId={wallet.viewerId} available={summary.spendable} onPlaced={onPlaced} />;
}

function PredictForm({ event, viewerId, available, onPlaced }: {
  event: PredictionEvent;
  viewerId: number | null;
  available: string | null;
  onPlaced: (message: string) => void;
}) {
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const [outcomeId, setOutcomeId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  const paid = pointInputToMinor(input);
  const over = paid !== null && exceedsPoints(paid, available);
  const estimateAmount = useDebounced(paid !== null && !over ? paid : null, 350);
  const estimate = useQuery(queries.predictionEstimate(viewerId, event.id, outcomeId, estimateAmount));
  // A match outcome whose team is not yet set cannot be picked; custom outcomes always can.
  const pickable = event.outcomes.filter(outcome => event.kind === "custom" || outcome.teamId !== null);

  const placing = useMutation({
    mutationFn: (next: Attempt) => placePrediction(event.id, next.outcomeId, next.paid, next.requestId),
    onSuccess: async (_, placed) => {
      setAttempt(null);
      setInput("");
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      const outcome = outcomeById(event, placed.outcomeId);
      onPlaced(`Prediction placed on ${outcome ? outcomeName(event, outcome) : "that outcome"}.`);
    },
    onError: async error => {
      if (!(error instanceof ApiError) || error.status >= 500) return;
      setAttempt(null);
      if (error.status === 401) await refresh();
      if (error.status === 409) await qc.invalidateQueries({ queryKey: queryRoots.predictions });
    },
  });

  const locked = attempt !== null;
  const place = () => {
    if (placing.isPending) return;
    const next = attempt ?? (outcomeId !== null && paid !== null && !over ? { requestId: crypto.randomUUID(), outcomeId, paid } : null);
    if (!next) return;
    setAttempt(next);
    placing.mutate(next);
  };

  const onRadioKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step === 0 || locked || pickable.length === 0) return;
    e.preventDefault();
    const current = pickable.findIndex(outcome => outcome.id === outcomeId);
    const next = pickable[current === -1 ? 0 : (current + step + pickable.length) % pickable.length];
    setOutcomeId(next.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-outcome="${next.id}"]`)?.focus();
  };

  return (
    <section className={PANEL}>
      <h2 className={TITLE}>Make your prediction</h2>
      <p className="mb-4 text-sm text-text-secondary">{PUBLIC_PICKS_NOTICE}</p>

      <div
        role="radiogroup"
        aria-label={event.kind === "custom" ? event.title ?? "Pick an outcome" : "Pick the series winner"}
        className="grid gap-3 sm:grid-cols-2"
        onKeyDown={onRadioKey}
      >
        {event.outcomes.map(outcome => {
          const selected = outcome.id === outcomeId;
          const share = shareText(outcome, event);
          const canPick = pickable.includes(outcome);
          return (
            <button
              key={outcome.id}
              data-outcome={outcome.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (outcomeId === null && outcome === pickable[0]) ? 0 : -1}
              disabled={!canPick || locked}
              onClick={() => setOutcomeId(outcome.id)}
              className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-md border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? "border-brand bg-bg3" : "border-border hover:bg-accent"
              }`}
            >
              {event.kind === "match" ? <>
                {outcome.team && <TeamBadge team={toBadge(outcome.team)} size={32} />}
                <span className="min-w-0 flex-1 truncate font-heading text-sm text-text-bright">{outcomeName(event, outcome)}</span>
              </> : (
                <OutcomeLabel event={event} outcome={outcome} linked={false} size={28} className="flex-1 font-heading text-sm text-text-bright" />
              )}
              {share && <span className="shrink-0 font-mono text-xs text-text-secondary">{share}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <Label htmlFor="prediction-points" className="mb-1">Points</Label>
        <div className="relative">
          <Input
            id="prediction-points"
            className="pr-16"
            inputMode="decimal"
            placeholder="0"
            value={input}
            disabled={locked}
            onChange={e => setInput(e.target.value)}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-dim">points</span>
        </div>
        <p className="mt-1.5 text-xs text-text-dim">{pointsText(available)} available</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PREDICTION_QUICK_AMOUNTS.map(points => {
            const minor = String(points * 100);
            return (
              <Button key={points} variant="outline" size="sm" disabled={locked || exceedsPoints(minor, available)} onClick={() => setInput(String(points))}>
                {points}
              </Button>
            );
          })}
          <Button variant="outline" size="sm" disabled={locked || !isPositivePoints(available)} onClick={() => available && setInput(minorToPointInput(available))}>
            Max
          </Button>
        </div>
        {over && <p className="mt-2 text-sm text-ccs-red">That is more than your available points.</p>}
      </div>

      {outcomeId !== null && estimateAmount !== null && (
        <div className="mt-4 rounded-md border border-border bg-bg3 p-3" aria-live="polite">
          {estimate.isPending ? <p role="status" className="text-sm text-text-dim">Estimating…</p>
            : estimate.error ? <ErrorLine message={predictionErrorText(estimate.error)} />
            : estimate.data && <>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <dt className="text-text-secondary">Your points</dt>
                <dd className="text-right font-mono text-text-bright">{pointsText(estimate.data.paid)}</dd>
                {isPositivePoints(estimate.data.bonus) && <>
                  <dt className="text-text-secondary">First-prediction bonus</dt>
                  <dd className="text-right font-mono text-text-bright">{pointsText(estimate.data.bonus)}</dd>
                </>}
                <dt className="text-text-secondary">Potential return</dt>
                <dd className="text-right font-mono text-text-bright">{pointsText(estimate.data.estimatedReturn)}</dd>
              </dl>
              <p className="mt-2 text-xs text-text-dim">Estimates change as others predict, until {closingPoint(event.kind)}.</p>
            </>}
        </div>
      )}

      <Button
        className="mt-4 w-full"
        disabled={placing.isPending || (!locked && (outcomeId === null || paid === null || over))}
        onClick={place}
      >
        {placing.isPending ? "Placing…" : locked ? "Retry" : "Place prediction"}
      </Button>
      {placing.error && <ErrorLine message={predictionErrorText(placing.error)} />}
    </section>
  );
}

function ResultSummary({ event }: { event: PredictionEvent }) {
  const winner = outcomeById(event, event.result?.winnerOutcomeId);
  const winnerName = winner ? outcomeName(event, winner) : "The winner";
  const score = event.kind === "match" ? event.result?.score : null;
  const text = event.state === "settled"
    ? `${winnerName} won${score ? ` ${Math.max(score.teamA, score.teamB)}-${Math.min(score.teamA, score.teamB)}` : ""}.`
    : event.state === "voided"
      ? `Voided: ${voidReasonText(event.result?.voidReason ?? null) ?? "no reason given"}. Points were refunded.`
      : event.state === "review"
        ? `Under review${event.reviewReason ? `: ${REVIEW_REASON_LABEL[event.reviewReason]}` : ""}. Payouts wait until it is resolved.`
        : event.state === "locked"
          ? event.kind === "custom"
            ? "Predictions closed. Waiting for league staff to resolve it."
            : "Predictions closed at kickoff. Waiting for the result."
          : "Predictions are not open yet.";
  return (
    <section className={PANEL}>
      <h2 className={TITLE}>{event.state === "settled" || event.state === "voided" ? "Result" : "Predictions closed"}</h2>
      <p className="text-sm text-text-secondary">{text}</p>
    </section>
  );
}
