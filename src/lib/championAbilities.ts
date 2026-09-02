/**
 * One champion's four abilities, from Community Dragon, for the Builds tab's skill-order grid.
 *
 * Unlike the other lookups this is **per champion**: `v1/champions/{id}.json` is one file per
 * champion, a few kilobytes each, and the skill order is only ever drawn for the one player selected.
 * So this memoizes a promise per id rather than one manifest, and a page that never opens Builds
 * fetches nothing.
 *
 * `latest` like everything else on the site. A reworked champion shows its current kit against a game
 * played on the old one; that is the same trade the champion icon already makes and it is rare enough
 * on a league site to accept.
 */

import { CDN_BASE, CDRAGON_BASE } from "./riot/cdragon";

export type AbilityKey = "Q" | "W" | "E" | "R";

export const ABILITY_KEYS: readonly AbilityKey[] = ["Q", "W", "E", "R"];

export interface AbilityInfo {
  key: AbilityKey;
  /** 1 to 4, matching the timeline's `skillSlot`. */
  slot: number;
  name: string;
  icon: string | null;
  /** Riot's description markup; see `components/game/RiotText.tsx`. */
  description: string;
}

interface ChampionFile {
  spells?: { spellKey?: string; name?: string; abilityIconPath?: string; description?: string }[];
}

const pendingById = new Map<number, Promise<AbilityInfo[]>>();

export function loadChampionAbilities(championId: number): Promise<AbilityInfo[]> {
  const existing = pendingById.get(championId);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(`${CDRAGON_BASE}/v1/champions/${championId}.json`);
    if (!res.ok) throw new Error(`Community Dragon ${res.status}`);
    const body = (await res.json()) as ChampionFile;
    const spells = Array.isArray(body?.spells) ? body.spells : [];

    return ABILITY_KEYS.map((key, i) => {
      // Matched on `spellKey` rather than position: the file lists Q, W, E, R in order today, but
      // the key is the contract and the order is a coincidence.
      const spell = spells.find(s => s?.spellKey?.toUpperCase() === key) ?? spells[i];
      return {
        key,
        slot: i + 1,
        name: typeof spell?.name === "string" ? spell.name : key,
        icon: `${CDN_BASE}/champion/${championId}/ability-icon/${key.toLowerCase()}`,
        description: typeof spell?.description === "string" ? spell.description : "",
      };
    });
  })();

  pendingById.set(championId, promise);
  // Don't cache a rejection: the next selection of this champion tries again.
  promise.catch(() => {
    pendingById.delete(championId);
  });

  return promise;
}
