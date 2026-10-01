/**
 * The one date and time editor: a calendar and a time field in a popover, committing an ISO instant.
 *
 * The value is an ISO instant or null, exactly what the editors hold and the API sends, so a form's
 * dirty check compares like with like and an untouched field round-trips byte for byte. The calendar
 * and clock are the viewer's local time (`toLocalClock`/`fromLocalClock` in `lib/utils.ts` own the
 * conversion), and the zone is named in the trigger and the popover because staff edit the same
 * schedule from several zones. Precision is the minute.
 *
 * Edits are a draft until Apply, so a half-chosen value (a day with no time yet) never reaches the
 * form, and Escape or a click outside leaves the value as it was. A wall time that a daylight-saving
 * change skips cannot be applied; one it repeats asks which of the two instants is meant rather than
 * picking one silently. Clear commits null, which each caller describes through `placeholder`
 * ("Immediately", "Inherits the phase default").
 */

import { useId, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "../lib/cn";
import { fmtLocalDateTime, fromLocalClock, localTimeZone, toLocalClock } from "../lib/utils";

interface Props {
  /** For a `<label htmlFor>`; lands on the trigger button. */
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** What the trigger says while the value is null. */
  placeholder?: string;
  /** Where the calendar and clock start while the value is null, such as the time a field inherits. */
  suggested?: string | null;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
}

interface Draft {
  day: Date | undefined;
  /** `HH:mm`, as `<input type="time">` holds it; empty until chosen. */
  time: string;
  /** Which instant of a repeated wall time was chosen. */
  instant: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function draftFrom(value: string | null): Draft {
  const clock = toLocalClock(value);
  if (!clock) return { day: undefined, time: "", instant: null };
  return {
    day: new Date(clock.year, clock.month, clock.day),
    time: `${pad(clock.hour)}:${pad(clock.minute)}`,
    // In `fromLocalClock`'s spelling (whole minute, `.000Z`), so a repeated hour starts on its choice.
    instant: new Date(Math.floor(new Date(value!).getTime() / 60000) * 60000).toISOString(),
  };
}

/** The instants the draft's wall time names: none until a day and time are both chosen. */
function candidates(draft: Draft): string[] | null {
  const match = /^(\d{2}):(\d{2})/.exec(draft.time);
  if (!draft.day || !match) return null;
  return fromLocalClock({
    year: draft.day.getFullYear(),
    month: draft.day.getMonth(),
    day: draft.day.getDate(),
    hour: Number(match[1]),
    minute: Number(match[2]),
  });
}

/** `1:30 AM CDT`: the part of a repeated time that tells its two instants apart. */
function clockWithZone(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export function DateTimePicker({
  id,
  value,
  onChange,
  placeholder = "Not set",
  suggested = null,
  disabled,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(value ?? suggested));
  const timeId = useId();
  const zone = localTimeZone();

  const options = candidates(draft);
  const chosen = options === null ? null
    : options.length === 1 ? options[0]
    : options.find(o => o === draft.instant) ?? null;
  const problem = options === null ? null
    : options.length === 0
      ? "This time is skipped by a daylight saving change on this date. Choose another time."
      : null;

  const openChange = (next: boolean) => {
    // Every opening starts from the committed value, so a draft abandoned with Escape is gone.
    if (next) setDraft(draftFrom(value ?? suggested));
    setOpen(next);
  };

  const commit = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-9 w-full min-w-0 justify-between bg-bg2 px-3 font-body font-normal text-text aria-invalid:border-destructive",
            value === null && "text-text-muted",
            className,
          )}
        >
          <span className="truncate">{value === null ? placeholder : fmtLocalDateTime(value)}</span>
          <CalendarIcon size={15} aria-hidden="true" className="text-text-secondary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-24px)] p-0">
        <Calendar
          mode="single"
          selected={draft.day}
          defaultMonth={draft.day}
          onSelect={day => setDraft(d => ({ ...d, day, instant: null }))}
        />
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <Field>
            <FieldLabel htmlFor={timeId}>Time</FieldLabel>
            <Input
              id={timeId}
              type="time"
              value={draft.time}
              onChange={e => setDraft(d => ({ ...d, time: e.target.value, instant: null }))}
              aria-invalid={problem !== null || undefined}
              className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden"
            />
            {zone && <FieldDescription>Your time zone: {zone}</FieldDescription>}
            <FieldError>{problem}</FieldError>
          </Field>

          {options && options.length > 1 && (
            <Field>
              <FieldDescription>
                This time happens twice on this date because of a daylight saving change. Choose one.
              </FieldDescription>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                value={draft.instant ?? ""}
                onValueChange={instant => setDraft(d => ({ ...d, instant: instant || null }))}
                aria-label="Which occurrence"
              >
                {options.map(option => (
                  <ToggleGroupItem key={option} value={option}>{clockWithZone(option)}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}

          <div className="flex items-center justify-end gap-2">
            {value !== null && (
              <Button type="button" variant="ghost" size="sm" onClick={() => commit(null)}>
                Clear
              </Button>
            )}
            <Button type="button" size="sm" disabled={chosen === null} onClick={() => chosen && commit(chosen)}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
