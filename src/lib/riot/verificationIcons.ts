/**
 * English client titles for the API's universal-access verification pool (IDs 0–28).
 * Source: https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json
 * Verified 2026-09-07. Keep in sync if docs/API.md changes the challenge pool.
 * Unknown IDs deliberately fall back to the artwork instead of inventing a search term.
 */
const VERIFICATION_ICON_NAMES: Readonly<Record<number, string>> = {
  0: "Blue Minion Bruiser Icon",
  1: "Blue Minion Hammer Time Icon",
  2: "Blue Cannon Minion Icon",
  3: "Blue Minion Caster Icon",
  4: "Blue Mountain Icon",
  5: "Blue Super Minion Icon",
  6: "Ole Paw Icon",
  7: "Debonair Rose Icon",
  8: "Ancient Golem Icon",
  9: "Daggers Icon",
  10: "Winged Sword Icon",
  11: "Lizard Elder Icon",
  12: "Fully Stacked Mejai's Icon",
  13: "Red Cannon Minion Icon",
  14: "Red Siege Minion Icon",
  15: "Red Bruiser Minion Icon",
  16: "Red Caster Minion Icon",
  17: "Red Super Minion Icon",
  18: "Mix Mix Icon",
  19: "Targon Icon",
  20: "Shurima Icon",
  21: "Tree of Life Icon",
  22: "Revive Icon",
  23: "Lil' Sprout Icon",
  24: "Spike Shield Icon",
  25: "Level One Critter Icon",
  26: "Level Two Critter Icon",
  27: "Wraith Icon",
  28: "Tibbers Icon",
};

export function verificationIconName(id: number): string | undefined {
  return VERIFICATION_ICON_NAMES[id];
}
