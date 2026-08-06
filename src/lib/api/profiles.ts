/**
 * Public profile reads — today just the Riot accounts one profile has linked.
 *
 * Two things make this unlike every other public read in here, and both shape the mapping below.
 *
 * **It reads Riot at request time.** Everything else this client talks to is served from the API's
 * own database, so a payload either arrives whole or the request failed. Here each account is
 * assembled from three Riot calls that fail independently: `riotId`, `summonerLevel` and
 * `profileIconUrl` are each separately nullable, and a null `riotId` is *routine* rather than an
 * error — a banned or deleted account stops resolving. One account failing does not sink its
 * siblings.
 *
 * **`ranked: []` and `ranked: null` are different answers, and this module exists to keep them
 * apart.** Empty means we asked and the account is unranked. Null means Riot would not tell us —
 * a rate limit, an outage, an expired key. Collapsing them puts "Unranked" on a Challenger
 * player's page with nothing downstream able to tell that it happened, so the union survives all
 * the way to the component and callers have to branch on it.
 *
 * Entries are rendered in the order served: upstream sorts solo ahead of flex so that `ranked[0]`
 * is the headline rank, and re-sorting here would throw that away.
 */

import { getOne, type RequestOpts } from "./http";

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** The two queues upstream serves. Riot's TFT and arena standings are dropped before we see them. */
export const RANKED_QUEUES = ["solo", "flex"] as const;
export type RankedQueue = (typeof RANKED_QUEUES)[number];

const isQueue = (v: unknown): v is RankedQueue =>
  typeof v === "string" && (RANKED_QUEUES as readonly string[]).includes(v);

export interface AccountRank {
  queue: RankedQueue;
  /** The metal — `GOLD`, in Riot's own casing. */
  tier: string;
  /** The step within the tier — `II`. Riot calls this `rank`; shown with `tier`, never alone. */
  division: string;
  leaguePoints: number;
  /** Per queue, and never summed with another queue's — a combined total hides which tier is which. */
  wins: number;
  losses: number;
  hotStreak: boolean;
}

export interface LinkedAccount {
  puuid: string;
  /** `gameName#tagLine`, or null when Riot will not resolve the account. */
  riotId: string | null;
  summonerLevel: number | null;
  profileIconUrl: string | null;
  /** `[]` is unranked. `null` is "Riot would not tell us" — see the header. */
  ranked: AccountRank[] | null;
}

function mapRank(value: unknown): AccountRank[] {
  const r = asRaw(value);
  // An entry we can't name a queue for is dropped rather than repaired: a rank shown under the
  // wrong queue is worse than one missing, and upstream already filtered the queues it serves.
  if (!isQueue(r.queue)) return [];
  const tier = strOrNull(r.tier);
  if (!tier) return [];

  return [
    {
      queue: r.queue,
      tier,
      division: strOrNull(r.division) ?? "",
      leaguePoints: int(r.leaguePoints),
      wins: int(r.wins),
      losses: int(r.losses),
      hotStreak: r.hotStreak === true,
    },
  ];
}

function mapAccount(value: unknown): LinkedAccount[] {
  const r = asRaw(value);
  const puuid = strOrNull(r.puuid);
  if (!puuid) return [];

  return [
    {
      puuid,
      riotId: strOrNull(r.riotId),
      summonerLevel: intOrNull(r.summonerLevel),
      profileIconUrl: strOrNull(r.profileIconUrl),
      // The one field where absent and empty must not converge. Anything that isn't an array —
      // an explicit null, or a deployment that doesn't serve the key — is "we couldn't ask".
      ranked: Array.isArray(r.ranked) ? r.ranked.flatMap(mapRank) : null,
    },
  ];
}

/**
 * Every Riot account linked to one profile.
 *
 * `null` and `[]` are different answers here too, one level up: `[]` is a profile that has linked
 * nothing, while `null` is the endpoint declining to say — a 404 for a profile that doesn't exist,
 * or a deployment that hasn't mounted the route. `getOne` resolves both to null, and a caller that
 * treated that as "no accounts" would tell a player their accounts had vanished.
 */
export async function profileAccounts(
  profileId: number,
  opts?: RequestOpts,
): Promise<LinkedAccount[] | null> {
  const data = await getOne<Raw>(`/profiles/${profileId}/accounts`, opts);
  if (!data) return null;
  return Array.isArray(data.accounts) ? data.accounts.flatMap(mapAccount) : [];
}

/** Namespaced for parity with the other modules' aggregates. */
export const profilesApi = { profileAccounts };
