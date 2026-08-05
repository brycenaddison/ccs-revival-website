/**
 * How a code operation reports what it did.
 *
 * Shared because three call sites report the same `IngestedGame[]` — confirming a code, re-checking
 * one match, and re-checking a whole day — and three copies of "1 new game recorded" would drift
 * apart on the pluralisation if nothing else.
 */

import type { CodeSweep, IngestedGame } from "../../../lib/api";

/**
 * What a set of ingest results amounts to.
 *
 * Six statuses, counted separately rather than summed, because they mean different things to the
 * person reading the line:
 *
 *  - `ingested` is the only wholly new result.
 *  - `duplicate` is the ordinary case for a code from Discord — the game was already in `matchlist`
 *    and got linked rather than re-inserted.
 *  - `partial` **counted, stats missing**: the `matchlist` row and match payload are written, so the
 *    standings and the match viewer are right; only `playerstats` and `championstats` skip it,
 *    because Riot no longer had the timeline or the game was too short to derive from. Calling that
 *    a failure would send an admin chasing a game that landed.
 *  - `result-only` **counted, nothing else**: Riot reported the game on the code but denies the match
 *    id exists, so the row was written from the reported winner and loser alone. The standings are
 *    right; there is no payload, so the game is not viewable at all. Counted apart from `partial` for
 *    the same reason the API keeps them apart — a re-check once Riot's index recovers is what repairs
 *    it, and an admin has to know which of the two they are looking at.
 *  - `forfeited` wrote nothing **on purpose**: the series was decided by walkover and this game is not
 *    allowed to move it. Reported rather than folded into `duplicate`, because it is the one outcome
 *    with an action behind it — clear the forfeit and re-check — and because a night of them read as
 *    "already known" would look like the codes had already been ingested.
 *  - `failed` wrote nothing, and carries a `reason` worth repeating verbatim.
 */
export function describeIngest(ingested: readonly IngestedGame[]): string {
  const of = (status: IngestedGame["status"]) => ingested.filter(g => g.status === status);
  const fresh = of("ingested").length;
  const known = of("duplicate").length;
  const partial = of("partial");
  const resultOnly = of("result-only");
  const forfeited = of("forfeited").length;
  const failed = of("failed");

  const parts: string[] = [];
  if (fresh > 0) parts.push(`${fresh} new ${fresh === 1 ? "game" : "games"} recorded`);
  if (known > 0) parts.push(`${known} already known and now linked`);
  if (partial.length > 0) {
    parts.push(
      `${partial.length} recorded without player stats (${partial.length === 1 ? "it counts" : "they count"} for the standings)`,
    );
  }
  if (resultOnly.length > 0) {
    // Named by their result, because that is all there is: Riot has no game to look at, so "1
    // recorded as a result only" with the winner is the whole of what landed.
    const which = resultOnly
      .map(g => (g.winner === undefined || g.loser === undefined ? null : `${g.winner} beat ${g.loser}`))
      .filter((s): s is string => s !== null);

    parts.push(
      `${resultOnly.length} recorded as ${resultOnly.length === 1 ? "a result" : "results"} only, with no game data${
        which.length === 0 ? "" : ` (${which.join(", ")})`
      }`,
    );
  }
  if (forfeited > 0) {
    parts.push(
      `${forfeited} skipped because the match was forfeited (clear the forfeit and re-check to record ${forfeited === 1 ? "it" : "them"})`,
    );
  }
  if (failed.length > 0) parts.push(`${failed.length} couldn't be recorded`);

  const summary = parts.length === 0 ? "Nothing to record." : `${parts.join(", ")}.`;
  // The API writes these to be read; the first one is worth more than "1 couldn't be recorded".
  const why = failed[0]?.reason;
  return why === undefined ? summary : `${summary} ${why}`;
}

/**
 * A re-check sweep's result, **including its failures**.
 *
 * The errors are reported rather than folded into the counts on purpose: a Riot failure on one code
 * doesn't stop the sweep, so leaving them out would make a half-failed run read as a clean one that
 * simply found nothing. That confusion is the reason this API was rewritten.
 */
export function describeSweep(sweep: CodeSweep): string {
  const looked =
    sweep.checked === 0
      ? "No codes were waiting on a game."
      : `Re-checked ${sweep.checked} ${sweep.checked === 1 ? "code" : "codes"}. ${describeIngest(sweep.ingested)}`;

  return sweep.errors.length === 0
    ? looked
    : `${looked} ${sweep.errors.length} ${sweep.errors.length === 1 ? "code" : "codes"} Riot wouldn't answer for — try again.`;
}
