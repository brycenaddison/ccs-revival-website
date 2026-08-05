/**
 * Everything still to play, in date sections.
 *
 * **Deliberately unbounded.** Any `from` or `to` excludes a fixture with no resolved kickoff, and those
 * are exactly the rows a schedule page should carry: a bracket slot nobody has reached yet is the next
 * thing a reader wants to see. They arrive last from upstream in both directions and `groupByDay`
 * collects them under one trailing "Date TBC" heading.
 *
 * `pending` also covers a kickoff that passed with nobody turning up. Those sit under their own past
 * date, which reads honestly — the fixture is still unplayed and still on the schedule.
 */

import { useMemo } from "react";
import { errorMessage } from "../../lib/api";
import { groupByDay } from "../../lib/feedGroups";
import { useScheduleFeed, type FeedWindow } from "../../hooks/useScheduleFeed";
import { FeedMatchRow } from "../schedule/FeedMatchRow";

const WINDOW: FeedWindow = { statuses: ["live", "upcoming", "pending"], order: "asc", limit: 100 };

export function ScheduleView({ isMobile }: { isMobile: boolean }) {
  const { data, error, isPending } = useScheduleFeed(WINDOW);
  const days = useMemo(() => groupByDay(data?.matches ?? []), [data]);

  if (isPending) {
    return <div className="py-10 text-center text-[13px] text-text-subtle">Loading the schedule…</div>;
  }
  if (error) {
    return <div className="py-10 text-center text-[13px] text-ccs-red">{errorMessage(error)}</div>;
  }
  if (days.length === 0) {
    return <div className="py-10 text-center text-[13px] text-text-dim">No upcoming matches scheduled.</div>;
  }

  return (
    <div className="mx-auto max-w-[800px]">
      <h2 className="mb-4 font-display text-[22px] tracking-widest text-text-bright">SCHEDULE</h2>

      {days.map(day => (
        <section key={day.key} className="mb-6">
          <h3 className="mb-2 font-heading text-[11px] uppercase tracking-widest text-text-muted">
            {day.label}
          </h3>
          <div className="flex flex-col gap-2">
            {day.matches.map(m => (
              <FeedMatchRow key={m.scheduleMatchId} match={m} isMobile={isMobile} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
