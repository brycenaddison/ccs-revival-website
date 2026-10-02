/**
 * The Leaderboard tab of the predictions hub: `/predictions/leaderboard`.
 *
 * Served ranks and order, ties included; nothing is re-ranked here. Cursors are positions in the
 * served ranking, so a page can shift while scores move. The viewer's own rank comes from their
 * summary, so it shows whichever page is open, and their row is highlighted when it is on the page.
 *
 * The board runs in prediction seasons. `?season=<id>` selects a closed season's frozen final
 * standings and is omitted for the open season, so a past board is a shareable link. The board is
 * keyed by season so its cursor pages reset on a switch. The viewer's standing tiles describe the
 * open season only, so a closed board hides them.
 */

import { useId } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ErrorLine } from "../components/admin/adminUi";
import { CursorPager } from "../components/CursorPager";
import { PlayerIdentity } from "../components/players/PlayerIdentity";
import { StatTile } from "../components/stats/StatTile";
import { useCursorPage } from "../hooks/useCursorPage";
import { PredictionsUnavailable } from "../components/predictions/PredictionsUnavailable";
import { errorMessage, isPredictionsUnavailable, type PredictionSeason } from "../lib/api";
import { pointsText, signedPointsText, signedPointsTone } from "../lib/predictionPoints";
import { queries } from "../lib/queries";
import { fmtDate } from "../lib/utils";
import { usePredictionsHub } from "./PredictionsHub";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TILE_COLOR = "var(--text-bright)";

export default function PredictionLeaderboard() {
  const wallet = usePredictionsHub();
  const [search, setSearch] = useSearchParams();
  const seasons = useQuery(queries.predictionSeasons());
  const openSeason = seasons.data?.find(season => season.endedAt === null) ?? null;
  const requested = Number(search.get("season"));
  const season = Number.isSafeInteger(requested) && requested > 0 && requested !== openSeason?.id ? requested : null;
  const standing = season === null ? wallet.summary.data?.standing ?? null : null;

  const select = (id: number) => {
    const params = new URLSearchParams(search);
    if (id === openSeason?.id) params.delete("season");
    else params.set("season", String(id));
    setSearch(params);
  };

  return (
    <div>
      {seasons.data && seasons.data.length > 1 && (
        <SeasonPicker seasons={seasons.data} value={season ?? openSeason?.id ?? null} onChange={select} />
      )}
      {standing && (
        <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-xl">
          <StatTile label="Your rank" value={String(standing.rank)} color={TILE_COLOR} />
          <StatTile label="Wealth" value={pointsText(standing.wealth)} color={TILE_COLOR} />
          <StatTile label="Net profit" value={signedPointsText(standing.netProfit)} color={TILE_COLOR} />
        </div>
      )}
      <Board key={season ?? "open"} season={season} viewerId={wallet.viewerId} />
    </div>
  );
}

function SeasonPicker({ seasons, value, onChange }: {
  seasons: readonly PredictionSeason[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const id = useId();
  return (
    <div className="mb-5 max-w-xs">
      <Label htmlFor={id} className="mb-1">Season</Label>
      <NativeSelect id={id} value={value ?? ""} onChange={e => onChange(Number(e.target.value))}>
        {seasons.map(season => (
          <NativeSelectOption key={season.id} value={season.id}>
            {season.endedAt === null ? `${season.name} (current)` : season.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function Board({ season, viewerId }: { season: number | null; viewerId: number | null }) {
  const pages = useCursorPage();
  const board = useQuery(queries.predictionLeaderboard(season, pages.cursor));
  const page = board.data;
  const closed = page?.season?.endedAt ? page.season : null;

  return board.isPending ? <p role="status" className="py-6 text-sm text-text-dim">Loading the leaderboard…</p>
    : isPredictionsUnavailable(board.error) ? <PredictionsUnavailable />
    : board.error ? <ErrorLine message={errorMessage(board.error)} />
    : <>
      {closed && (
        <p className="mb-3 font-heading text-sm text-text-secondary">
          Final standings, {fmtDate(closed.startedAt)} to {fmtDate(closed.endedAt)}
        </p>
      )}
      {!page || page.items.length === 0
        ? <p className="rounded-lg border border-border bg-bg2 p-5 text-sm text-text-secondary">No one is on the leaderboard yet.</p>
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
                  const mine = viewerId !== null && leader.player?.profileId === viewerId;
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
    </>;
}
