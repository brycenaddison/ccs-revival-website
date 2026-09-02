/** Which graph (advantage, team totals, per champion) and which stat the chart draws. */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { useTimelineView } from "./TimelineTab";

export const GRAPH_OPTIONS = ["Team advantage", "Team total", "Champion total"] as const;
export const STAT_OPTIONS = ["Gold", "Experience", "CS", "Damage", "Kills"] as const;

export interface ViewOption {
  graph: (typeof GRAPH_OPTIONS)[number];
  stat: (typeof STAT_OPTIONS)[number];
}

export const DEFAULT_VIEW: ViewOption = { graph: GRAPH_OPTIONS[0], stat: STAT_OPTIONS[0] };

export function ViewSelector() {
  const { view, setView } = useTimelineView();
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={view.graph} onValueChange={graph => setView({ ...view, graph: graph as ViewOption["graph"] })}>
        <SelectTrigger className="w-44" aria-label="Graph">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GRAPH_OPTIONS.map(option => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={view.stat} onValueChange={stat => setView({ ...view, stat: stat as ViewOption["stat"] })}>
        <SelectTrigger className="w-40" aria-label="Stat">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAT_OPTIONS.map(option => (
            <SelectItem key={option} value={option}>
              {/* Per champion, "kills" alone undercounts a support's share of a fight. */}
              {option === "Kills" && view.graph === "Champion total" ? "Kills + assists" : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
