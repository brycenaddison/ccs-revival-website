/** Which event types the list shows. A popover of checkboxes; changes apply as they are made. */

import { ListFilter } from "lucide-react";
import { EVENT_NAMES } from "../../../lib/game/events";
import type { RiotEventType } from "../../../lib/riot/matchV5";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { useTimelineView } from "./TimelineTab";

export function EventFilter() {
  const { excludedTypes, setExcludedTypes } = useTimelineView();
  const entries = Object.entries(EVENT_NAMES) as [RiotEventType, string][];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ListFilter className="size-3.5" /> Filter events
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="flex flex-col gap-2">
          {entries.map(([type, label]) => {
            const id = `event-filter-${type}`;
            const shown = !excludedTypes.includes(type);
            return (
              <label key={type} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary hover:text-text">
                <Checkbox
                  id={id}
                  checked={shown}
                  onCheckedChange={checked =>
                    setExcludedTypes(current => (checked ? current.filter(t => t !== type) : [...current, type]))
                  }
                />
                {label}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
