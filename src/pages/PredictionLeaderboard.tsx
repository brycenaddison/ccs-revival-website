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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TILE_COLOR = "var(--text-bright)";

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
          <Table containerClassName="rounded-lg border border-border bg-bg2" className="w-full min-w-[480px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-16">Rank</TableHead>
                  {/* `w-full` gives this column whatever the numbers do not need. Its cells carry `max-w-0`
                      so a long name truncates, but only once the row is genuinely full. */}
                  <TableHead scope="col" className="w-full">Player</TableHead>
                  <TableHead scope="col" className="text-right">Wealth</TableHead>
                  <TableHead scope="col" className="text-right">Net profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((leader, index) => {
                  const mine = wallet.viewerId !== null && leader.player?.profileId === wallet.viewerId;
                  return (
                    <TableRow key={`${leader.rank}-${leader.player?.profileId ?? index}`} className={mine ? "bg-bg3" : ""}>
                      <TableCell className="font-mono text-text-bright">{leader.rank}</TableCell>
                      <TableCell className="max-w-0 font-heading text-text-bright">
                        <div className="flex min-w-0 items-center gap-2">
                          <PlayerIdentity player={leader.player ?? { profileId: null, name: null, avatar: null, verified: false }} />
                          {mine && <span className="shrink-0 font-heading text-[10px] text-text-dim">You</span>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-text-bright">{pointsText(leader.wealth)}</TableCell>
                      <TableCell className={`whitespace-nowrap text-right font-mono ${signedPointsTone(leader.netProfit)}`}>{signedPointsText(leader.netProfit)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          <p className="mt-2 text-xs text-text-dim">Wealth is available points plus points in unsettled predictions.</p>
          <CursorPager pages={pages} nextCursor={page.nextCursor} />
        </>}
    </div>
  );
}
