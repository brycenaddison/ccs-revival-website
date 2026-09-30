/**
 * Controls for cursor pages, on `useCursorPage`.
 *
 * `CursorPager` pages in place (Previous/Next), for ranked tables where a page is a unit.
 * `ShowMore` appends the next page below the ones already shown, for newest-first lists.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import type { CursorPages } from "../hooks/useCursorPage";

export function CursorPager({ pages, nextCursor }: { pages: CursorPages; nextCursor: string | null }) {
  if (!pages.hasPrevious && !nextCursor) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" disabled={!pages.hasPrevious} onClick={pages.previous}>
        <ChevronLeft size={14} aria-hidden="true" />
        Previous
      </Button>
      <Button variant="outline" size="sm" disabled={!nextCursor} onClick={() => nextCursor && pages.next(nextCursor)}>
        Next
        <ChevronRight size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ShowMore({ pages, nextCursor, loading }: { pages: CursorPages; nextCursor: string | null; loading?: boolean }) {
  if (!nextCursor && !loading) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" size="sm" disabled={loading || !nextCursor} onClick={() => nextCursor && pages.next(nextCursor)}>
        {loading ? "Loading…" : "Show more"}
      </Button>
    </div>
  );
}
