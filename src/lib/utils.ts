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

export function fmtTime(d?: string): string {
  if (!d) return "";
  const dt = new Date(d);
  const t = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const diff = Math.floor((dt.getTime() - Date.now()) / 86400000);
  if (diff === 0) return `Today · ${t}`;
  if (diff === 1) return `Tomorrow · ${t}`;
  return dt.toLocaleDateString([], { month: "short", day: "numeric" }) + ` · ${t}`;
}
