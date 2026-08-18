import { useEffect, useState } from "react";
import { loadItems, loadSummonerSpells, type GameAssetLookup } from "../lib/gameAssets";

export interface GameAssets {
  items: GameAssetLookup | null;
  spells: GameAssetLookup | null;
}

/**
 * Item and summoner-spell lookups, each `null` while loading or if Community Dragon is unreachable.
 *
 * The same contract as `useChampions`: `null` means "render without artwork", not "error". Both
 * manifests resolve independently, so a failure on one still lets the other draw.
 *
 * The loaders behind it are memoized for the page lifetime, so this is only as expensive as the
 * first caller to mount — and the only caller is an expanded game row, which means a reader who
 * never opens one never fetches either manifest.
 */
export function useGameAssets(): GameAssets {
  const [items, setItems] = useState<GameAssetLookup | null>(null);
  const [spells, setSpells] = useState<GameAssetLookup | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadItems()
      .then(l => { if (!cancelled) setItems(l); })
      .catch(() => { /* artwork stays off */ });
    loadSummonerSpells()
      .then(l => { if (!cancelled) setSpells(l); })
      .catch(() => { /* artwork stays off */ });
    return () => { cancelled = true; };
  }, []);

  return { items, spells };
}
