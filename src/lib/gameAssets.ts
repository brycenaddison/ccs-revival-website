/**
 * Item and summoner-spell metadata from Community Dragon.
 *
 * The same problem `championData.ts` solves, for the other two things a game row can show. Nothing
 * in the CCS API carries them: the `performance` table has no spell or item columns, so no
 * aggregate, leaderboard or scouting read has ever needed a name for item 3153. The only place
 * they exist is the raw Riot payload behind `GET /m/:matchId`, which identifies both by bare
 * numeric id — `summoner1Id: 4`, `item0: 3153` — with no name and no artwork.
 *
 * **Community Dragon, `latest`, same host and same convention as the champion lookup**, so the two
 * modules can't disagree about where artwork comes from or drift onto different patches. Unlike
 * champions, though, these two manifests do *not* expose a convenience `/latest/item/:id/icon`
 * route we can build a URL from: each entry carries an `iconPath` into the game-data asset tree,
 * which has to be rewritten to a servable URL. `assetUrl` in `lib/riot/cdragon.ts` is that rewrite,
 * and it is the reason this is a manifest fetch rather than a string template.
 *
 * Two static, heavily-cached CDN files, each memoized for the page lifetime and fetched only when
 * something actually asks. The match viewer (`components/game/`) is the consumer: its scoreboard rows
 * and build paths draw every item and spell through `RiotIcons.tsx`, over the lookups here.
 *
 * `description` rides along for the tooltips. It is Riot's own markup (`<mainText>`, `<attention>`,
 * `<br>`), rendered by `components/game/RiotText.tsx` and never injected as HTML.
 */

import { CDRAGON_BASE, assetUrl } from "./riot/cdragon";

const ITEMS_URL = `${CDRAGON_BASE}/v1/items.json`;
const SPELLS_URL = `${CDRAGON_BASE}/v1/summoner-spells.json`;

export interface GameAsset {
  id: number;
  name: string;
  icon: string;
  /** Riot's description markup, or "" when the manifest has none. See the header. */
  description: string;
  /** Items only: the full price. Undefined for a spell. */
  price?: number;
}

export interface GameAssetLookup {
  get(id: number | null | undefined): GameAsset | undefined;
}

/**
 * Riot writes an empty inventory slot as item `0`, and an unset summoner spell the same way.
 *
 * It is not a missing value — the game is telling us the slot is genuinely empty — so a caller
 * renders a blank slot rather than the "couldn't resolve this" fallback.
 */
export const EMPTY_SLOT = 0;

interface ManifestEntry {
  id: number;
  name: string;
  iconPath: string;
  description?: string;
  priceTotal?: number;
}

function buildLookup(entries: readonly ManifestEntry[]): GameAssetLookup {
  const byId = new Map<number, GameAsset>();

  for (const raw of entries) {
    if (!raw || !Number.isFinite(raw.id) || raw.id <= 0) continue;
    const icon = assetUrl(raw.iconPath);
    if (!icon) continue;
    byId.set(raw.id, {
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : "",
      icon,
      description: typeof raw.description === "string" ? raw.description : "",
      ...(typeof raw.priceTotal === "number" ? { price: raw.priceTotal } : {}),
    });
  }

  return {
    get(id) {
      if (id === null || id === undefined || id === EMPTY_SLOT) return undefined;
      return byId.get(id);
    },
  };
}

function memoizedLoader(url: string): () => Promise<GameAssetLookup> {
  let pending: Promise<GameAssetLookup> | null = null;

  return () => {
    if (pending) return pending;

    pending = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Community Dragon ${res.status}`);
      const body: unknown = await res.json();
      return buildLookup(Array.isArray(body) ? (body as ManifestEntry[]) : []);
    })();

    // Don't cache a rejection — a transient failure shouldn't disable artwork for the session.
    pending.catch(() => {
      pending = null;
    });

    return pending;
  };
}

export const loadItems = memoizedLoader(ITEMS_URL);
export const loadSummonerSpells = memoizedLoader(SPELLS_URL);
