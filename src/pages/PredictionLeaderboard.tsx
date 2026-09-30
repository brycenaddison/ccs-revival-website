/**
 * The Leaderboard tab of the predictions hub: `/predictions/leaderboard`.
 *
 * Served ranks and order, ties included; nothing is re-ranked here. Cursors are positions in the
 * served ranking, so a page can shift while scores move. The viewer's own rank comes from their
 * summary, so it shows whichever page is open, and their row is highlighted when it is on the page.
 */

import { useQuery } from "@tanstack/react-query";
import { ErrorLine } from "../components/admin/adminUi";
import { CursorPager } from "../components/CursorPager";
import { PlayerIdentity } from "../components/players/PlayerIdentity";
import { StatTile } from "../components/stats/StatTile";
import { useCursorPage } from "../hooks/useCursorPage";
import { errorMessage } from "../lib/api";
import { pointsText, signedPointsText, signedPointsTone } from "../lib/predictionPoints";
import { queries } from "../lib/queries";
import { usePredictionsHub } from "./PredictionsHub";

const TILE_COLOR = "var(--text-bright)";
const HEAD = "px-3 py-2 text-left font-heading text-[10px] font-medium text-text-muted";

export default function PredictionLeaderboard() {
  const wallet = usePredictionsHub();
  const pages = useCursorPage();
  const board = useQuery(queries.predictionLeaderboard(pages.cursor));
  const standing = wallet.summary.data?.standing ?? null;
  const page = board.data;

  return (
    <div>
      {standing && (
        <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-xl">
          <StatTile label="Your rank" value={String(standing.rank)} color={TILE_COLOR} />
          <StatTile label="Wealth" value={pointsText(standing.wealth)} color={TILE_COLOR} />
          <StatTile label="Net profit" value={signedPointsText(standing.netProfit)} color={TILE_COLOR} />
        </div>
      )}

      {board.isPending ? <p role="status" className="py-6 text-sm text-text-dim">Loading the leaderboard…</p>
        : board.error ? <ErrorLine message={errorMessage(board.error)} />
        : !page || page.items.length === 0 ? <p className="rounded-lg border border-border bg-bg2 p-5 text-sm text-text-secondary">No one is on the leaderboard yet.</p>
        : <>
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-bg2">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr>
                  <th scope="col" className={`${HEAD} w-16`}>Rank</th>
                  <th scope="col" className={HEAD}>Player</th>
                  <th scope="col" className={`${HEAD} text-right`}>Wealth</th>
                  <th scope="col" className={`${HEAD} text-right`}>Net profit</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((leader, index) => {
                  const mine = wallet.viewerId !== null && leader.player?.profileId === wallet.viewerId;
                  return (
                    <tr key={`${leader.rank}-${leader.player?.profileId ?? index}`} className={`border-t border-border ${mine ? "bg-bg3" : ""}`}>
                      <td className="px-3 py-2 font-mono text-text-bright">{leader.rank}</td>
                      <td className="max-w-0 px-3 py-2 font-heading text-text-bright">
                        <PlayerIdentity player={leader.player ?? { profileId: null, name: null, avatar: null, verified: false }} />
                        {mine && <span className="ml-2 font-heading text-[10px] text-text-dim">You</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-bright">{pointsText(leader.wealth)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${signedPointsTone(leader.netProfit)}`}>{signedPointsText(leader.netProfit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-text-dim">Wealth is available points plus points in unsettled predictions.</p>
          <CursorPager pages={pages} nextCursor={page.nextCursor} />
        </>}
    </div>
  );
}
