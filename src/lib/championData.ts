/**
 * Champion metadata from Riot's Data Dragon CDN.
 *
 * `GET /m/:matchId` returns the raw Riot payload, which identifies champions only by numeric
 * id and internal name (`62`, `MonkeyKing`) — not by display name and with no artwork. The
 * CCS API enriches champions elsewhere, but not there, so the lookup happens client-side
 * against the same CDN the API itself uses.
 *
 * Data Dragon is a static, heavily-cached CDN. The fetch is memoized for the page lifetime.
 */

const VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json";

/** Used when the version list can't be fetched; any recent patch resolves every champion. */
const FALLBACK_VERSION = "15.1.1";

export interface ChampionInfo {
  /** Internal id, e.g. "MonkeyKing". */
  id: string;
  /** Numeric champion id, e.g. 62. */
  key: number;
  /** Display name, e.g. "Wukong". */
  name: string;
  /** Square icon URL. */
  icon: string;
}

export interface ChampionLookup {
  version: string;
  /**
   * Resolve a champion from whatever the payload happens to carry — a numeric id, a numeric
   * id as a string, an internal name, or a display name.
   */
  get(ref: number | string | null | undefined): ChampionInfo | undefined;
}

interface DDragonChampion {
  id: string;
  key: string;
  name: string;
  image?: { full?: string };
}

function buildLookup(version: string, data: Record<string, DDragonChampion>): ChampionLookup {
  const byKey = new Map<number, ChampionInfo>();
  const byText = new Map<string, ChampionInfo>();

  for (const raw of Object.values(data)) {
    const key = Number.parseInt(raw.key, 10);
    const info: ChampionInfo = {
      id: raw.id,
      key,
      name: raw.name,
      icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${raw.image?.full ?? `${raw.id}.png`}`,
    };
    if (Number.isFinite(key)) byKey.set(key, info);
    byText.set(raw.id.toLowerCase(), info);
    byText.set(raw.name.toLowerCase(), info);
  }

  return {
    version,
    get(ref) {
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
    let version = FALLBACK_VERSION;
    try {
      const res = await fetch(VERSIONS_URL);
      if (res.ok) {
        const versions: unknown = await res.json();
        if (Array.isArray(versions) && typeof versions[0] === "string") version = versions[0];
      }
    } catch {
      // Keep the fallback version.
    }

    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
    if (!res.ok) throw new Error(`Data Dragon ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, DDragonChampion> };
    return buildLookup(version, body.data ?? {});
  })();

  // Don't cache a rejection — a transient failure shouldn't disable icons for the session.
  pending.catch(() => {
    pending = null;
  });

  return pending;
}
