/**
 * The predictions hub: one layout route for Open (`/predictions`), Results (`/predictions/results`),
 * Leaderboard (`/predictions/leaderboard`) and My predictions (`/my-predictions`).
 *
 * A layout rather than a header each page renders, so the header, and with it the enroll and claim
 * commands, stays mounted while the reader switches tabs. A claim started on Open still lands if the
 * reader opens Leaderboard before it returns. Tabs read the wallet through `usePredictionsHub`.
 *
 * The division filter lives here too, so a pick carries between Open and Results. It narrows the
 * nav's season picker without calling `setSelection` (see `DivisionPicker`), and shows only on those
 * two tabs, since the leaderboard and your own predictions span every league. A pick that leaves the
 * selection falls back to every division.
 *
 * The tab pages are lazy, so the outlet has its own Suspense boundary: without it a tab switch would
 * suspend up to `SiteLayout` and blank the header too.
 *
 * When the API answers `predictions_unavailable` on the public calendar or the viewer's summary,
 * the hub shows one notice in place of the tabs rather than an error under every read that fails.
 */

import { Suspense, useMemo, useState } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "../components/layout/PageShell";
import { DivisionPicker } from "../components/league/DivisionPicker";
import { PredictionsHeader, type PredictionsTab } from "../components/predictions/PredictionsHeader";
import { PredictionsUnavailable } from "../components/predictions/PredictionsUnavailable";
import { usePredictionWallet, type PredictionWallet } from "../components/predictions/usePredictionWallet";
import { isPredictionsUnavailable } from "../lib/api";
import { groupLabels } from "../lib/leagueAdapters";
import { useLeague } from "../lib/leagueContext";
import { queries } from "../lib/queries";

export interface PredictionsHubContext {
  wallet: PredictionWallet;
  /** The selected confs the division filter leaves, in selection order. */
  confs: readonly string[];
  labels: ReadonlyMap<string, string>;
}

export default function PredictionsHub() {
  const wallet = usePredictionWallet();
  // The header's key, so this shares its request.
  const calendar = useQuery(queries.predictionSiteCalendar());
  const unavailable = isPredictionsUnavailable(calendar.error) || isPredictionsUnavailable(wallet.summary.error);
  const { pathname } = useLocation();
  const tab: PredictionsTab = pathname.startsWith("/my-predictions") ? "mine"
    : pathname.startsWith("/predictions/leaderboard") ? "leaderboard"
    : pathname.startsWith("/predictions/results") ? "results"
    : "open";

  const { selectedConfs, tournaments } = useLeague();
  const [divisionPick, setDivisionPick] = useState<string | null>(null);
  const division = divisionPick && selectedConfs.includes(divisionPick) ? divisionPick : null;
  const labels = useMemo(() => groupLabels(tournaments, selectedConfs), [tournaments, selectedConfs]);
  const context: PredictionsHubContext = { wallet, confs: division ? [division] : selectedConfs, labels };

  return (
    <PageShell maxWidth={1100}>
      <PredictionsHeader wallet={wallet} tab={tab} unavailable={unavailable} />
      {unavailable ? <PredictionsUnavailable /> : (
        <>
          {(tab === "open" || tab === "results") && (
            <DivisionPicker
              confs={selectedConfs}
              selected={division}
              labels={labels}
              onSelect={setDivisionPick}
              all={{ label: "All divisions", onSelect: () => setDivisionPick(null) }}
            />
          )}
          <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-text-dim">Loading…</p>}>
            <Outlet context={context} />
          </Suspense>
        </>
      )}
    </PageShell>
  );
}

export function usePredictionsHub(): PredictionsHubContext {
  return useOutletContext<PredictionsHubContext>();
}
