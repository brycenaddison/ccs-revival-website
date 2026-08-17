/**
 * Champion metadata from Community Dragon.
 *
 * `GET /m/:matchId` returns the raw Riot payload, which identifies champions only by numeric
 * id and internal name (`62`, `MonkeyKing`) — not by display name and with no artwork. The
 * CCS API enriches champions elsewhere, but not there, so the lookup happens client-side.
 *
 * **Community Dragon, not Data Dragon, and the same file the API reads.** `champion-summary.json`
 * is what `tournament-bot`'s `utils/championData.ts` fetches, and `icon` here is byte-identical to
 * the `img` the API serves on every enriched champion shape — so a lookup-resolved icon and a
 * served one are the same URL and the same cache entry, and the site can't show two different
 * pictures of one champion. The lone exception is Riot's `-1` "no ban" sentinel: Community Dragon
 * exposes its generic artwork by name rather than numeric id, so it is resolved explicitly below.
 * Data Dragon also requires a concrete patch in every path, which is how
 * the API ended up pinned to a two-year-old one; `latest` here needs no version fetch at all.
 *
 * Static, heavily-cached CDN. The fetch is memoized for the page lifetime.
 */

const SUMMARY_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json";

/** 128x128 square icon — mirrors `championIcon()` in the API repo. */
const iconUrl = (id: number): string => `https://cdn.communitydragon.org/latest/champion/${id}/square`;

/**
 * Ids at or above this are game-mode variants, not champions.
 *
 * Riot allocates them in the 60000s — `Jade_Ahri` is 60103 — and each one carries the *display
 * name of the champion it re-skins*. Indexing them by name is what made a name-keyed lookup
 * return a jade statue: whichever entry landed in the map last won, and the variants sort after
 * roughly half the roster. They are dropped rather than de-prioritised because nothing on this
 * site can ever want one — no CCS game is played in a mode that has them.
 */
const VARIANT_ID_FLOOR = 1000;

export interface ChampionInfo {
  /** Internal alias, e.g. "MonkeyKing". */
  id: string;
  /** Numeric champion id, e.g. 62. */
  key: number;
  /** Display name, e.g. "Wukong". */
  name: string;
  /** Square icon URL. */
  icon: string;
}

/** Riot records a declined ban as champion -1; Community Dragon names that artwork `generic`. */
export const NO_BAN_CHAMPION: Readonly<ChampionInfo> = {
  id: "None",
  key: -1,
  name: "No ban",
  icon: "https://cdn.communitydragon.org/latest/champion/generic/square",
};

export function isNoBanChampion(ref: number | string | null | undefined): boolean {
  return (
    ref === NO_BAN_CHAMPION.key ||
    (typeof ref === "string" && ref.trim() === String(NO_BAN_CHAMPION.key))
  );
}

export interface ChampionLookup {
  /**
   * Resolve a champion from whatever the payload happens to carry — a numeric id, a numeric
   * id as a string, an internal alias, or a display name.
   */
  get(ref: number | string | null | undefined): ChampionInfo | undefined;
}

interface SummaryEntry {
  id: number;
  name: string;
  alias: string;
}

function buildLookup(entries: readonly SummaryEntry[]): ChampionLookup {
  const byKey = new Map<number, ChampionInfo>();
  const byText = new Map<string, ChampionInfo>();

  for (const raw of entries) {
    // Non-champions are excluded from the maps. The useful -1 sentinel is resolved directly below.
    if (!Number.isFinite(raw.id) || raw.id <= 0 || raw.id >= VARIANT_ID_FLOOR) continue;

    const info: ChampionInfo = {
      id: raw.alias,
      key: raw.id,
      name: raw.name,
      icon: iconUrl(raw.id),
    };
    byKey.set(raw.id, info);
    if (raw.alias) byText.set(raw.alias.toLowerCase(), info);
    if (raw.name) byText.set(raw.name.toLowerCase(), info);
  }

  return {
    get(ref) {
      if (isNoBanChampion(ref)) return NO_BAN_CHAMPION;
      if (ref === null || ref === undefined || ref === "" || ref === 0) return undefined;
      if (typeof ref === "number") return byKey.get(ref);
      const numeric = Number.parseInt(ref, 10);
      if (String(numeric) === ref.trim() && byKey.has(numeric)) return byKey.get(numeric);
      return byText.get(ref.trim().toLowerCase());
    },
  };
}

let pending: Promise<ChampionLookup> | null = null;

export function loadChampions(): Promise<ChampionLookup> {
  if (pending) return pending;

  pending = (async () => {
    const res = await fetch(SUMMARY_URL);
    if (!res.ok) throw new Error(`Community Dragon ${res.status}`);
    const body: unknown = await res.json();
    return buildLookup(Array.isArray(body) ? (body as SummaryEntry[]) : []);
  })();

  // Don't cache a rejection — a transient failure shouldn't disable icons for the session.
  pending.catch(() => {
    pending = null;
  });

  return pending;
}
