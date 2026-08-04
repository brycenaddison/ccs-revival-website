import { useEffect, useState } from "react";

/**
 * A value that lags behind by `delay`, settling once it stops changing.
 *
 * For the admin search box, whose every keystroke would otherwise be a request. The input stays
 * controlled by the raw value — a debounced *input* drops characters when a render lands
 * mid-keystroke — and only what's fed to the query is delayed.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return settled;
}
