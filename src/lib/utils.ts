export function teamInitial(name?: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

export function timeAgo(d?: string): string {
  if (!d) return "";
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * An ISO instant as `<input type="datetime-local">` wants it: `YYYY-MM-DDTHH:mm`, **in local time**.
 *
 * The API stores naive UTC (`timestamp without time zone`) and the site renders in the viewer's local
 * time, which is the only sensible answer when a roster spans several zones. So this is a real
 * conversion, not a substring: `toISOString().slice(0, 16)` would show a UTC clock in a local-time
 * input and quietly shift every time the user saved without touching the field.
 *
 * Empty string for absent or unparseable, which is also what the input shows for "not set".
 */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The inverse: a local `datetime-local` value back to an ISO instant, or null when cleared. */
export function fromLocalInput(value: string): string | null {
  if (value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A kickoff as the editors show it: local date and time, with the weekday, because match day ≠ date. */
export function fmtKickoff(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Just the day of a kickoff: `Sat 12 Sep`.
 *
 * `fmtKickoff` with the clock taken off, for a heading that covers several matches whose individual
 * times are already on their own cards. Empty string rather than an em dash for absent, because this
 * is a subheading that should disappear when there is nothing to say — a phase can legitimately have
 * no kickoff pinned yet.
 */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Month and year: `Mar 2025`.
 *
 * For spans rather than events. A team stint runs for months, so the day it started is noise — and
 * with `fmtDay`'s weekday in there, two of them made a range that was longer than the row it sat in.
 */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleDateString([], { month: "short", year: "numeric" });
}

/**
 * Just the clock: `7:00 PM`.
 *
 * For a row that already sits under a date heading, where `fmtRelativeDay`'s "Today" repeats what the
 * heading said. Em dash for absent, because a row still needs something in that column.
 */
export function fmtClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Whole calendar days from `a` to `b`, in local time. */
function calendarDaysBetween(a: Date, b: Date): number {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Rounded, not truncated: a day is 23 or 25 hours across a DST boundary, so the quotient isn't an
  // integer and flooring it would report the wrong day twice a year.
  return Math.round((midnight(b) - midnight(a)) / 86400000);
}

/**
 * Which day something is on, named the way a reader would: `Today`, `Tomorrow`, `Yesterday`, or
 * `Sep 12`.
 *
 * **Counted in calendar days, not in 24-hour blocks.** The difference is not academic on a schedule
 * whose fixtures start in the evening: at 11pm, a match at 1am is two hours away, which as a 24-hour
 * quotient rounds to zero and reads "Today" — on a card that is describing tomorrow.
 *
 * Empty string for absent, so a caller can fall back with `||`.
 */
export function fmtRelativeDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const days = calendarDaysBetween(new Date(), d);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";

  // No year, deliberately: everything that reaches this is within days of now, and a year would be
  // four characters of noise on the narrowest cards on the site.
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** A kickoff as a day and a clock: `Tomorrow · 7:00 PM`. Empty string for absent. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  return `${fmtRelativeDay(iso)} · ${fmtClock(iso)}`;
}
