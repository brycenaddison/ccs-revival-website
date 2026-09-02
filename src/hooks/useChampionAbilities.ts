import { useEffect, useState } from "react";
import { loadChampionAbilities, type AbilityInfo } from "../lib/championAbilities";

/**
 * One champion's abilities, or `null` while loading or if Community Dragon is unreachable.
 *
 * Re-runs when the id changes and discards a late answer for the previous one, so flipping between
 * players on the Builds tab never shows one champion's kit under another's name.
 */
export function useChampionAbilities(championId: number | null): AbilityInfo[] | null {
  const [abilities, setAbilities] = useState<AbilityInfo[] | null>(null);

  useEffect(() => {
    setAbilities(null);
    if (championId === null) return;
    let canceled = false;
    loadChampionAbilities(championId)
      .then(a => { if (!canceled) setAbilities(a); })
      .catch(() => { /* the grid draws its key letters without icons */ });
    return () => { canceled = true; };
  }, [championId]);

  return abilities;
}
