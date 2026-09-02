/**
 * Turning a flat fixture feed into what a page draws.
 *
 * `GET /schedule` answers one list ordered by resolved kickoff, which is the right shape to serve and
 * the wrong one to read: a hundred rows with a timestamp each is a wall. Both `/scores` and `/schedule`
 * break it into date sections instead, so this is shared rather than written twice.
 *
 * **Sections come from the date, never from `seasonDay`.** That number is a join key — see `CLAUDE.md`
 * — and it is not the number a viewer would recognize anyway.
 */

import { feedMatchKey, type FeedMatch, type FeedPage } from "./api";
import { fmtDay } from "./utils";

export interface FeedDay {
  /** Stable list key. The local calendar day, or `tbc`. */
  key: string;
  /** The heading: `Sat 12 Sep`, or `Date TBC` for fixtures nothing dates yet. */
  label: string;
  matches: FeedMatch[];
}

/** The local calendar day of an instant, as a key. Local, because the site renders local times. */
function dayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Consecutive runs of one calendar day, **in the order served**.
 *
 * A new group starts whenever the day changes rather than by collecting every row of a day together,
 * which is the same thing while the feed is ordered by kickoff and the honest thing if it ever isn't.
 * Nothing here sorts.
 *
 * Undated fixtures — a bracket slot nobody has reached — fall into a `tbc` group. Upstream sorts them
 * last in both directions, so in practice that is one trailing section.
 */
export function groupByDay(matches: readonly FeedMatch[]): FeedDay[] {
  const days: FeedDay[] = [];

  for (const match of matches) {
    const key = match.scheduledAt === null ? null : dayKey(match.scheduledAt);
    const last = days[days.length - 1];

    if (last && last.key === (key ?? "tbc")) {
      last.matches.push(match);
      continue;
    }

    days.push({
      key: key ?? "tbc",
      label: key === null ? "Date TBC" : fmtDay(match.scheduledAt),
      matches: [match],
    });
  }

  return days;
}

/**
 * The pages of a cursored feed as one list.
 *
 * Deduplicated on `feedMatchKey` (the fixture id, or the series key on a legacy row), because the cursor is an **inclusive** `to` and consecutive pages
 * therefore overlap at the instant they meet — see `queries.scores`. The overlap is deliberate (the
 * alternative skips fixtures), so removing it is this function's job. First occurrence wins, which
 * keeps the served order intact.
 */
export function flattenFeedPages(pages: readonly FeedPage[]): FeedMatch[] {
  const seen = new Set<string>();
  const out: FeedMatch[] = [];

  for (const page of pages) {
    for (const match of page.matches) {
      if (seen.has(match.scheduleMatchId)) continue;
      seen.add(match.scheduleMatchId);
      out.push(match);
    }
  }

  return out;
}
