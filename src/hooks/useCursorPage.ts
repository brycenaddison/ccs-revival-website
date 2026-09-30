import { useCallback, useMemo, useState } from "react";

/**
 * Cursor pagination state. Keyset cursors only go forward, so going back, or showing every page
 * loaded so far, means retaining the cursors already visited.
 *
 * `cursor` is the current page for Previous/Next paging; `cursors` is every visited page, in order,
 * for "Show more" lists that render each page's own query one after another.
 */
export interface CursorPages {
  cursor: string | null;
  cursors: readonly (string | null)[];
  hasPrevious: boolean;
  next: (cursor: string) => void;
  previous: () => void;
  reset: () => void;
}

export function useCursorPage(): CursorPages {
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const next = useCallback((cursor: string) => setStack(current => [...current, cursor]), []);
  const previous = useCallback(() => setStack(current => current.length > 1 ? current.slice(0, -1) : current), []);
  const reset = useCallback(() => setStack([null]), []);
  return useMemo(() => ({
    cursor: stack[stack.length - 1], cursors: stack, hasPrevious: stack.length > 1, next, previous, reset,
  }), [stack, next, previous, reset]);
}
