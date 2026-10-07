/**
 * The My predictions tab of the predictions hub: `/my-predictions`. Signed in only.
 *
 * Points and the reward come from the hub's summary. The reward tile follows the current period's
 * served cadence, mode and streak cap, and names a scheduled policy change. Active predictions are
 * `/me`'s unsettled holdings (up to 100), with picks and potential returns from `me/positions`,
 * because `/me` does not say which outcome each point went to. Settled predictions have no list of
 * their own: `/me` drops them, and the Results tab already marks your picks and returns.
 * History pages the ledger.
 *
 * Enrollment is per leaderboard season, so a returning player sees the start prompt again after a
 * rollover.
 */

import { useQueries, useQuery } from "@tanstack/react-query";
import { RequireAuth } from "../components/auth/RequireAuth";
import { ErrorLine } from "../components/admin/adminUi";
import { ShowMore } from "../components/CursorPager";
import { LedgerTable } from "../components/predictions/LedgerTable";
import { PositionList } from "../components/predictions/PositionList";
import { absoluteInstant, relativeInstant } from "../components/predictions/PredictionUi";
import { useServerClock } from "../hooks/useServerClock";
import { rewardPolicyText } from "../components/predictions/outcomeLabels";
import { CADENCE_LABEL, predictionErrorText } from "../components/predictions/predictionLabels";
import { usePredictionPositions } from "../components/predictions/usePredictionPositions";
import type { PredictionWallet } from "../components/predictions/usePredictionWallet";
import { StatTile } from "../components/stats/StatTile";
import { Button } from "@/components/ui/button";
import { useCursorPage } from "../hooks/useCursorPage";
import { PREDICTION_HOLDINGS_MAX, type PredictionRewards } from "../lib/api";
import { pointsText } from "../lib/predictionPoints";
import { queries } from "../lib/queries";
import { usePredictionsHub } from "./PredictionsHub";

const SECTION_HEADING = "mb-3 font-display text-[22px] text-text-bright";

export default function MyPredictions() {
  const { wallet } = usePredictionsHub();
  return <RequireAuth><Body wallet={wallet} /></RequireAuth>;
}

function Body({ wallet }: { wallet: PredictionWallet }) {
  const summary = wallet.summary.data;
  // A failed summary is reported under the hub header.
  if (wallet.summary.isPending) return <p role="status" className="py-6 text-sm text-text-dim">Loading your points…</p>;
  if (!summary) return null;
  if (summary.enrolled !== true) {
    return (
      <section className="rounded-lg border border-border bg-bg2 p-5">
        <h2 className="font-display text-[22px] text-text-bright">Start predicting</h2>
        <p className="mt-1 mb-4 text-sm text-text-secondary">
          Get this season&apos;s starting points, then predict match winners and league questions. Rewards add more.
        </p>
        <Button disabled={wallet.enrolling} onClick={wallet.enroll}>Start predicting</Button>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Available points"
          value={pointsText(summary.spendable)}
          color="var(--text-bright)"
          hint={summary.balance !== summary.spendable ? `Balance ${pointsText(summary.balance)} after a correction` : undefined}
        />
        {summary.rewards && <RewardTile rewards={summary.rewards} wallet={wallet} />}
      </div>
      <ActivePredictions viewerId={wallet.viewerId} />
      <History viewerId={wallet.viewerId} />
    </div>
  );
}

function RewardTile({ rewards, wallet }: { rewards: PredictionRewards; wallet: PredictionWallet }) {
  const now = useServerClock(rewards.serverNow);
  // A scaling reward grows with each claim up to the cap, so it draws one segment per step; a flat
  // reward pays the same each time and only counts the streak.
  const steps = rewards.mode === "scaling" ? rewards.streakCap : null;
  const streak = Math.max(rewards.streak ?? 0, 0);
  const resets = relativeInstant(rewards.resetsAt, now);
  const upcoming = rewards.upcoming;
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-bg3 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-[9px] text-text-muted">{rewards.cadence ? `${CADENCE_LABEL[rewards.cadence]} reward` : "Reward"}</span>
        {resets && <span className="font-heading text-[10px] text-text-dim">Resets {resets}</span>}
      </div>
      {steps ? (
        <div className="flex gap-1" role="img" aria-label={`Streak ${Math.min(streak, steps)} of ${steps}`}>
          {Array.from({ length: steps }, (_, index) => (
            <span key={index} className={`h-1.5 flex-1 rounded-full ${index < streak ? "bg-brand" : "bg-bg-input"}`} />
          ))}
        </div>
      ) : (
        <span className="font-heading text-xs text-text-secondary">Streak {streak}</span>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-heading text-sm text-text-bright">
          {rewards.claimable ? "Ready: " : "Next: "}
          <span className="font-mono">{pointsText(rewards.nextReward)}</span> points
        </span>
        {(rewards.claimable || wallet.claimRetry) && (
          <Button size="sm" disabled={wallet.claiming} onClick={wallet.claim}>{wallet.claimRetry ? "Retry claim" : "Claim"}</Button>
        )}
      </div>
      {upcoming && (
        <p className="text-xs text-text-dim">
          From {absoluteInstant(upcoming.effectiveAt) ?? "the next reset"}: {rewardPolicyText(upcoming)}.
        </p>
      )}
    </div>
  );
}

function ActivePredictions({ viewerId }: { viewerId: number | null }) {
  const portfolio = useQuery(queries.myPredictions(viewerId));
  const holdings = portfolio.data?.holdings ?? [];
  const { byEvent, error } = usePredictionPositions([holdings.map(holding => holding.eventId)]);
  return (
    <section>
      <h2 className={SECTION_HEADING}>Active predictions</h2>
      {portfolio.isPending ? <p role="status" className="text-sm text-text-dim">Loading your predictions…</p>
        : portfolio.error ? <ErrorLine message={predictionErrorText(portfolio.error)} />
        : holdings.length === 0 ? <p className="text-sm text-text-secondary">No active predictions. Settled ones, with their returns, are under Results.</p>
        : <>
          {portfolio.data?.truncated && <p className="mb-3 text-xs text-text-dim">Showing your first {PREDICTION_HOLDINGS_MAX} active predictions.</p>}
          <PositionList rows={holdings.map(holding => ({
            eventId: holding.eventId, event: holding.event, position: byEvent.get(holding.eventId) ?? null, paid: holding.paid,
          }))} />
          {!!error && <ErrorLine message={predictionErrorText(error)} />}
        </>}
    </section>
  );
}

function History({ viewerId }: { viewerId: number | null }) {
  const pages = useCursorPage();
  const results = useQueries({ queries: pages.cursors.map(cursor => queries.predictionHistory(viewerId, cursor)) });
  const entries = results.flatMap(result => result.data?.items ?? []);
  const first = results[0];
  const failed = results.find(result => result.error);
  return (
    <section>
      <h2 className={SECTION_HEADING}>History</h2>
      {first.isPending ? <p role="status" className="text-sm text-text-dim">Loading your history…</p>
        : entries.length === 0 && !failed ? <p className="text-sm text-text-secondary">No point history yet.</p>
        : <>
          {entries.length > 0 && <LedgerTable entries={entries} />}
          {failed && <ErrorLine message={predictionErrorText(failed.error)} />}
          <ShowMore pages={pages} nextCursor={results[results.length - 1]?.data?.nextCursor ?? null} loading={results.some(result => result.isPending)} />
        </>}
    </section>
  );
}
