/**
 * Which statistics to show, grouped by what they measure.
 *
 * `TeamStats` has ~42 fields and `ChampionStats` ~50. Rendering all of them at once is unreadable and
 * rendering the nine the old tables picked wastes most of what the API serves, so the page shows one
 * *group* at a time and lets the reader switch. The groups are by area of the game, not by data type,
 * because "how does this team play?" is answered by a coherent set (all the vision numbers together),
 * not by a slice of alphabetically adjacent columns.
 *
 * Every group is derived from a single already-loaded response. Nothing here fetches or aggregates.
 */

import type { ChampionStats, TeamStats } from "./api";
import { col, dec, int, pct, signed, signedDec } from "./statFormat";

/**
 * One statistic, as displayed.
 *
 * A cell is either numeric (`value`, formatted by `format`) or textual (`text`) — `avgTime` arrives
 * pre-formatted as `"m:ss"` from the view and is deliberately kept as a string rather than parsed
 * back into seconds just to re-render it.
 */
export interface StatCell<T> {
  key: string;
  label: string;
  value?: (row: T) => number | null;
  format?: (v: number) => string;
  text?: (row: T) => string | null;
  /** Marks a rate where a higher number is worse, so a card can colour it accordingly. */
  lowerIsBetter?: boolean;
}

export interface StatGroup<T> {
  id: string;
  label: string;
  cells: readonly StatCell<T>[];
}

/** Render one cell to a display string, or the em-dash fallback. */
export function cellText<T>(cell: StatCell<T>, row: T): string {
  if (cell.text) return cell.text(row) || "—";
  const v = cell.value?.(row) ?? null;
  if (v === null) return "—";
  return (cell.format ?? dec(2))(v);
}

const tc = col<TeamStats>;
const cc = col<ChampionStats>;

// ------------------------------------------------------------------------- teams

export const TEAM_STAT_GROUPS: readonly StatGroup<TeamStats>[] = [
  {
    id: "combat",
    label: "Combat",
    cells: [
      { key: "avgKills", label: "Kills/G", value: tc("avgKills") },
      { key: "avgDeaths", label: "Deaths/G", value: tc("avgDeaths"), lowerIsBetter: true },
      { key: "avgAssists", label: "Assists/G", value: tc("avgAssists") },
      { key: "killDeathRatio", label: "K:D", value: tc("killDeathRatio") },
      { key: "avgKillsAt15", label: "Kills @15", value: tc("avgKillsAt15") },
      { key: "avgKillsAt25", label: "Kills @25", value: tc("avgKillsAt25") },
      { key: "firstBloodPercent", label: "First Blood", value: tc("firstBloodPercent"), format: pct },
    ],
  },
  {
    id: "economy",
    label: "Economy",
    cells: [
      { key: "goldMin", label: "Gold/min", value: tc("goldMin"), format: int },
      { key: "csMin", label: "CS/min", value: tc("csMin") },
      { key: "xpMin", label: "XP/min", value: tc("xpMin"), format: int },
      { key: "damageMin", label: "DMG/min", value: tc("damageMin"), format: int },
      { key: "avgTime", label: "Avg Time", text: t => t.avgTime },
    ],
  },
  {
    id: "vision",
    label: "Vision",
    cells: [
      { key: "visionScoreMin", label: "Vision/min", value: tc("visionScoreMin") },
      { key: "wardsPlacedMin", label: "Wards/min", value: tc("wardsPlacedMin") },
      { key: "controlWardsPurchasedMin", label: "Ctrl Wards/min", value: tc("controlWardsPurchasedMin") },
      { key: "wardsClearedMin", label: "Cleared/min", value: tc("wardsClearedMin") },
      { key: "wardsClearedPercent", label: "Wards Cleared", value: tc("wardsClearedPercent"), format: pct },
    ],
  },
  {
    // Taken *and* given, side by side. The old dashboard could only show what a team took, which
    // reads a slow team with a leaky map as merely average; the pairing is the point of this group.
    id: "objectives",
    label: "Objectives",
    cells: [
      { key: "firstTowerPercent", label: "First Tower", value: tc("firstTowerPercent"), format: pct },
      { key: "avgTowersTaken", label: "Towers Taken", value: tc("avgTowersTaken") },
      { key: "avgTowersGiven", label: "Towers Given", value: tc("avgTowersGiven"), lowerIsBetter: true },
      { key: "firstDragonPercent", label: "First Dragon", value: tc("firstDragonPercent"), format: pct },
      { key: "avgDragonsTaken", label: "Dragons Taken", value: tc("avgDragonsTaken") },
      { key: "avgDragonsGiven", label: "Dragons Given", value: tc("avgDragonsGiven"), lowerIsBetter: true },
      { key: "percentDragonsTaken", label: "Dragon Share", value: tc("percentDragonsTaken"), format: pct },
      { key: "firstHeraldPercent", label: "First Herald", value: tc("firstHeraldPercent"), format: pct },
      { key: "avgHeraldsTaken", label: "Heralds Taken", value: tc("avgHeraldsTaken") },
      { key: "avgHeraldsGiven", label: "Heralds Given", value: tc("avgHeraldsGiven"), lowerIsBetter: true },
      { key: "firstBaronPercent", label: "First Baron", value: tc("firstBaronPercent"), format: pct },
      { key: "avgBaronsTaken", label: "Barons Taken", value: tc("avgBaronsTaken") },
      { key: "avgBaronsGiven", label: "Barons Given", value: tc("avgBaronsGiven"), lowerIsBetter: true },
      { key: "percentBaronsTaken", label: "Baron Share", value: tc("percentBaronsTaken"), format: pct },
    ],
  },
  {
    id: "laning",
    label: "Laning",
    cells: [
      { key: "goldDiffAt14", label: "Gold Diff @14", value: tc("goldDiffAt14"), format: signed },
      { key: "csDiffAt14", label: "CS Diff @14", value: tc("csDiffAt14"), format: signedDec },
      { key: "xpDiffAt14", label: "XP Diff @14", value: tc("xpDiffAt14"), format: signed },
    ],
  },
  {
    id: "sides",
    label: "Sides",
    cells: [
      { key: "bluesideWinrate", label: "Blue Win%", value: tc("bluesideWinrate"), format: pct },
      { key: "bluesideWins", label: "Blue Wins", value: tc("bluesideWins"), format: int },
      { key: "redsideWinrate", label: "Red Win%", value: tc("redsideWinrate"), format: pct },
      { key: "redsideWins", label: "Red Wins", value: tc("redsideWins"), format: int },
    ],
  },
];

// --------------------------------------------------------------------- champions

export const CHAMPION_STAT_GROUPS: readonly StatGroup<ChampionStats>[] = [
  {
    id: "draft",
    label: "Draft",
    cells: [
      { key: "games", label: "Picks", value: cc("games"), format: int },
      { key: "bans", label: "Bans", value: cc("bans"), format: int },
      { key: "pickRate", label: "Pick Rate", value: cc("pickRate"), format: pct },
      { key: "banRate", label: "Ban Rate", value: cc("banRate"), format: pct },
      { key: "presence", label: "Presence", value: cc("presence"), format: pct },
      // How early it leaves the board. A low turn is a higher-priority ban, so lower is "better"
      // in the sense of respected — the card colours it as such.
      { key: "avgBanTurn", label: "Avg Ban Turn", value: cc("avgBanTurn"), format: dec(1), lowerIsBetter: true },
    ],
  },
  {
    id: "combat",
    label: "Combat",
    cells: [
      { key: "kda", label: "KDA", value: c => c.kda },
      { key: "avgKills", label: "Kills/G", value: cc("avgKills") },
      { key: "avgDeaths", label: "Deaths/G", value: cc("avgDeaths"), lowerIsBetter: true },
      { key: "avgAssists", label: "Assists/G", value: cc("avgAssists") },
      { key: "killParticipation", label: "Kill Part.", value: cc("killParticipation"), format: pct },
      { key: "killPercent", label: "Kill Share", value: cc("killPercent"), format: pct },
      { key: "deathPercent", label: "Death Share", value: cc("deathPercent"), format: pct, lowerIsBetter: true },
      { key: "firstBloodPercent", label: "First Blood", value: cc("firstBloodPercent"), format: pct },
      { key: "soloKills", label: "Solo Kills", value: cc("soloKills"), format: int },
      { key: "avgTime", label: "Avg Time", text: c => c.avgTime },
    ],
  },
  {
    id: "economy",
    label: "Economy",
    cells: [
      { key: "csMin", label: "CS/min", value: cc("csMin") },
      { key: "goldMin", label: "Gold/min", value: cc("goldMin"), format: int },
      { key: "goldPercent", label: "Gold Share", value: cc("goldPercent"), format: pct },
      { key: "xpMin", label: "XP/min", value: cc("xpMin"), format: int },
      { key: "damageMin", label: "DMG/min", value: cc("damageMin"), format: int },
      { key: "damagePercent", label: "DMG Share", value: cc("damagePercent"), format: pct },
      { key: "damagePerGold", label: "DMG/Gold", value: cc("damagePerGold") },
    ],
  },
  {
    id: "vision",
    label: "Vision",
    cells: [
      { key: "visionScoreMin", label: "Vision/min", value: cc("visionScoreMin") },
      { key: "visionScorePercent", label: "Vision Share", value: cc("visionScorePercent"), format: pct },
      { key: "wardsMin", label: "Wards/min", value: cc("wardsMin") },
      { key: "controlWardsMin", label: "Ctrl Wards/min", value: cc("controlWardsMin") },
      { key: "wardsClearedMin", label: "Cleared/min", value: cc("wardsClearedMin") },
    ],
  },
  {
    id: "laning",
    label: "Laning",
    cells: [
      { key: "goldDiffAt8", label: "Gold Diff @8", value: cc("goldDiffAt8"), format: signed },
      { key: "csDiffAt8", label: "CS Diff @8", value: cc("csDiffAt8"), format: signedDec },
      { key: "xpDiffAt8", label: "XP Diff @8", value: cc("xpDiffAt8"), format: signed },
      { key: "goldDiffAt14", label: "Gold Diff @14", value: cc("goldDiffAt14"), format: signed },
      { key: "csDiffAt14", label: "CS Diff @14", value: cc("csDiffAt14"), format: signedDec },
      { key: "xpDiffAt14", label: "XP Diff @14", value: cc("xpDiffAt14"), format: signed },
    ],
  },
  {
    id: "teamfight",
    label: "Teamfight",
    cells: [
      { key: "killsAndAssistsAt15", label: "K+A @15", value: cc("killsAndAssistsAt15") },
      { key: "killParticipationAt15", label: "KP @15", value: cc("killParticipationAt15"), format: pct },
      { key: "killsAndAssistsAt25", label: "K+A @25", value: cc("killsAndAssistsAt25") },
      { key: "killParticipationAt25", label: "KP @25", value: cc("killParticipationAt25"), format: pct },
      { key: "doubleKills", label: "Doubles", value: cc("doubleKills"), format: int },
      { key: "tripleKills", label: "Triples", value: cc("tripleKills"), format: int },
      { key: "quadraKills", label: "Quadras", value: cc("quadraKills"), format: int },
      { key: "pentaKills", label: "Pentas", value: cc("pentaKills"), format: int },
    ],
  },
];
