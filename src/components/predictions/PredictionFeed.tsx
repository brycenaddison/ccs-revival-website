/**
 * One prediction list per conf, shared by the hub's Open (`queries.openPredictions`, next deadline
 * first) and Results (`queries.predictionResults`, every closed state newest first) tabs. Match and
 * custom predictions share each conf's list, in served order, with no `kind` filter; nothing here
 * sorts. Each conf pages with Show more.
 *
 * `confs` is the hub's division filter applied to the nav's season picker. With several, each gets
 * a block headed by its `groupLabels` name and empty blocks are omitted. With one conf there is no
 * division heading. The first page of each list is read here as well as in its block to decide
 * whether anything shows at all; the keys are shared, so that costs no extra request.
 *
 * Every block stays mounted and hides itself when empty. A refetch with no data resets a query to
 * pending, so a parent that mounted blocks by content would unmount one mid-refetch and remount it
 * when the error returned, and each remount would fetch again.
 */

import { useQueries } from "@tanstack/react-query";
import { ErrorLine } from "../admin/adminUi";
import { ShowMore } from "../CursorPager";
import { PredictionCard } from "./PredictionCard";
import { usePredictionPositions } from "./usePredictionPositions";
import { useCursorPage } from "../../hooks/useCursorPage";
import { errorMessage, type PredictionEvent, type PredictionPage, type PredictionPosition } from "../../lib/api";
import { useLeague } from "../../lib/leagueContext";
import type { queries } from "../../lib/queries";

type PredictionListQuery = typeof queries.openPredictions;

export function PredictionFeed({ confs, labels, list, empty }: {
  confs: readonly string[];
  labels: ReadonlyMap<string, string>;
  list: PredictionListQuery;
  empty: string;
}) {
  const { loading } = useLeague();
  const firstPages = useQueries({ queries: confs.map(conf => list(conf)) });

  if (loading) return <Status>Loading predictions…</Status>;
  if (confs.length === 1) return <ConfFeed key={confs[0]} conf={confs[0]} heading={null} list={list} empty={empty} />;

  // A failing division counts as content, so its error is seen rather than silently omitted.
  const anyContent = firstPages.some(result => (result.data?.items.length ?? 0) > 0 || !!result.error);
  const anyPending = firstPages.some(result => result.isPending);

  return (
    <div className="space-y-10">
      {!anyContent && (anyPending ? <Status>Loading predictions…</Status> : <Empty>{empty}</Empty>)}
      {confs.map(conf => (
        <ConfFeed key={conf} conf={conf} heading={labels.get(conf) ?? conf} list={list} empty={empty} />
      ))}
    </div>
  );
}

/** `heading` is null for a lone conf, which always renders; a division block hides when empty. */
function ConfFeed({ conf, heading, list, empty }: {
  conf: string;
  heading: string | null;
  list: PredictionListQuery;
  empty: string;
}) {
  const pages = useCursorPage();
  const results = useQueries({ queries: pages.cursors.map(cursor => list(conf, cursor)) });
  const { byEvent } = usePredictionPositions(results.map(result => (result.data?.items ?? []).map(event => event.id)));

  const first = results[0];
  const events = results.flatMap(result => result.data?.items ?? []);
  // Hidden rather than unmounted, so its queries keep their observers; see the header.
  if (heading !== null && events.length === 0 && !first.error) return null;

  return (
    <section aria-label={heading ?? undefined}>
      {heading && <h2 className="mb-4 font-display text-[22px] text-text-bright">{heading}</h2>}
      {first.isPending ? <Status>Loading predictions…</Status>
        : first.error ? <ErrorLine message={errorMessage(first.error)} />
        : events.length === 0 ? <Empty>{empty}</Empty>
        : <>
          <CardGrid events={events} byEvent={byEvent} />
          <PageError pages={results} />
          <ShowMore pages={pages} nextCursor={lastCursor(results)} loading={results.some(result => result.isPending)} />
        </>}
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

function Empty({ children }: { children: string }) {
  return <p className="rounded-lg border border-border bg-bg2 p-5 text-sm text-text-secondary">{children}</p>;
}
