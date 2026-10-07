/**
 * Prediction clock helpers. The server decides eligibility and deadlines; these only label them.
 */

import type { PredictionEvent } from "../../lib/api";

/** "in 2 hours", "5 minutes ago". Null when either instant is unreadable. */
export function relativeInstant(instant: string | null, serverNow: string | null): string | null {
  if (!instant) return null;
  const target = Date.parse(instant), now = serverNow ? Date.parse(serverNow) : Date.now();
  if (!Number.isFinite(target) || !Number.isFinite(now)) return null;
  const minutes = Math.round(Math.abs(target - now) / 60_000);
  const value = minutes < 60 ? Math.max(1, minutes) : minutes < 2880 ? Math.round(minutes / 60) : Math.round(minutes / 1440);
  const unit = minutes < 60 ? "minute" : minutes < 2880 ? "hour" : "day";
  return `${target > now ? "in " : ""}${value} ${unit}${value === 1 ? "" : "s"}${target > now ? "" : " ago"}`;
}

/** An instant in a named zone (the site calendar's, for staff), with the zone abbreviation. */
export function absoluteInstant(instant: string | null, zone?: string | null): string | null {
  if (!instant || !Number.isFinite(Date.parse(instant))) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZone: zone ?? undefined, timeZoneName: "short",
    }).format(new Date(instant));
  } catch {
    return instant;
  }
}

/** What closes a market, for copy such as "Estimates change … until kickoff". */
export function closingPoint(kind: PredictionEvent["kind"]): string {
  return kind === "custom" ? "the deadline" : "kickoff";
}

/**
 * Match markets close at the fixture's kickoff upstream, so "closes" and "kickoff" are one instant;
 * custom markets close at the deadline staff set.
 */
export function closesText(event: Pick<PredictionEvent, "kind" | "closesAt">, now: string): string {
  const relative = relativeInstant(event.closesAt, now);
  return relative ? `Closes ${relative}` : event.kind === "custom" ? "Closes at the deadline" : "Closes at kickoff";
}
