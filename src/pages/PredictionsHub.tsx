/**
 * The predictions hub: one layout route for Matches (`/predictions`), Leaderboard
 * (`/predictions/leaderboard`) and My predictions (`/my-predictions`).
 *
 * A layout rather than a header each page renders, so the header, and with it the enroll and claim
 * commands, stays mounted while the reader switches tabs. A claim started on Matches still lands if
 * the reader opens Leaderboard before it returns. Tabs read the wallet through `usePredictionsHub`.
 *
 * The tab pages are lazy, so the outlet has its own Suspense boundary: without it a tab switch would
 * suspend up to `SiteLayout` and blank the header too.
 */

import { Suspense } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { Toast } from "../components/Toast";
import { PredictionsHeader, type PredictionsTab } from "../components/predictions/PredictionsHeader";
import { usePredictionWallet, type PredictionWallet } from "../components/predictions/usePredictionWallet";

export default function PredictionsHub() {
  const wallet = usePredictionWallet();
  const { pathname } = useLocation();
  const tab: PredictionsTab = pathname.startsWith("/my-predictions")
    ? "mine"
    : pathname.startsWith("/predictions/leaderboard") ? "leaderboard" : "matches";

  return (
    <PageShell maxWidth={1100}>
      <PredictionsHeader wallet={wallet} tab={tab} />
      <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-text-dim">Loading…</p>}>
        <Outlet context={wallet} />
      </Suspense>
      <Toast message={wallet.notice} onClose={wallet.clearNotice} />
    </PageShell>
  );
}

export function usePredictionsHub(): PredictionWallet {
  return useOutletContext<PredictionWallet>();
}
