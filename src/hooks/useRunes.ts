import { useEffect, useState } from "react";
import { loadRunes, type RuneLookup } from "../lib/runeData";

/**
 * Rune lookup, or `null` while loading or if Community Dragon is unreachable.
 *
 * The same contract as `useChampions` and `useGameAssets`: `null` means "render without artwork",
 * not "error". A rune slot with no lookup draws a placeholder and the scoreboard stays readable.
 */
export function useRunes(): RuneLookup | null {
  const [lookup, setLookup] = useState<RuneLookup | null>(null);

  useEffect(() => {
    let canceled = false;
    loadRunes()
      .then(l => { if (!canceled) setLookup(l); })
      .catch(() => { /* artwork stays off */ });
    return () => { canceled = true; };
  }, []);

  return lookup;
}
