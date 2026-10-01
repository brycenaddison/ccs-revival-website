/**
 * One published prediction as a card, for the Matches tab (full) and Home (compact).
 *
 * The card itself is not a link, because the team names inside it are: the footer button is the way
 * in, "Predict" while open and "View" after. Cards carry no league label; a division heading above
 * them does that job when more than one conf is shown.
 *
 * `position` is the viewer's own, from `usePredictionPositions`, and is absent for anonymous
 * viewers. The caption is the served placement and format only; nothing is inferred when the event
 * has no phase.
 */

import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamLabel } from "./MatchupLabel";
import { PoolBar, shareText } from "./PoolBar";
import { PredictionStatusChip } from "./PredictionStatusChip";
import { closesText, usePredictionClock } from "./PredictionUi";
import { pickNames } from "./usePredictionPositions";
import { REVIEW_REASON_LABEL, voidReasonText } from "./predictionLabels";
import { placementLabel, type PredictionEvent, type PredictionOutcome, type PredictionPosition } from "../../lib/api";
import { pointsText } from "../../lib/predictionPoints";
import { fmtKickoff } from "../../lib/utils";

export function predictionPath(eventId: number): string {
  return `/predictions/${eventId}`;
}

/** "Playoffs · Round 2 · Bo3", from served fields only. */
export function predictionCaption(event: PredictionEvent): string {
  return [placementLabel(event.phase, 0), event.bestOf ? `Bo${event.bestOf}` : null].filter(Boolean).join(" · ");
}

export function PredictionCard({ event, position, compact = false }: {
  event: PredictionEvent;
  position?: PredictionPosition | null;
  compact?: boolean;
}) {
  const now = usePredictionClock(event.serverNow);
  const [a, b] = event.outcomes;
  const open = event.state === "open";
  const caption = predictionCaption(event);

  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-border bg-bg2 p-4">
      {!compact && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-heading text-[11px] text-text-muted">{caption}</span>
          <PredictionStatusChip state={event.state} />
        </header>
      )}
      <OutcomeRow event={event} outcome={a} score={event.result?.score?.teamA ?? null} compact={compact} />
      {!compact && <PoolBar event={event} className="my-2.5" />}
      <OutcomeRow event={event} outcome={b} score={event.result?.score?.teamB ?? null} compact={compact} />
      {compact && <PoolBar event={event} className="mt-2.5" />}
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="min-w-0 font-heading text-xs text-text-secondary">{footerText(event, position, now)}</p>
        <Button asChild size="sm" variant={open ? "default" : "outline"}>
          <Link to={predictionPath(event.id)}>{open ? "Predict" : "View"}</Link>
        </Button>
      </footer>
    </article>
  );
}

function OutcomeRow({ event, outcome, score, compact }: {
  event: PredictionEvent;
  outcome: PredictionOutcome;
  score: number | null;
  compact: boolean;
}) {
  const settled = event.state === "settled";
  const winnerId = event.result?.winnerTeamId ?? null;
  const won = settled && winnerId !== null && outcome.teamId === winnerId;
  const share = shareText(outcome, event);
  return (
    <div className={`flex min-w-0 items-center gap-2 ${settled && !won ? "opacity-60" : ""}`}>
      {settled && (
        <span className="w-4 shrink-0 text-ccs-green">
          {won && <Check size={14} aria-label="Winner" />}
        </span>
      )}
      <TeamLabel team={outcome.team} conf={event.conf} size={28} className="flex-1 font-heading text-sm text-text-bright" />
      {settled && score !== null && <span className="w-5 shrink-0 text-center font-display text-base text-text-bright">{score}</span>}
      {!compact && <span className="shrink-0 font-mono text-xs text-text-secondary">{pointsText(outcome.pool)} pts</span>}
      <span className="w-10 shrink-0 text-right font-mono text-xs text-text-secondary">{share ?? ""}</span>
    </div>
  );
}

function footerText(event: PredictionEvent, position: PredictionPosition | null | undefined, now: string): string {
  const picked = pickNames(event, position);
  const returned = position?.returned ?? null;
  const refunded = position?.refunded ?? null;
  const join = (parts: (string | null)[]) => parts.filter((part): part is string => !!part).join(" · ");
  switch (event.state) {
    case "open":
    case "scheduled":
      return join([closesText(event.closesAt, now), picked && `Your pick: ${picked}`]);
    case "settled":
      return picked
        ? join([`You picked ${picked}`, returned !== null ? `Returned ${pointsText(returned)} pts` : null])
        : fmtKickoff(event.closesAt);
    case "voided":
      return picked
        ? join([`You picked ${picked}`, refunded !== null ? `Refunded ${pointsText(refunded)} pts` : null])
        : voidReasonText(event.result?.voidReason ?? null) ?? fmtKickoff(event.closesAt);
    case "review":
      return join([event.reviewReason ? REVIEW_REASON_LABEL[event.reviewReason] : null, picked && `Your pick: ${picked}`])
        || fmtKickoff(event.closesAt);
    case "locked":
      return picked ? `Your pick: ${picked}` : fmtKickoff(event.closesAt);
  }
}
