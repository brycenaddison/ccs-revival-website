/**
 * How the pool splits between the two teams, as one bar in the teams' own colors.
 *
 * Team colors here are established data-driven branding, so they are inline styles; an unset color
 * falls back to `DEFAULT_TEAM_HEX`. Shares are display arithmetic only (`poolSharePercent`) and
 * never feed a payout. An empty pool draws an empty track rather than an invented 50/50.
 *
 * `labels` adds each side's points and share under the bar, team A left and team B right, for
 * places that do not already list them beside the team names.
 */

import type { PredictionEvent, PredictionOutcome } from "../../lib/api";
import { DEFAULT_TEAM_HEX } from "../../lib/leagueAdapters";
import { poolSharePercent, pointsText } from "../../lib/predictionPoints";

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
