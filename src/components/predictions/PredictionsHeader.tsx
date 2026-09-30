/**
 * The predictions hub's header, shared by its three tabs: heading, subtitle, points and a link tab
 * strip. My predictions appears only when signed in. On mobile the points wrap under the title and
 * the strip scrolls sideways.
 *
 * Matches carries the season selection, because it is the one seasonal tab; the leaderboard and
 * your own predictions are cross-season.
 */

import { ErrorLine } from "../admin/adminUi";
import { UnderlineTabs } from "../UnderlineTabs";
import { WalletChip } from "./WalletChip";
import type { PredictionWallet } from "./usePredictionWallet";
import { errorMessage } from "../../lib/api";
import { useSeasonLink } from "../../lib/leagueContext";

export type PredictionsTab = "matches" | "leaderboard" | "mine";

export function PredictionsHeader({ wallet, tab }: { wallet: PredictionWallet; tab: PredictionsTab }) {
  const seasonLink = useSeasonLink();
  const tabs = [
    { key: "matches" as const, label: "Matches", to: seasonLink("/predictions") },
    { key: "leaderboard" as const, label: "Leaderboard", to: "/predictions/leaderboard" },
    ...(wallet.signedIn ? [{ key: "mine" as const, label: "My predictions", to: "/my-predictions" }] : []),
  ];
  const error = wallet.summary.error ?? wallet.enrollError ?? wallet.claimError;

  return (
    <>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] text-text-bright">Predictions</h1>
          <p className="mt-1 text-sm text-text-secondary">Pick series winners with points. Pools update until kickoff.</p>
        </div>
        <WalletChip wallet={wallet} />
      </header>
      {error && <div className="-mt-2 mb-3"><ErrorLine message={errorMessage(error)} /></div>}
      <UnderlineTabs label="Predictions" tabs={tabs} selected={tab} />
    </>
  );
}
