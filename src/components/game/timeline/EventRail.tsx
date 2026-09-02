/**
 * Two rails, blue above red, with a dot per minute sized by how much happened; clicking one focuses
 * that minute. Placed in percent along the game's length, so no measuring is needed.
 */

import { useMemo } from "react";
import { cn } from "../../../lib/cn";
import { useTimelineView } from "./TimelineTab";

const MIN_DOT = 6;
const MAX_DOT = 26;

export function EventRail() {
  const { allEvents, length, minute, setMinute } = useTimelineView();

  const { blue, red, max } = useMemo(() => {
    const blue = new Map<number, number>();
    const red = new Map<number, number>();
    let max = 1;
    for (const event of allEvents) {
      if (event.team === undefined) continue;
      const m = Math.round(event.timestamp / 60_000);
      const bucket = event.team === 100 ? blue : red;
      const next = (bucket.get(m) ?? 0) + 1;
      bucket.set(m, next);
      if (next > max) max = next;
    }
    return { blue, red, max };
  }, [allEvents]);

  const rail = (buckets: Map<number, number>, side: "blue" | "red") => (
    <div className="relative h-8">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {[...buckets.entries()].map(([m, count]) => {
        const size = MIN_DOT + (count / max) * (MAX_DOT - MIN_DOT);
        return (
          <button
            key={m}
            type="button"
            aria-label={`${count} ${side} side event${count === 1 ? "" : "s"} at minute ${m}`}
            aria-pressed={minute === m}
            onClick={() => setMinute(minute === m ? undefined : m)}
            className={cn(
              "absolute top-1/2 cursor-pointer rounded-full border-2 border-bg2 transition-transform hover:scale-110",
              side === "blue" ? "bg-side-blue" : "bg-side-red",
              minute === m && "ring-2 ring-text-bright",
            )}
            style={{ left: `${(m / length) * 100}%`, width: size, height: size, translate: "-50% -50%" }}
          />
        );
      })}
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-bg2 px-6 py-3">
      {rail(blue, "blue")}
      {rail(red, "red")}
      <div className="mt-1 flex justify-between font-mono text-[10px] text-text-dim">
        <span>0:00</span>
        <span>{length}:00</span>
      </div>
    </div>
  );
}
