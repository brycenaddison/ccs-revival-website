/**
 * The Timeline tab: a stat over time, the kills on the map, and every event as a sentence.
 *
 * Four pieces of state, shared through one context because every panel reads more than one of them:
 * which graph and stat, which players are selected (an empty selection is everyone), which player is
 * hovered, which event types are hidden, and which minute is focused (a click on the chart or the
 * event rail). The event list, the map and the rail all filter on the same `events`, so what a reader
 * sees in one is what the others show.
 */

import { createContext, useContext, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { X } from "lucide-react";
import type { Participants } from "../../../lib/game/participants";
import { buildEventList, DEFAULT_EXCLUDED, type ListEvent } from "../../../lib/game/events";
import { gameLengthMinutes } from "../../../lib/game/timelineStats";
import type { RenderableTimeline, RiotEventType } from "../../../lib/riot/matchV5";
import { Button } from "../../ui/button";
import { useGameView } from "../GameView";
import { TimelineNote } from "../TimelineNote";
import { EventFilter } from "./EventFilter";
import { EventList } from "./EventList";
import { EventRail } from "./EventRail";
import { PlayerSelector } from "./PlayerSelector";
import { RiftMap } from "./RiftMap";
import { StatChart } from "./StatChart";
import { DEFAULT_VIEW, ViewSelector, type ViewOption } from "./ViewSelector";

export interface TimelineView {
  timeline: RenderableTimeline;
  participants: Participants;
  view: ViewOption;
  setView: (view: ViewOption) => void;
  selectedPlayers: number[];
  setSelectedPlayers: Dispatch<SetStateAction<number[]>>;
  hoveredPlayer: number | undefined;
  setHoveredPlayer: (id: number | undefined) => void;
  excludedTypes: RiotEventType[];
  setExcludedTypes: Dispatch<SetStateAction<RiotEventType[]>>;
  minute: number | undefined;
  setMinute: (minute: number | undefined) => void;
  /** Every event the type and player filters allow. */
  allEvents: ListEvent[];
  /** `allEvents` narrowed to the focused minute, when there is one. */
  events: ListEvent[];
  /** The game's length in minutes, for placing things on a time axis. */
  length: number;
}

const TimelineContext = createContext<TimelineView | null>(null);

export function useTimelineView(): TimelineView {
  const view = useContext(TimelineContext);
  if (view === null) throw new Error("useTimelineView() called outside TimelineTab");
  return view;
}

export default function TimelineTab() {
  const { timeline } = useGameView();
  if (timeline === undefined || timeline === null) return <TimelineNote state={timeline} />;
  return <Dashboard timeline={timeline} />;
}

function Dashboard({ timeline }: { timeline: RenderableTimeline }) {
  const { participants } = useGameView();
  const [view, setView] = useState<ViewOption>(DEFAULT_VIEW);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [hoveredPlayer, setHoveredPlayer] = useState<number | undefined>();
  const [excludedTypes, setExcludedTypes] = useState<RiotEventType[]>([...DEFAULT_EXCLUDED]);
  const [minute, setMinute] = useState<number | undefined>();

  const allEvents = useMemo(
    () => buildEventList(timeline, participants, excludedTypes, selectedPlayers),
    [timeline, participants, excludedTypes, selectedPlayers],
  );
  const events = useMemo(
    () => (minute === undefined ? allEvents : allEvents.filter(e => Math.round(e.timestamp / 60_000) === minute)),
    [allEvents, minute],
  );
  const length = useMemo(() => gameLengthMinutes(timeline), [timeline]);

  const value: TimelineView = {
    timeline,
    participants,
    view,
    setView,
    selectedPlayers,
    setSelectedPlayers,
    hoveredPlayer,
    setHoveredPlayer,
    excludedTypes,
    setExcludedTypes,
    minute,
    setMinute,
    allEvents,
    events,
    length,
  };

  return (
    <TimelineContext.Provider value={value}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ViewSelector />
          <PlayerSelector />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col rounded-lg border border-border bg-bg2 p-4 lg:h-[420px]">
            <StatChart />
          </div>
          <div className="flex items-start justify-center">
            <RiftMap />
          </div>
        </div>

        <EventRail />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {minute !== undefined ? (
            <Button variant="ghost" size="sm" onClick={() => setMinute(undefined)}>
              Minute {minute} <X className="size-3.5" />
            </Button>
          ) : (
            <span className="text-xs text-text-muted">Click the chart or a dot on the rail to focus one minute.</span>
          )}
          <EventFilter />
        </div>

        <EventList />
      </div>
    </TimelineContext.Provider>
  );
}
