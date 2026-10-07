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
 *
 * **Search is the feed's `q`.** Upstream matches team names and codes, group, phase and league labels
 * before applying `limit`, so a fixture past the first page can still be found; this view never
 * re-filters the answer. The term waits for two characters and a debounce, and an earlier term's page
 * is never shown under a newer one. `truncated` discloses a capped page.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { errorMessage, feedMatchKey, FEED_LIMIT_MAX, FEED_SEARCH_MAX } from "../../lib/api";
import { groupByDay } from "../../lib/feedGroups";
import { queries } from "../../lib/queries";
import { useDebounced } from "../../hooks/useDebounced";
import { useFeedQuery, type FeedWindow } from "../../hooks/useScheduleFeed";
import { FeedMatchRow } from "../schedule/FeedMatchRow";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/** Shorter terms match nearly every row, so they leave the full schedule showing. */
const SEARCH_MIN = 2;

const WINDOW: FeedWindow = { statuses: ["live", "upcoming", "pending"], order: "asc", limit: FEED_LIMIT_MAX };

export function ScheduleView({ isMobile }: { isMobile: boolean }) {
  const [input, setInput] = useState("");
  const [composing, setComposing] = useState(false);
  const term = input.trim();
  const settled = useDebounced(term);
  const searching = term.length >= SEARCH_MIN;
  // While the debounce or an IME composition is pending, the page in hand answers an earlier term.
  const ready = !searching || (settled === term && !composing);

  const feedWindow = useMemo<FeedWindow>(() => (searching ? { ...WINDOW, q: settled } : WINDOW), [searching, settled]);
  const feedQuery = useFeedQuery(feedWindow);
  const { data, error, isPending } = useQuery({ ...queries.feed(feedQuery), enabled: ready });
  const days = useMemo(() => groupByDay(data?.matches ?? []), [data]);

  const clear = () => setInput("");

  let body: ReactNode;
  if (!ready || isPending) {
    body = (
      <div className="py-10 text-center text-[13px] text-text-subtle">
        {searching ? "Searching the schedule…" : "Loading the schedule…"}
      </div>
    );
  } else if (error) {
    body = <div className="py-10 text-center text-[13px] text-ccs-red">{errorMessage(error)}</div>;
  } else if (days.length === 0 && searching) {
    body = (
      <Empty className="p-6 md:p-6">
        <EmptyHeader>
          <EmptyTitle>No upcoming matches match “{term}”.</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={clear}>Clear search</Button>
        </EmptyContent>
      </Empty>
    );
  } else if (days.length === 0) {
    body = <div className="py-10 text-center text-[13px] text-text-dim">No upcoming matches scheduled.</div>;
  } else {
    body = days.map(day => (
      <section key={day.key} className="mb-6">
        <h3 className="mb-2 font-heading text-[11px] text-text-muted">
          {day.label}
        </h3>
        <div className="flex flex-col gap-2">
          {day.matches.map(m => (
            <FeedMatchRow key={feedMatchKey(m)} match={m} isMobile={isMobile} />
          ))}
        </div>
      </section>
    ));
  }

  return (
    <div className="mx-auto max-w-[800px]">
      <h2 className="mb-4 font-display text-[22px] text-text-bright">Schedule</h2>

      <InputGroup className="mb-2">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          enterKeyHint="search"
          value={input}
          onChange={e => setInput(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          // UTF-16 units, which never exceed the characters upstream counts.
          maxLength={FEED_SEARCH_MAX}
          placeholder="Search teams, groups, divisions or phases"
          aria-label="Search the schedule"
          autoComplete="off"
        />
        {input !== "" && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={clear}>
              <X aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      {ready && data?.truncated === true && (
        <p role="status" className="text-xs text-text-dim">
          {searching
            ? `Showing the first ${FEED_LIMIT_MAX} matches. Narrow the search to find the rest.`
            : `Showing the first ${FEED_LIMIT_MAX} matches. Search to find the rest.`}
        </p>
      )}

      <div className="mt-4">{body}</div>
    </div>
  );
}
