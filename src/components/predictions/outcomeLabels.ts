/**
 * Plain-text names for prediction outcomes, events and reward policies, for headings, toasts, aria
 * labels and metadata. Rendered outcomes with crests or faces use `OutcomeLabel`.
 *
 * A match outcome is its team, "TBD" while the wire team is null; a custom outcome is the label
 * staff entered. A match event is "Alpha vs Bravo" in served order; a custom event is its title.
 */

import type { PredictionEvent, PredictionOutcome, PredictionRewardPolicy } from "../../lib/api";
import { pointsText } from "../../lib/predictionPoints";

export function outcomeName(event: Pick<PredictionEvent, "kind">, outcome: PredictionOutcome): string {
  if (event.kind === "match") return outcome.team?.name || "TBD";
  return outcome.label ?? outcome.team?.name ?? outcome.profile?.name ?? "Unnamed outcome";
}

export function outcomeById(event: PredictionEvent, outcomeId: number | null | undefined): PredictionOutcome | null {
  return outcomeId === null || outcomeId === undefined ? null : event.outcomes.find(outcome => outcome.id === outcomeId) ?? null;
}

export function eventName(event: PredictionEvent): string {
  if (event.kind === "custom") return event.title ?? "League prediction";
  return event.outcomes.map(outcome => outcomeName(event, outcome)).join(" vs ");
}

/**
 * "100 points daily, growing by 100 per streak to 500", or "200 points weekly". The cap is the
 * policy's own amount times its streak cap, which is how the API describes a scaling reward.
 */
export function rewardPolicyText(policy: PredictionRewardPolicy): string {
  const base = `${pointsText(policy.amount)} points ${policy.cadence}`;
  if (policy.mode === "flat" || policy.streakCap <= 1) return base;
  const cap = (BigInt(policy.amount) * BigInt(policy.streakCap)).toString();
  return `${base}, growing by ${pointsText(policy.amount)} per streak to ${pointsText(cap)}`;
}
