/**
 * Every participant's paid picks for a visible event, independent of the viewer's session: one
 * column per outcome in served position order, each ranked by the API by paid points, highest first.
 *
 * The first page of every column arrives in one read that polls while the event is open; each
 * column's Show more pages its own cursor. Later pages do not poll, so a player whose stake grew
 * can appear on a fresher first page and a stale later page; the column keeps the first row.
 * A player who backs several outcomes appears in each of those columns.
 *
 * Match columns carry the team's color as a top rule, the same data-driven branding as `PoolBar`.
 * Once settled, the winning column gets a check and the others dim, as in `OutcomeShares`.
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShowMore } from "../CursorPager";
import { ErrorLine } from "../admin/adminUi";
import { PlayerIdentity } from "../players/PlayerIdentity";
import { OutcomeLabel } from "./MatchupLabel";
import { useCursorPage } from "../../hooks/useCursorPage";
import { errorMessage, type PredictionEvent, type PredictionOutcome, type PredictionOutcomePicks } from "../../lib/api";
import { DEFAULT_TEAM_HEX } from "../../lib/leagueAdapters";
import { pointsText } from "../../lib/predictionPoints";
import { queries } from "../../lib/queries";

export function PublicPositions({ event }: { event: PredictionEvent }) {
  const board = useQuery(queries.publicPredictionPicks(event.id, event.state === "open"));
  const columns = board.data;

  return (
    <section className="min-w-0 rounded-lg border border-border bg-bg2 p-5">
      <h2 className="mb-2 font-display text-[22px] text-text-bright">Picks</h2>
      <p className="mb-4 text-sm text-text-secondary">Picks and points placed are public immediately. Players can back more than one outcome.</p>
      {board.isPending ? <p role="status" className="text-sm text-text-dim">Loading picks…</p>
        : board.error ? <Alert variant="destructive"><AlertDescription>{errorMessage(board.error)}</AlertDescription></Alert>
        : !columns ? <Alert><AlertDescription>Public picks are not available yet.</AlertDescription></Alert>
        : <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {event.outcomes.map(outcome => (
            <OutcomeColumn key={outcome.id} event={event} outcome={outcome}
              first={columns.find(column => column.outcomeId === outcome.id) ?? null} />
          ))}
        </div>}
    </section>
  );
}

function OutcomeColumn({ event, outcome, first }: {
  event: PredictionEvent;
  outcome: PredictionOutcome;
  first: PredictionOutcomePicks | null;
}) {
  const pages = useCursorPage();
  const later = useQueries({
    queries: pages.cursors.flatMap(cursor => cursor === null ? [] : [queries.publicPredictionOutcomePicks(event.id, outcome.id, cursor)]),
  });
  const loaded = [first, ...later.map(result => result.data?.find(column => column.outcomeId === outcome.id) ?? null)];
  const seen = new Set<number>();
  const picks = loaded.flatMap(page => page?.picks ?? []).filter(pick => {
    if (seen.has(pick.player.profileId)) return false;
    seen.add(pick.player.profileId);
    return true;
  });
  const nextCursor = loaded[loaded.length - 1]?.nextCursor ?? null;
  const loading = later.some(result => result.isPending);
  const failed = later.find(result => result.error)?.error;

  const winnerId = event.state === "settled" ? event.result?.winnerOutcomeId ?? null : null;
  const won = winnerId !== null && outcome.id === winnerId;
  const participants = first?.participants ?? null;

  return (
    <div className={`min-w-0 overflow-hidden rounded-md border border-border ${winnerId !== null && !won ? "opacity-60" : ""}`}>
      {event.kind === "match" && <div aria-hidden="true" className="h-1" style={{ background: outcome.team?.colorHex ?? DEFAULT_TEAM_HEX }} />}
      <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-2.5">
        {won && <Check size={14} aria-label="Winner" className="shrink-0 text-ccs-green" />}
        <OutcomeLabel event={event} outcome={outcome} className="flex-1 font-heading text-sm text-text-bright" />
        <span className="shrink-0 font-mono text-xs text-text-secondary">
          {participants !== null && `${participants} ${participants === 1 ? "player" : "players"} · `}{pointsText(outcome.pool)} pts
        </span>
      </div>
      {picks.length === 0 ? <p className="px-3 py-4 text-sm text-text-dim">No picks yet.</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-full">Player</TableHead>
              <TableHead scope="col" className="text-right">Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {picks.map(pick => (
              <TableRow key={pick.player.profileId}>
                <TableCell className="max-w-0 font-heading text-text-bright"><PlayerIdentity player={pick.player} small /></TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono text-text-bright">{pointsText(pick.paid)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {(failed || nextCursor || loading) && (
        <div className="px-3 pb-3">
          {failed && <ErrorLine message={errorMessage(failed)} />}
          <ShowMore pages={pages} nextCursor={failed ? null : nextCursor} loading={loading} />
        </div>
      )}
    </div>
  );
}
