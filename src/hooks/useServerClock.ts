import { useEffect, useState } from "react";

/**
 * A served `now` advanced by the device's elapsed time since it arrived, as an ISO instant, so labels
 * count from the API's clock rather than the device's. Ticks every `tickMs`; null holds the served
 * instant. Falls back to the device clock while the server's is unreadable.
 */
export function useServerClock(serverNow: string | null, tickMs: number | null = 30_000): string {
  const [clock, setClock] = useState(() => ({ source: serverNow, receivedAt: Date.now(), tick: Date.now() }));
  useEffect(() => {
    const receivedAt = Date.now();
    setClock({ source: serverNow, receivedAt, tick: receivedAt });
    if (tickMs === null) return;
    const timer = window.setInterval(() => setClock(current => ({ ...current, tick: Date.now() })), tickMs);
    return () => window.clearInterval(timer);
  }, [serverNow, tickMs]);
  const source = clock.source ? Date.parse(clock.source) : NaN;
  return new Date(Number.isFinite(source) ? source + clock.tick - clock.receivedAt : clock.tick).toISOString();
}
