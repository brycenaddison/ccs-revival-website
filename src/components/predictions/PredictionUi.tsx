/**
 * Prediction clock helpers. The server decides eligibility and deadlines; these only label them.
 */

import { useEffect, useState } from "react";

/** Advance the API clock for labels only, so a countdown starts from `serverNow`, not the device. */
export function usePredictionClock(serverNow: string | null): string {
  const [clock, setClock] = useState(() => ({ source: serverNow, receivedAt: Date.now(), tick: Date.now() }));
  useEffect(() => {
    const receivedAt = Date.now();
    setClock({ source: serverNow, receivedAt, tick: receivedAt });
    const timer = window.setInterval(() => setClock(current => ({ ...current, tick: Date.now() })), 30_000);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  const source = clock.source ? Date.parse(clock.source) : NaN;
  return new Date(Number.isFinite(source) ? source + clock.tick - clock.receivedAt : clock.tick).toISOString();
}

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

/** Open events close at the fixture's kickoff upstream, so "closes" and "kickoff" are one instant. */
export function closesText(closesAt: string | null, now: string): string {
  const relative = relativeInstant(closesAt, now);
  return relative ? `Closes ${relative}` : "Closes at kickoff";
}
