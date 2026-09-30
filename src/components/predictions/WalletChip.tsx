/**
 * The hub header's points: a sign-in or start button, or the viewer's available points with a
 * claim button while today's reward is waiting. Reads the summary only.
 */

import { Button } from "../ui/button";
import type { PredictionWallet } from "./usePredictionWallet";
import { pointsText } from "../../lib/predictionPoints";

export function WalletChip({ wallet }: { wallet: PredictionWallet }) {
  const { summary } = wallet;
  if (wallet.authLoading) return null;
  if (!wallet.signedIn) {
    return <Button variant="outline" size="sm" onClick={wallet.login}>Sign in</Button>;
  }
  const data = summary.data;
  // Failures render under the header, where the error has room for its sentence.
  if (!data) return null;
  if (data.enrolled === false) {
    return <Button size="sm" disabled={wallet.enrolling} onClick={wallet.enroll}>Start predicting</Button>;
  }
  if (data.enrolled !== true) return null;
  const rewards = data.rewards;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-baseline gap-1.5 rounded-md border border-border bg-bg3 px-3 py-1.5">
        <span className="font-mono text-sm text-text-bright">{pointsText(data.spendable)}</span>
        <span className="font-heading text-xs text-text-secondary">points</span>
      </span>
      {(rewards?.claimable || wallet.claimRetry) && (
        <Button size="sm" disabled={wallet.claiming} onClick={wallet.claim}>
          {wallet.claimRetry ? "Retry claim" : `Claim ${pointsText(rewards?.nextReward)}`}
        </Button>
      )}
    </div>
  );
}
