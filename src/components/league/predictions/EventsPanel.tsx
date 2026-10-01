/**
 * League Admin > Predictions > Events: the week's published match and custom predictions (and every
 * outstanding one), each with a menu of the staff actions its state allows, and any per-event
 * processing error under its row.
 *
 * Unpaid events (`settlementRevision` 0) can be locked, reopened and voided. Nothing settles a
 * custom market automatically, so an unpaid one can also be resolved once it is locked, under
 * review, or open past its deadline by the API clock (`manage.serverNow`); the worker locks it
 * within a minute of the deadline. A paid result can only be corrected, through its own preview.
 * Voided events are terminal and offer nothing.
 *
 * With `canAct` false the rows stay for review and the menu is omitted.
 */

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ErrorLine } from "../../admin/adminUi";
import { MatchupLabel } from "../../predictions/MatchupLabel";
import { OutcomeShares, PoolBar } from "../../predictions/PoolBar";
import { PredictionStatusChip } from "../../predictions/PredictionStatusChip";
import { absoluteInstant } from "../../predictions/PredictionUi";
import { REVIEW_REASON_LABEL } from "../../predictions/predictionLabels";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ACTION_COPY, EventActionDialog } from "./EventActionDialog";
import { SettlementDialog, type SettlementMode } from "./SettlementDialog";
import type { PredictionEvent, PredictionEventAction, PredictionManage } from "../../../lib/api";
import { pointsText } from "../../../lib/predictionPoints";

type Open =
  | { kind: "action"; event: PredictionEvent; action: PredictionEventAction }
  | { kind: "settle"; event: PredictionEvent; mode: SettlementMode }
  | null;

const paid = (event: PredictionEvent) => (event.settlementRevision ?? 0) > 0;

function actionsFor(event: PredictionEvent): PredictionEventAction[] {
  if (event.state === "voided" || paid(event)) return [];
  if (event.state === "open") return ["lock", "void"];
  if (event.state === "locked" || event.state === "review") return ["reopen", "void"];
  return [];
}
function canResolve(event: PredictionEvent, serverNow: string | null): boolean {
  if (event.kind !== "custom" || paid(event)) return false;
  if (event.state === "locked" || event.state === "review") return true;
  const closes = event.closesAt ? Date.parse(event.closesAt) : NaN, now = serverNow ? Date.parse(serverNow) : NaN;
  return event.state === "open" && Number.isFinite(closes) && Number.isFinite(now) && closes <= now;
}
const canCorrect = (event: PredictionEvent) => paid(event) && event.state !== "voided";

export function EventsPanel({ conf, manage, canAct, onDone }: {
  conf: string;
  manage: PredictionManage;
  canAct: boolean;
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState<Open>(null);

  if (manage.events.length === 0) {
    return <p className="py-6 text-center text-sm text-text-dim">No published predictions this week.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {manage.events.map(event => {
          const actions = canAct ? actionsFor(event) : [];
          const resolvable = canAct && canResolve(event, manage.serverNow);
          const correctable = canAct && canCorrect(event);
          const errors = manage.errors.filter(error => error.eventId === event.id);
          return (
            <li key={event.id} className="px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  {event.kind === "custom"
                    ? <span className="block min-w-0 truncate font-heading text-sm text-text-bright">{event.title}</span>
                    : <MatchupLabel teamA={event.outcomes[0].team} teamB={event.outcomes[1].team} conf={conf} />}
                </div>
                <PredictionStatusChip state={event.state} />
                <span className="font-mono text-xs text-text-secondary">{pointsText(event.totalPool)} pts</span>
                <span className="whitespace-nowrap text-xs text-text-secondary">{absoluteInstant(event.closesAt, manage.siteTimeZone)}</span>
                {(actions.length > 0 || resolvable || correctable) && (
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
                      {resolvable && (
                        <DropdownMenuItem onSelect={() => setOpen({ kind: "settle", event, mode: "resolve" })}>Resolve</DropdownMenuItem>
                      )}
                      {correctable && (
                        <DropdownMenuItem onSelect={() => setOpen({ kind: "settle", event, mode: "correct" })}>Correct result</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {event.kind === "custom"
                ? <OutcomeShares event={event} compact className="mt-2 max-w-md" />
                : <PoolBar event={event} className="mt-2 max-w-md" />}
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
      {open?.kind === "settle" && (
        <SettlementDialog conf={conf} event={open.event} mode={open.mode} onClose={() => setOpen(null)} onDone={onDone} />
      )}
    </>
  );
}
