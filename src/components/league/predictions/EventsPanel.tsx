/**
 * League Admin > Predictions > Events: the week's published events, each with a menu of the staff
 * actions its state allows, and any per-event processing error under its row.
 *
 * Unpaid events (`settlementRevision` 0) can be locked, reopened and voided; a paid result can only
 * be corrected, through its own preview. Voided events are terminal and offer nothing.
 *
 * With `canAct` false the rows stay for review and the menu is omitted.
 */

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ErrorLine } from "../../admin/adminUi";
import { MatchupLabel } from "../../predictions/MatchupLabel";
import { PoolBar } from "../../predictions/PoolBar";
import { PredictionStatusChip } from "../../predictions/PredictionStatusChip";
import { absoluteInstant } from "../../predictions/PredictionUi";
import { REVIEW_REASON_LABEL } from "../../predictions/predictionLabels";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CorrectionDialog } from "./CorrectionDialog";
import { ACTION_COPY, EventActionDialog } from "./EventActionDialog";
import type { PredictionEvent, PredictionEventAction, PredictionManage } from "../../../lib/api";
import { pointsText } from "../../../lib/predictionPoints";

type Open = { kind: "action"; event: PredictionEvent; action: PredictionEventAction } | { kind: "correct"; event: PredictionEvent } | null;

function actionsFor(event: PredictionEvent): PredictionEventAction[] {
  if (event.state === "voided" || (event.settlementRevision ?? 0) > 0) return [];
  if (event.state === "open") return ["lock", "void"];
  if (event.state === "locked" || event.state === "review") return ["reopen", "void"];
  return [];
}
const canCorrect = (event: PredictionEvent) => (event.settlementRevision ?? 0) > 0 && event.state !== "voided";

export function EventsPanel({ conf, manage, canAct, onDone }: {
  conf: string;
  manage: PredictionManage;
  canAct: boolean;
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState<Open>(null);

  if (manage.events.length === 0) {
    return <p className="py-6 text-center text-sm text-text-dim">No published matches this week.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {manage.events.map(event => {
          const actions = canAct ? actionsFor(event) : [];
          const correctable = canAct && canCorrect(event);
          const errors = manage.errors.filter(error => error.eventId === event.id);
          return (
            <li key={event.id} className="px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <MatchupLabel teamA={event.outcomes[0].team} teamB={event.outcomes[1].team} conf={conf} />
                </div>
                <PredictionStatusChip state={event.state} />
                <span className="font-mono text-xs text-text-secondary">{pointsText(event.totalPool)} pts</span>
                <span className="whitespace-nowrap text-xs text-text-secondary">{absoluteInstant(event.closesAt, manage.siteTimeZone)}</span>
                {(actions.length > 0 || correctable) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Actions" disabled={event.revision === null}>
                        <MoreHorizontal size={16} aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {actions.map(action => (
                        <DropdownMenuItem key={action} onSelect={() => setOpen({ kind: "action", event, action })}>
                          {ACTION_COPY[action].label}
                        </DropdownMenuItem>
                      ))}
                      {correctable && (
                        <DropdownMenuItem onSelect={() => setOpen({ kind: "correct", event })}>Correct result</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <PoolBar event={event} className="mt-2 max-w-md" />
              {event.state === "review" && event.reviewReason && (
                <p className="mt-2 text-xs text-text-secondary">{REVIEW_REASON_LABEL[event.reviewReason]}</p>
              )}
              {errors.map((error, index) => <ErrorLine key={index} message={error.error} />)}
            </li>
          );
        })}
      </ul>
      {open?.kind === "action" && (
        <EventActionDialog conf={conf} event={open.event} action={open.action} onClose={() => setOpen(null)} onDone={onDone} />
      )}
      {open?.kind === "correct" && (
        <CorrectionDialog conf={conf} event={open.event} onClose={() => setOpen(null)} onDone={onDone} />
      )}
    </>
  );
}
