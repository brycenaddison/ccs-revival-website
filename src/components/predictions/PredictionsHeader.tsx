/**
 * The predictions hub's header, shared by its three tabs: heading, subtitle, points and a link tab
 * strip. My predictions appears only when signed in. On mobile the points wrap under the title and
 * the strip scrolls sideways.
 *
 * All predictions carries the league selection, because it lists each selected league's match and
 * custom markets; the leaderboard (which has its own prediction seasons) and your own predictions
 * span every league.
 *
 * The reward rule comes from the public `/settings` read, so anonymous visitors see it too. A
 * failure there hides the rule rather than adding a second error line. `unavailable` leaves only
 * the heading, since the hub's notice replaces the points, the errors and the tabs.
 */

import { useQuery } from "@tanstack/react-query";
import { ErrorLine } from "../admin/adminUi";
import { UnderlineTabs } from "../UnderlineTabs";
import { WalletChip } from "./WalletChip";
import { rewardPolicyText } from "./outcomeLabels";
import { predictionErrorText } from "./predictionLabels";
import type { PredictionWallet } from "./usePredictionWallet";
import { useSeasonLink } from "../../lib/leagueContext";
import { queries } from "../../lib/queries";

export type PredictionsTab = "matches" | "leaderboard" | "mine";

export function PredictionsHeader({ wallet, tab, unavailable }: {
  wallet: PredictionWallet;
  tab: PredictionsTab;
  unavailable: boolean;
}) {
  const seasonLink = useSeasonLink();
  const calendar = useQuery(queries.predictionSiteCalendar());
  const rewards = calendar.data?.rewards;
  const rule = rewards?.enabled && rewards.policy ? `Claim ${rewardPolicyText(rewards.policy)}.` : null;
  const tabs = [
    { key: "matches" as const, label: "All predictions", to: seasonLink("/predictions") },
    { key: "leaderboard" as const, label: "Leaderboard", to: "/predictions/leaderboard" },
    ...(wallet.signedIn ? [{ key: "mine" as const, label: "My predictions", to: "/my-predictions" }] : []),
  ];
  const error = wallet.summary.error ?? wallet.enrollError ?? wallet.claimError;

  return (
    <>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] text-text-bright">Predictions</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Predict match winners and league questions with points.{rule && ` ${rule}`}
          </p>
        </div>
        {!unavailable && <WalletChip wallet={wallet} />}
      </header>
      {!unavailable && (
        <>
          {error && <div className="-mt-2 mb-3"><ErrorLine message={predictionErrorText(error)} /></div>}
          <UnderlineTabs label="Predictions" tabs={tabs} selected={tab} />
        </>
      )}
    </>
  );
}
