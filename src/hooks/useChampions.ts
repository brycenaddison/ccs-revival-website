import { useEffect, useState } from "react";
import { loadChampions, type ChampionLookup } from "../lib/championData";

/**
 * Champion metadata lookup, or `null` while loading or if Data Dragon is unreachable.
 *
 * Callers should treat `null` as "render the label without artwork" rather than an error —
 * champion icons are decoration, and a CDN hiccup shouldn't blank a box score.
 */
export function useChampions(): ChampionLookup | null {
  const [lookup, setLookup] = useState<ChampionLookup | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadChampions()
      .then(l => { if (!cancelled) setLookup(l); })
      .catch(() => { /* icons stay off */ });
    return () => { cancelled = true; };
  }, []);

  return lookup;
}
