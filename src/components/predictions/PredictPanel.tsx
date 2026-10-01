/**
 * Placing a prediction, on the detail page. The only place on the site that places one.
 *
 * Pick a team, enter points (the presets only fill the input; any amount can be typed), and the
 * estimate updates as a debounced read-only query. One button places it. The server rechecks the
 * deadline, recorded play and funds at acceptance, so every check here is guidance.
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
import { shareText } from "./PoolBar";
import { REVIEW_REASON_LABEL, voidReasonText } from "./predictionLabels";
import type { PredictionWallet } from "./usePredictionWallet";
import { useDebounced } from "../../hooks/useDebounced";
import { useAuth } from "../../lib/authContext";
import { ApiError, errorMessage, placePrediction, type PredictionEvent } from "../../lib/api";
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

interface Attempt { requestId: string; teamId: number; paid: string }

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
        <p className="mb-4 text-sm text-text-secondary">Sign in to pick a winner with your points.</p>
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
        <p className="mb-4 text-sm text-text-secondary">Get your starting points to predict this match.</p>
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
  const [teamId, setTeamId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  const paid = pointInputToMinor(input);
  const over = paid !== null && exceedsPoints(paid, available);
  const estimateAmount = useDebounced(paid !== null && !over ? paid : null, 350);
  const estimate = useQuery(queries.predictionEstimate(viewerId, event.id, teamId, estimateAmount));
  const teamName = (id: number | null) => event.outcomes.find(outcome => outcome.teamId === id)?.team?.name ?? "that team";

  const placing = useMutation({
    mutationFn: (next: Attempt) => placePrediction(event.id, next.teamId, next.paid, next.requestId),
    onSuccess: async (_, placed) => {
      setAttempt(null);
      setInput("");
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      onPlaced(`Prediction placed on ${teamName(placed.teamId)}.`);
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
    const next = attempt ?? (teamId !== null && paid !== null && !over ? { requestId: crypto.randomUUID(), teamId, paid } : null);
    if (!next) return;
    setAttempt(next);
    placing.mutate(next);
  };

  const onRadioKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) || locked) return;
    e.preventDefault();
    const ids = event.outcomes.flatMap(outcome => outcome.teamId === null ? [] : [outcome.teamId]);
    const next = ids.find(id => id !== teamId) ?? ids[0];
    if (next !== undefined) setTeamId(next);
  };

  return (
    <section className={PANEL}>
      <h2 className={TITLE}>Make your prediction</h2>

      <div role="radiogroup" aria-label="Pick the series winner" className="grid gap-3 sm:grid-cols-2" onKeyDown={onRadioKey}>
        {event.outcomes.map((outcome, index) => {
          const selected = outcome.teamId !== null && outcome.teamId === teamId;
          const share = shareText(outcome, event);
          return (
            <button
              key={outcome.teamId ?? `tbd-${index}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (teamId === null && index === 0) ? 0 : -1}
              disabled={outcome.teamId === null || locked}
              onClick={() => setTeamId(outcome.teamId)}
              className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-md border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                selected ? "border-brand bg-bg3" : "border-border hover:bg-accent"
              }`}
            >
              {outcome.team && <TeamBadge team={toBadge(outcome.team)} size={32} />}
              <span className="min-w-0 flex-1 truncate font-heading text-sm text-text-bright">{outcome.team?.name ?? "TBD"}</span>
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

      {teamId !== null && estimateAmount !== null && (
        <div className="mt-4 rounded-md border border-border bg-bg3 p-3" aria-live="polite">
          {estimate.isPending ? <p role="status" className="text-sm text-text-dim">Estimating…</p>
            : estimate.error ? <ErrorLine message={errorMessage(estimate.error)} />
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
              <p className="mt-2 text-xs text-text-dim">Estimates change as others predict, until kickoff.</p>
            </>}
        </div>
      )}

      <Button
        className="mt-4 w-full"
        disabled={placing.isPending || (!locked && (teamId === null || paid === null || over))}
        onClick={place}
      >
        {placing.isPending ? "Placing…" : locked ? "Retry" : "Place prediction"}
      </Button>
      {placing.error && <ErrorLine message={errorMessage(placing.error)} />}
    </section>
  );
}

function ResultSummary({ event }: { event: PredictionEvent }) {
  const winner = event.outcomes.find(outcome => outcome.teamId !== null && outcome.teamId === event.result?.winnerTeamId)?.team;
  const score = event.result?.score;
  const text = event.state === "settled"
    ? `${winner?.name ?? "The winner"} won${score ? ` ${Math.max(score.teamA, score.teamB)}-${Math.min(score.teamA, score.teamB)}` : ""}.`
    : event.state === "voided"
      ? `Voided: ${voidReasonText(event.result?.voidReason ?? null) ?? "no reason given"}. Points were refunded.`
      : event.state === "review"
        ? `Under review${event.reviewReason ? `: ${REVIEW_REASON_LABEL[event.reviewReason]}` : ""}. Payouts wait until it is resolved.`
        : event.state === "locked"
          ? "Predictions closed at kickoff. Waiting for the result."
          : "Predictions are not open yet.";
  return (
    <section className={PANEL}>
      <h2 className={TITLE}>{event.state === "settled" || event.state === "voided" ? "Result" : "Predictions closed"}</h2>
      <p className="text-sm text-text-secondary">{text}</p>
    </section>
  );
}
