/**
 * Ranked tier presentation shared by profile account cards and team cards: the label a person
 * writes, and each tier's color.
 */

import { TIER_ORDER, type RankTier } from "../api";

/**
 * Riot reports a division for every tier, including the three that don't have one.
 *
 * Master, Grandmaster and Challenger are single-division tiers separated purely by LP, and Riot
 * still sends `rank: "I"` for all of them — so rendering tier-and-division verbatim produces
 * "CHALLENGER I", which is not a thing. Below Master the division is load-bearing and stays.
 */
const APEX_TIERS = new Set<string>(["MASTER", "GRANDMASTER", "CHALLENGER"]);

/** Riot serves tiers shouted (`EMERALD`); a person writes Emerald. */
const tierName = (tier: string): string => tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();

export function tierLabel(tier: string, division: string | null): string {
  if (!division || APEX_TIERS.has(tier.toUpperCase())) return tierName(tier);
  return `${tierName(tier)} ${division}`;
}

/** Text and edge utilities per tier, from the `--tier-*` tokens in `index.css`. */
const TIER_TONE: Record<RankTier, string> = {
  IRON: "border-tier-iron/50 text-tier-iron",
  BRONZE: "border-tier-bronze/50 text-tier-bronze",
  SILVER: "border-tier-silver/50 text-tier-silver",
  GOLD: "border-tier-gold/50 text-tier-gold",
  PLATINUM: "border-tier-platinum/50 text-tier-platinum",
  EMERALD: "border-tier-emerald/50 text-tier-emerald",
  DIAMOND: "border-tier-diamond/50 text-tier-diamond",
  MASTER: "border-tier-master/50 text-tier-master",
  GRANDMASTER: "border-tier-grandmaster/50 text-tier-grandmaster",
  CHALLENGER: "border-tier-challenger/50 text-tier-challenger",
};

/** A tier's tone, or `null` for one this client does not know, which the caller leaves neutral. */
export function tierTone(tier: string): string | null {
  const known = (TIER_ORDER as readonly string[]).find(t => t === tier.toUpperCase()) as RankTier | undefined;
  return known ? TIER_TONE[known] : null;
}
