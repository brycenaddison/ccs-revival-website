/**
 * An average game length on a standings row, as m:ss. `null` is a team with no timed games in that
 * scope (forfeits and remakes are never timed), shown as a dash and named for screen readers.
 */

import { fmtSec } from "../../lib/api";

export function AvgGameTime({ seconds }: { seconds: number | null }) {
  if (seconds === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">No timed games</span>
      </>
    );
  }
  return <>{fmtSec(seconds)}</>;
}
