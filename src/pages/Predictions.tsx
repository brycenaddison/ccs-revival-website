/**
 * The Matches tab of the predictions hub: `/predictions`.
 *
 * Scoped by the nav's season picker (`useLeague().selectedConfs`), with no filters of its own. Per
 * conf, "Open now" leads with the next kickoff (`sort=closesAt`), then "Results" lists every closed
 * state newest first (`sort=-closesAt`) with Show more. Both orders are served; nothing here sorts.
 *
 * With several divisions selected, each gets a block headed by its `groupLabels` name and empty
 * blocks are omitted. With one conf there is no division heading. The first page of each list is
 * read here as well as in its block to decide whether anything shows at all; the keys are shared,
 * so that costs no extra request.
 *
 * Every block stays mounted and hides itself when empty. A refetch with no data resets a query to
 * pending, so a parent that mounted blocks by content would unmount one mid-refetch and remount it
 * when the error returned, and each remount would fetch again.
 */

import { useQueries } from "@tanstack/react-query";
import { ErrorLine } from "../components/admin/adminUi";
import { ShowMore } from "../components/CursorPager";
import { PredictionCard } from "../components/predictions/PredictionCard";
import { usePredictionPositions } from "../components/predictions/usePredictionPositions";
import { useCursorPage } from "../hooks/useCursorPage";
import { errorMessage, type PredictionEvent, type PredictionPage, type PredictionPosition } from "../lib/api";
import { groupLabels } from "../lib/leagueAdapters";
import { useLeague } from "../lib/leagueContext";
import { queries } from "../lib/queries";

const EMPTY = "No open predictions right now. New matches are published each week.";

export default function Predictions() {
  const { selectedConfs, tournaments, loading } = useLeague();
  const open = useQueries({ queries: selectedConfs.map(conf => queries.openPredictions(conf)) });
  const results = useQueries({ queries: selectedConfs.map(conf => queries.predictionResults(conf)) });

  if (loading) return <Status>Loading predictions…</Status>;
  if (selectedConfs.length === 1) return <ConfPredictions key={selectedConfs[0]} conf={selectedConfs[0]} heading={null} />;

  const labels = groupLabels(tournaments, selectedConfs);
  const lists = [...open, ...results];
  // A failing division counts as content, so its error is seen rather than silently omitted.
  const anyContent = lists.some(result => (result.data?.items.length ?? 0) > 0 || !!result.error);
  const anyPending = lists.some(result => result.isPending);

  return (
    <div className="space-y-10">
      {!anyContent && (anyPending ? <Status>Loading predictions…</Status> : <Empty />)}
      {selectedConfs.map(conf => <ConfPredictions key={conf} conf={conf} heading={labels.get(conf) ?? conf} />)}
    </div>
  );
}

/** `heading` is null for a lone conf, which always renders; a division block hides when empty. */
function ConfPredictions({ conf, heading }: { conf: string; heading: string | null }) {
  const openPages = useCursorPage();
  const resultPages = useCursorPage();
  const open = useQueries({ queries: openPages.cursors.map(cursor => queries.openPredictions(conf, cursor)) });
  const results = useQueries({ queries: resultPages.cursors.map(cursor => queries.predictionResults(conf, cursor)) });
  const pageIds = [...open, ...results].map(result => (result.data?.items ?? []).map(event => event.id));
  const { byEvent } = usePredictionPositions(pageIds);

  const first = open[0];
  const openEvents = open.flatMap(result => result.data?.items ?? []);
  const resultEvents = results.flatMap(result => result.data?.items ?? []);
  const hasContent = openEvents.length > 0 || resultEvents.length > 0 || !!first.error || !!results[0].error;
  // Hidden rather than unmounted, so its queries keep their observers; see the header.
  if (heading !== null && !hasContent) return null;

  return (
    <section aria-label={heading ?? undefined}>
      {heading && <h2 className="mb-4 font-display text-[22px] text-text-bright">{heading}</h2>}

      <h3 className="mb-3 font-heading text-sm text-text-bright">Open now</h3>
      {first.isPending ? <Status>Loading predictions…</Status>
        : first.error ? <ErrorLine message={errorMessage(first.error)} />
        : openEvents.length === 0 ? <Empty />
        : <>
          <CardGrid events={openEvents} byEvent={byEvent} />
          <PageError pages={open} />
          <ShowMore pages={openPages} nextCursor={lastCursor(open)} loading={open.some(result => result.isPending)} />
        </>}

      {results[0].error ? (
        <div className="mt-8"><ErrorLine message={errorMessage(results[0].error)} /></div>
      ) : resultEvents.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 font-heading text-sm text-text-bright">Results</h3>
          <CardGrid events={resultEvents} byEvent={byEvent} />
          <PageError pages={results} />
          <ShowMore pages={resultPages} nextCursor={lastCursor(results)} loading={results.some(result => result.isPending)} />
        </div>
      )}
    </section>
  );
}

function CardGrid({ events, byEvent }: { events: readonly PredictionEvent[]; byEvent: ReadonlyMap<number, PredictionPosition> }) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {events.map(event => <PredictionCard key={event.id} event={event} position={byEvent.get(event.id)} />)}
    </div>
  );
}

/** A later page's failure, below the pages that did load. The first page's failure replaces the list. */
function PageError({ pages }: { pages: readonly { error: unknown }[] }) {
  const failed = pages.slice(1).find(page => page.error);
  return failed ? <ErrorLine message={errorMessage(failed.error)} /> : null;
}

function lastCursor(pages: readonly { data?: PredictionPage }[]): string | null {
  return pages[pages.length - 1]?.data?.nextCursor ?? null;
}

function Status({ children }: { children: string }) {
  return <p role="status" className="py-6 text-sm text-text-dim">{children}</p>;
}

function Empty() {
  return <p className="rounded-lg border border-border bg-bg2 p-5 text-sm text-text-secondary">{EMPTY}</p>;
}
