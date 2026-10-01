/**
 * Which publication week League Admin is looking at: chevrons around the week's label, and "This
 * week" once you have moved away from it.
 *
 * Weeks are Mondays in the site calendar's timezone; the labels come from `lib/predictionWeek.ts`
 * and the API owns each week's exact instants. The API accepts Mondays within 370 days of server
 * time, so the chevrons stop 52 weeks either side of this week.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { predictionWeekLabel, shiftPredictionWeek } from "../../../lib/predictionWeek";

const WEEK_BOUND = 52;

export function WeekNavigator({ weekStart, thisWeek, siteTimeZone, disabled, onChange }: {
  weekStart: string;
  thisWeek: string;
  siteTimeZone: string;
  disabled?: boolean;
  onChange: (weekStart: string) => void;
}) {
  const first = shiftPredictionWeek(thisWeek, -WEEK_BOUND);
  const last = shiftPredictionWeek(thisWeek, WEEK_BOUND);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Previous week" disabled={disabled || weekStart <= first}
          onClick={() => onChange(shiftPredictionWeek(weekStart, -1))}>
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <span className="min-w-44 text-center font-heading text-sm text-text-bright" aria-live="polite">{predictionWeekLabel(weekStart)}</span>
        <Button variant="ghost" size="icon" aria-label="Next week" disabled={disabled || weekStart >= last}
          onClick={() => onChange(shiftPredictionWeek(weekStart, 1))}>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
        {weekStart !== thisWeek && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(thisWeek)}>This week</Button>
        )}
      </div>
      <p className="text-xs text-text-dim">Weeks run Monday to Sunday, {siteTimeZone}</p>
    </div>
  );
}
