/**
 * Where Community Dragon lives, and how a Riot `iconPath` becomes a URL there.
 *
 * Every artwork lookup on the site (`championData.ts`, `gameAssets.ts`, `runeData.ts`,
 * `championAbilities.ts`) resolves against the same host and the same `latest` root, so this is the
 * one place that spelling lives. `latest` rather than a patch because Data Dragon needs a concrete
 * version in every path and Riot removes old ones, which is how the API ended up pinned to a two-year-old
 * patch once; the trade is that a very old game shows current artwork for a reworked item.
 */

export const CDRAGON_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default";

/**
 * Community Dragon's routed CDN, the other host. It answers by *id* with no manifest lookup: champion
 * squares, centered splashes, ability icons, profile icons. It has no route for items, summoner spells,
 * runes, lane icons or ranked crests, which is why the raw tree above still exists beside it. Prefer
 * this host wherever it has a route.
 */
export const CDN_BASE = "https://cdn.communitydragon.org/latest";

/**
 * Riot's `iconPath` is an absolute path into the game client's asset tree
 * (`/lol-game-data/assets/ASSETS/Items/Icons2D/3153.png`) in mixed case. Community Dragon serves the
 * same tree lowercased under its `default` root, with that prefix stripped. `null` for a path that is
 * not in the tree, which the manifests do contain for a few placeholder rows.
 */
export function assetUrl(iconPath: string | null | undefined): string | null {
  if (typeof iconPath !== "string" || iconPath === "") return null;
  const lower = iconPath.toLowerCase();
  const marker = "/lol-game-data/assets";
  const index = lower.indexOf(marker);
  if (index === -1) return null;
  return `${CDRAGON_BASE}${lower.slice(index + marker.length)}`;
}

/**
 * A champion's centered base splash, the wide art the client's post-game scoreboard crops behind each
 * row. By numeric id on the routed CDN, so no alias lookup stands between a payload and the picture.
 */
export function championSplashUrl(championId: number): string {
  return `${CDN_BASE}/champion/${championId}/splash-art/centered`;
}

/**
 * The static-assets plugin, a different root from the game-data one above. It holds the lane icons
 * (`svg/position-top.svg` and so on), which are client UI rather than game data.
 */
export const CDRAGON_STATIC_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default";
