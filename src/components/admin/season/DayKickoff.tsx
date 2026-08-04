/**
 * A match day's default kickoff — the middle tier of the three.
 *
 * A match falls back to its day, and a day falls back to the phase anchor plus a week per day since it:
 *
 *     day 1 = the phase's own start, set on the season page
 *     day d = this field, or the phase start plus seven days × (d − 1)
 *
 * **A pinned day pins itself and nothing else.** It is not the base the days after it count from — every
 * day answers from the anchor independently — so a break in the season is one entry per remaining day
 * rather than one entry at the resumption. That is more rows than the old cascade needed, and it is the
 * trade for a rule with no ordering to it: nothing here has to be read forward, a day can be pinned
 * before the phase has a start date at all, and clearing day 5 cannot silently move day 8.
 *
 * The single gesture that used to be a cascade is **Shift the later days** below: it pins each remaining
 * day to its own current time plus the same offset, which is the edit "the season breaks for a week after
 * day 4" actually describes. Turning one gesture into those entries is deliberately the website's job —
 * see `shiftDayDefaults`.
 *
 * Shared between the group and bracket editors because a match day belongs to the phase rather than to
 * either kind's contents. Each lays out its own header around this; a bracket column is narrow and a
 * group day is a full-width panel, so only the control is common.
 */

import { CalendarClock } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ACTION_SM } from "../adminUi";
import { fmtKickoff, fromLocalInput, toLocalInput } from "../../../lib/utils";
import type { DayDefault, PhaseSummary } from "../../../lib/api";

/**
 * One day's entry, set or cleared, in a list kept in day order.
 *
 * Clearing **removes** the entry rather than storing a null: the save is whole-document, so absence is
 * how "this day inherits" is said, and a null would be refused. Sorted because upstream emits it sorted,
 * which keeps a saved draft byte-identical to the one read back and so keeps the dirty check honest.
 */
export function withDayDefault(
  current: readonly DayDefault[],
  matchDay: number,
  startAt: string | null,
): DayDefault[] {
  const rest = current.filter(d => d.matchDay !== matchDay);
  const next = startAt === null ? rest : [...rest, { matchDay, startAt }];
  return next.sort((a, b) => a.matchDay - b.matchDay);
}

interface Props {
  /** Phase-relative, 1-based. */
  matchDay: number;
  /** The phase's length, to say whether there are later days to offer a shift over. */
  matchDays: number;
  /** The stored entry, or null when this day inherits. */
  pinned: string | null;
  /** What the day resolves to, pin included — computed from the draft so it tracks an unsaved edit. */
  resolved: Date | null;
  /** What it would resolve to with no pin: the anchor plus a week per day. Null when there is no anchor. */
  inherited: Date | null;
  /** Null clears the entry, which is how a day goes back to inheriting. */
  onChange: (startAt: string | null) => void;
  /** Pins every later day to its own time plus this offset. Absent when there are no later days. */
  onShiftLater?: (offsetMs: number) => void;
}

export function DayKickoffField({
  matchDay,
  matchDays,
  pinned,
  resolved,
  inherited,
  onChange,
  onShiftLater,
}: Props) {
  const at = resolved === null ? null : fmtKickoff(resolved.toISOString());

  // Day 1 has no field: it *is* `defaultStartAt`, so a box here would be a second home for one value —
  // and upstream refuses a day-1 entry outright, reading the anchor even if a row reaches the table some
  // other way. The time is still shown, because a day header saying nothing about when it starts is the
  // confusing option.
  if (matchDay === 1) {
    return (
      <p className="text-text-dim text-xs">
        {at === null ? (
          <>No kickoff set. Day 1 follows the phase start, on the season page.</>
        ) : (
          <>Starts {at} — day 1 follows the phase start, which is set on the season page.</>
        )}
      </p>
    );
  }

  const laterDays = matchDays - matchDay;
  const inputId = `day-${matchDay}-kickoff`;

  /**
   * How far this pin moved the day off what it would have inherited.
   *
   * The offset to apply to the rest of the phase, and the whole input to the shift below. Null when
   * there is nothing to measure against — an unpinned day, or a phase with no anchor, where "the same
   * amount later" has no meaning yet.
   */
  const offsetMs =
    pinned !== null && resolved !== null && inherited !== null
      ? resolved.getTime() - inherited.getTime()
      : null;

  return (
    <div>
      <label className={LABEL_CLASS} htmlFor={inputId}>
        Day kickoff
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* Width on the wrapper rather than the input: `CONTROL_CLASS` carries `w-full`, and two
            width utilities on one element are resolved by stylesheet order, not class order. */}
        <div className="w-52 shrink-0">
          <input
            id={inputId}
            type="datetime-local"
            value={toLocalInput(pinned)}
            onChange={e => onChange(fromLocalInput(e.target.value))}
            className={CONTROL_CLASS}
          />
        </div>

        {pinned === null ? (
          <span className="text-text-dim text-xs">
            {at === null
              ? "No kickoff yet — set one here, or set the phase start on the season page."
              : `Inherits ${at} — ${matchDay - 1} ${matchDay - 1 === 1 ? "week" : "weeks"} after the phase start.`}
          </span>
        ) : (
          <>
            {/* Said plainly, because the old rule was the opposite and a wrong assumption here silently
                leaves the rest of a season on its original dates. */}
            <span className="text-text-dim text-xs">
              Pinned to this day only. Later days still follow the phase start.
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className={ACTION_SM}
              aria-label={`Clear day ${matchDay}'s kickoff and inherit again`}
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* The break edit. Only offered when it would do something: there are later days, this day is
          pinned, and the pin actually moved it — shifting by zero is a no-op that would still write an
          entry for every remaining day. */}
      {laterDays > 0 && offsetMs !== null && offsetMs !== 0 && onShiftLater !== undefined && (
        <button
          type="button"
          onClick={() => onShiftLater(offsetMs)}
          className={`${ACTION_SM} mt-1.5`}
        >
          <CalendarClock size={13} aria-hidden="true" />
          Shift the {laterDays === 1 ? "day" : `${laterDays} days`} after this one by{" "}
          {describeOffset(offsetMs)}
        </button>
      )}
    </div>
  );
}

/**
 * An offset in words — `"1 week later"`, `"2 days earlier"`.
 *
 * Rounded to the nearest unit that divides it, so the button says what was meant rather than
 * `"604800000ms"`. An offset that is not a whole number of days is described in hours, which is the
 * granularity a `datetime-local` field can produce.
 */
function describeOffset(ms: number): string {
  const direction = ms > 0 ? "later" : "earlier";
  const abs = Math.abs(ms);
  const hours = abs / 3_600_000;
  const days = hours / 24;

  if (Number.isInteger(days) && days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ${direction}`;
  }
  if (Number.isInteger(days)) return `${days} ${days === 1 ? "day" : "days"} ${direction}`;

  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? "hour" : "hours"} ${direction}`;
}

/**
 * The pinned days that sit past the end of the phase, and a button to drop them.
 *
 * **The one place the round trip does not hold.** Shortening a phase on the season page refuses to cross
 * a scheduled *match* but not a pinned day, and leaves the row where it is — so this document arrives
 * holding an entry the save will reject with `matchDay N is past the end of this phase`, and saving
 * anything at all fails until it goes. Upstream is explicit that guarding it is the editor's job.
 *
 * Not repaired silently on load. The stranded row resolves nothing and harms nothing while it sits there,
 * so deleting a time an admin chose without saying so would be the worse of the two failures.
 */
export function StrandedDaysNotice({
  phase,
  stranded,
  onClear,
}: {
  phase: PhaseSummary;
  stranded: readonly DayDefault[];
  onClear: () => void;
}) {
  if (stranded.length === 0) return null;

  const days = stranded.map(d => d.matchDay).join(", ");

  return (
    <div className="border border-ccs-red/50 rounded-md p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-ccs-red text-sm">
        {stranded.length === 1 ? `Day ${days} has` : `Days ${days} have`} a kickoff time but{" "}
        {stranded.length === 1 ? "sits" : "sit"} past the end of this {phase.matchDays}-day phase.
        Nothing can be saved until {stranded.length === 1 ? "it goes" : "they go"} — or lengthen the phase
        on the season page to bring {stranded.length === 1 ? "it" : "them"} back.
      </p>
      <button type="button" onClick={onClear} className={ACTION_SM}>
        Drop {stranded.length === 1 ? "it" : "them"}
      </button>
    </div>
  );
}
