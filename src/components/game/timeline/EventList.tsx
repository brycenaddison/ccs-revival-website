/** Every filtered event as a row: the time in the side's color, then the sentence. */

import { cn } from "../../../lib/cn";
import { fmtTimestamp } from "../../../lib/game/timelineStats";
import { EventText } from "./EventText";
import { useTimelineView } from "./TimelineTab";

export function EventList() {
  const { events } = useTimelineView();

  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">No events match the filters.</p>;
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {events.map((event, index) => (
        <li key={`${event.type}-${event.timestamp}-${index}`} className="flex min-h-10 overflow-hidden rounded-md border border-border bg-bg2">
          <span
            className={cn(
              "flex w-16 shrink-0 items-center justify-center font-mono text-xs font-semibold text-white",
              event.team === 100 ? "bg-side-blue" : event.team === 200 ? "bg-side-red" : "bg-bg3 text-text-secondary",
            )}
          >
            {fmtTimestamp(event.timestamp)}
          </span>
          {/* A block, not a flex box: a flex container drops the whitespace text nodes between the
              player chips and the words around them, which ran every sentence together. */}
          <p className="m-0 self-center px-3 py-2 text-sm leading-relaxed text-text">
            <EventText event={event} />
          </p>
        </li>
      ))}
    </ol>
  );
}
