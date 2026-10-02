/**
 * The predictions hub: one layout route for All predictions (`/predictions`), Leaderboard
 * (`/predictions/leaderboard`) and My predictions (`/my-predictions`).
 *
 * A layout rather than a header each page renders, so the header, and with it the enroll and claim
 * commands, stays mounted while the reader switches tabs. A claim started on All predictions still
 * lands if the reader opens Leaderboard before it returns. Tabs read the wallet through
 * `usePredictionsHub`.
 *
 * The tab pages are lazy, so the outlet has its own Suspense boundary: without it a tab switch would
 * suspend up to `SiteLayout` and blank the header too.
 *
 * When the API answers `predictions_unavailable` on the public calendar or the viewer's summary,
 * the hub shows one notice in place of the tabs rather than an error under every read that fails.
 */

import { Suspense } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "../components/layout/PageShell";
import { PredictionsHeader, type PredictionsTab } from "../components/predictions/PredictionsHeader";
import { PredictionsUnavailable } from "../components/predictions/PredictionsUnavailable";
import { usePredictionWallet, type PredictionWallet } from "../components/predictions/usePredictionWallet";
import { isPredictionsUnavailable } from "../lib/api";
import { queries } from "../lib/queries";

export default function PredictionsHub() {
  const wallet = usePredictionWallet();
  // The header's key, so this shares its request.
  const calendar = useQuery(queries.predictionSiteCalendar());
  const unavailable = isPredictionsUnavailable(calendar.error) || isPredictionsUnavailable(wallet.summary.error);
  const { pathname } = useLocation();
  const tab: PredictionsTab = pathname.startsWith("/my-predictions")
    ? "mine"
    : pathname.startsWith("/predictions/leaderboard") ? "leaderboard" : "matches";

  return (
    <PageShell maxWidth={1100}>
      <PredictionsHeader wallet={wallet} tab={tab} unavailable={unavailable} />
      {unavailable ? <PredictionsUnavailable /> : (
        <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-text-dim">Loading…</p>}>
          <Outlet context={wallet} />
        </Suspense>
      )}
    </PageShell>
  );
}

export function usePredictionsHub(): PredictionWallet {
  return useOutletContext<PredictionWallet>();
}
