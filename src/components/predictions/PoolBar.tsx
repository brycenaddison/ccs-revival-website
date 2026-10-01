/**
 * How the pool splits between the two teams, as one bar in the teams' own colors.
 *
 * Team colors here are established data-driven branding, so they are inline styles; an unset color
 * falls back to `DEFAULT_TEAM_HEX`. Shares are display arithmetic only (`poolSharePercent`) and
 * never feed a payout. An empty pool draws an empty track rather than an invented 50/50.
 *
 * `labels` adds each side's points and share under the bar, team A left and team B right, for
 * places that do not already list them beside the team names.
 *
 * `PoolBar` is for match markets, which always have exactly two team-colored sides. A custom
 * market's pool is `OutcomeShares`: one row per outcome in served position order, each with a thin
 * brand-colored share bar, and a check on the winner once settled. `compact` lists the first four.
 */

import { Check } from "lucide-react";
import { OutcomeLabel } from "./MatchupLabel";
import type { PredictionEvent, PredictionOutcome } from "../../lib/api";
import { DEFAULT_TEAM_HEX } from "../../lib/leagueAdapters";
import { poolSharePercent, pointsText } from "../../lib/predictionPoints";

const COMPACT_OUTCOMES = 4;

export function shareText(outcome: PredictionOutcome, event: PredictionEvent): string | null {
  const share = poolSharePercent(outcome.pool, event.totalPool);
  return share === null ? null : `${Math.round(share)}%`;
}

export function PoolBar({ event, labels = false, className = "" }: {
  event: PredictionEvent;
  labels?: boolean;
  className?: string;
}) {
  const [a, b] = event.outcomes;
  const share = poolSharePercent(a.pool, event.totalPool);
  const name = (outcome: PredictionOutcome) => outcome.team?.name ?? "Team to be announced";
  const description = share === null
    ? "No points in the pool yet"
    : `${name(a)} ${shareText(a, event)}, ${name(b)} ${shareText(b, event)} of the pool`;

  return (
    <div className={className}>
      <div role="img" aria-label={description} className="flex h-2 overflow-hidden rounded-full bg-bg3">
        {share !== null && (
          <>
            <span style={{ width: `${share}%`, background: a.team?.colorHex ?? DEFAULT_TEAM_HEX }} />
            <span style={{ width: `${100 - share}%`, background: b.team?.colorHex ?? DEFAULT_TEAM_HEX }} />
          </>
        )}
      </div>
      {labels && (
        <div className="mt-1.5 flex justify-between gap-3 font-mono text-[11px] text-text-secondary">
          <span>{pointsText(a.pool)} pts{share !== null && ` · ${shareText(a, event)}`}</span>
          <span>{pointsText(b.pool)} pts{share !== null && ` · ${shareText(b, event)}`}</span>
        </div>
      )}
    </div>
  );
}

export function OutcomeShares({ event, compact = false, className = "" }: {
  event: PredictionEvent;
  compact?: boolean;
  className?: string;
}) {
  const shown = compact ? event.outcomes.slice(0, COMPACT_OUTCOMES) : event.outcomes;
  const hidden = event.outcomes.length - shown.length;
  const settled = event.state === "settled";
  const winnerId = event.result?.winnerOutcomeId ?? null;
  return (
    <ul className={`min-w-0 space-y-2 ${className}`}>
      {shown.map(outcome => {
        const share = poolSharePercent(outcome.pool, event.totalPool);
        const won = settled && winnerId !== null && outcome.id === winnerId;
        return (
          <li key={outcome.id} className={`min-w-0 ${settled && !won ? "opacity-60" : ""}`}>
            <div className="flex min-w-0 items-center gap-2">
              {settled && (
                <span className="w-4 shrink-0 text-ccs-green">
                  {won && <Check size={14} aria-label="Winner" />}
                </span>
              )}
              <OutcomeLabel event={event} outcome={outcome} className="flex-1 font-heading text-sm text-text-bright" />
              {!compact && <span className="shrink-0 font-mono text-xs text-text-secondary">{pointsText(outcome.pool)} pts</span>}
              <span className="w-10 shrink-0 text-right font-mono text-xs text-text-secondary">{shareText(outcome, event) ?? ""}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-1 overflow-hidden rounded-full bg-bg3">
              {share !== null && <span className="block h-full rounded-full bg-brand" style={{ width: `${share}%` }} />}
            </div>
          </li>
        );
      })}
      {hidden > 0 && <li className="font-heading text-xs text-text-dim">+{hidden} more</li>}
    </ul>
  );
}
