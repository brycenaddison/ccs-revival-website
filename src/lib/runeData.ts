/**
 * Rune metadata from Community Dragon: the perks a player picked and the two trees they came from.
 *
 * The same problem `gameAssets.ts` solves, for the third thing a scoreboard row shows. A Riot payload
 * carries runes as bare ids (`perks.styles[0].selections[0].perk: 8010`, `styles[0].style: 8000`) and
 * nothing in the CCS API names them, because no statistics table has a rune column.
 *
 * Two manifests, because Riot keeps them apart: `v1/perks.json` is every individual rune, the stat
 * shards (5001 to 5013) included, and `v1/perkstyles.json` is the five trees. One lookup answers both,
 * so a component asks for an id and does not have to know which file it lives in. `longDesc` rides
 * along for the tooltips, in Riot's own markup, rendered by `components/game/RiotText.tsx`.
 *
 * Memoized for the page lifetime like its siblings; both files are fetched only when a rune is drawn.
 */

import { CDRAGON_BASE, assetUrl } from "./riot/cdragon";

const PERKS_URL = `${CDRAGON_BASE}/v1/perks.json`;
const STYLES_URL = `${CDRAGON_BASE}/v1/perkstyles.json`;

export interface RuneInfo {
  id: number;
  name: string;
  icon: string;
  /** Riot's description markup, or "" for a tree, which has none worth showing. */
  description: string;
  kind: "perk" | "style";
}

export interface RuneLookup {
  perk(id: number | null | undefined): RuneInfo | undefined;
  style(id: number | null | undefined): RuneInfo | undefined;
}

interface PerkEntry {
  id: number;
  name: string;
  iconPath: string;
  longDesc?: string;
  shortDesc?: string;
}

interface StyleEntry {
  id: number;
  name: string;
  iconPath: string;
  tooltip?: string;
}

function buildLookup(perks: readonly PerkEntry[], styles: readonly StyleEntry[]): RuneLookup {
  const byPerk = new Map<number, RuneInfo>();
  const byStyle = new Map<number, RuneInfo>();

  for (const raw of perks) {
    if (!raw || !Number.isFinite(raw.id) || raw.id <= 0) continue;
    const icon = assetUrl(raw.iconPath);
    if (!icon) continue;
    byPerk.set(raw.id, {
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : "",
      icon,
      description:
        typeof raw.longDesc === "string" && raw.longDesc !== ""
          ? raw.longDesc
          : typeof raw.shortDesc === "string"
            ? raw.shortDesc
            : "",
      kind: "perk",
    });
  }

  for (const raw of styles) {
    if (!raw || !Number.isFinite(raw.id) || raw.id <= 0) continue;
    const icon = assetUrl(raw.iconPath);
    if (!icon) continue;
    byStyle.set(raw.id, {
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : "",
      icon,
      description: "",
      kind: "style",
    });
  }

  return {
    perk: id => (id === null || id === undefined || id === 0 ? undefined : byPerk.get(id)),
    style: id => (id === null || id === undefined || id === 0 ? undefined : byStyle.get(id)),
  };
}

let pending: Promise<RuneLookup> | null = null;

export function loadRunes(): Promise<RuneLookup> {
  if (pending) return pending;

  pending = (async () => {
    const [perksRes, stylesRes] = await Promise.all([fetch(PERKS_URL), fetch(STYLES_URL)]);
    if (!perksRes.ok) throw new Error(`Community Dragon ${perksRes.status}`);
    if (!stylesRes.ok) throw new Error(`Community Dragon ${stylesRes.status}`);
    const perks: unknown = await perksRes.json();
    const stylesBody: unknown = await stylesRes.json();
    // `perkstyles.json` is `{ schemaVersion, styles: [...] }`; `perks.json` is a bare array.
    const styles = (stylesBody as { styles?: unknown })?.styles;
    return buildLookup(
      Array.isArray(perks) ? (perks as PerkEntry[]) : [],
      Array.isArray(styles) ? (styles as StyleEntry[]) : [],
    );
  })();

  // Don't cache a rejection: a transient failure shouldn't disable rune artwork for the session.
  pending.catch(() => {
    pending = null;
  });

  return pending;
}
