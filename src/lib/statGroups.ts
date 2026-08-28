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

import { fmtRatio, sortValue, type ChampionStats, type PlayerStats, type TeamStats } from "./api";
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
  /**
   * Terse label for a table header. Falls back to `label`.
   *
   * The player catalog's labels are written for the bar view's `<select>`, where there is no column
   * header to give them context — "Share of Team Deaths" is exactly right there and far too wide as a
   * column heading.
   */
  short?: string;
  value?: (row: T) => number | null;
  format?: (v: number) => string;
  text?: (row: T) => string | null;
  /** Marks a rate where a higher number is worse, so a card can color it accordingly. */
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

/**
 * Sort rows by one cell, descending when `dir` is -1.
 *
 * `sortValue` maps both null and Infinity to -Infinity, which is what keeps missing data at the
 * bottom of a descending sort instead of at the top where a reader would mistake it for a leader.
 * A text-only or unknown cell leaves the order alone rather than scrambling it.
 */
export function sortByCell<T>(rows: readonly T[], cell: StatCell<T> | undefined, dir: 1 | -1): readonly T[] {
  const read = cell?.value;
  if (!read) return rows;
  return [...rows].sort((a, b) => {
    const descending = sortValue(read(b)) - sortValue(read(a));
    return dir === -1 ? descending : -descending;
  });
}

/** A cell that remembers which group it came from, so a flat picker can still show the grouping. */
export interface FlatStatCell<T> extends StatCell<T> {
  group: string;
}

/**
 * Every numeric cell across a family of groups, flattened for a single-stat picker.
 *
 * Text-only cells are dropped: `avgTime` arrives as `"31:20"` and there is no number behind it to
 * scale a bar with. Keeping the group label lets the picker render `<optgroup>`s, so one catalog
 * serves both the grouped table and the flat bar select instead of the two drifting apart.
 */
export function flattenGroups<T>(groups: readonly StatGroup<T>[]): readonly FlatStatCell<T>[] {
  return groups.flatMap(g => g.cells.filter(c => c.value).map(c => ({ ...c, group: g.label })));
}

const tc = col<TeamStats>;
const cc = col<ChampionStats>;
const pc = col<PlayerStats>;

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
      { key: "percentHeraldsTaken", label: "Herald Share", value: tc("percentHeraldsTaken"), format: pct },
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
      // in the sense of respected — the card colors it as such.
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

// ----------------------------------------------------------------------- players

/**
 * The player catalog, previously a flat `StatDef[]` local to `PlayerLeaderboard`.
 *
 * It lived there because the leaderboard only ever needed one stat at a time, so a flat list with a
 * group *string* was enough. Player cards need the same grouping the team and champion cards have, and
 * both surfaces have to agree on what "CS/min" means and how it is rounded — so it moves here and
 * becomes the third `StatGroup` family rather than a second, parallel way of describing a stat.
 *
 * Labels are the leaderboard's originals ("Kills / Game", not the tables' terser "Kills/G"): this
 * catalog feeds a `<select>` where the reader has no column header for context.
 */
export const PLAYER_STAT_GROUPS: readonly StatGroup<PlayerStats>[] = [
  {
    id: "core",
    label: "Core",
    cells: [
      // `kda` is the one non-nullable derived field and may be Infinity, so it is read directly
      // rather than through `col` and formatted by `fmtRatio`, which renders ∞.
      { key: "kda", label: "KDA", value: p => p.kda, format: fmtRatio },
      { key: "winPercent", label: "Win Rate", short: "Win%", value: pc("winPercent"), format: pct },
      { key: "games", label: "Games Played", short: "Games", value: pc("games"), format: int },
      { key: "avgKills", label: "Kills / Game", short: "Kills/G", value: pc("avgKills") },
      { key: "avgDeaths", label: "Deaths / Game", short: "Deaths/G", value: pc("avgDeaths"), lowerIsBetter: true },
      { key: "avgAssists", label: "Assists / Game", short: "Assists/G", value: pc("avgAssists") },
      { key: "kills", label: "Total Kills", short: "Kills", value: pc("kills"), format: int },
      { key: "deaths", label: "Total Deaths", short: "Deaths", value: pc("deaths"), format: int, lowerIsBetter: true },
      { key: "assists", label: "Total Assists", short: "Assists", value: pc("assists"), format: int },
    ],
  },
  {
    id: "economy",
    label: "Economy",
    cells: [
      { key: "csMin", label: "CS / min", short: "CS/min", value: pc("csMin") },
      { key: "goldMin", label: "Gold / min", short: "Gold/min", value: pc("goldMin"), format: int },
      { key: "goldPercent", label: "Gold Share", value: pc("goldPercent"), format: pct },
      { key: "xpMin", label: "XP / min", short: "XP/min", value: pc("xpMin"), format: int },
    ],
  },
  {
    id: "damage",
    label: "Damage",
    cells: [
      { key: "damageMin", label: "Damage / min", short: "DMG/min", value: pc("damageMin"), format: int },
      { key: "damagePercent", label: "Damage Share", short: "DMG Share", value: pc("damagePercent"), format: pct },
      { key: "damagePerGold", label: "Damage per Gold", short: "DMG/Gold", value: pc("damagePerGold") },
    ],
  },
  {
    id: "vision",
    label: "Vision",
    cells: [
      { key: "visionScoreMin", label: "Vision Score / min", short: "Vision/min", value: pc("visionScoreMin") },
      { key: "visionScorePercent", label: "Vision Share", value: pc("visionScorePercent"), format: pct },
      { key: "wardsMin", label: "Wards Placed / min", short: "Wards/min", value: pc("wardsMin") },
      { key: "controlWardsMin", label: "Control Wards / min", short: "Ctrl W/min", value: pc("controlWardsMin") },
      { key: "wardsClearedMin", label: "Wards Cleared / min", short: "Clear/min", value: pc("wardsClearedMin") },
    ],
  },
  {
    // The columns the old Supabase schema had no equivalent for at all.
    id: "laning",
    label: "Laning",
    cells: [
      { key: "goldDiffAt8", label: "Gold Diff @8", value: pc("goldDiffAt8"), format: signed },
      { key: "csDiffAt8", label: "CS Diff @8", value: pc("csDiffAt8"), format: signedDec },
      { key: "xpDiffAt8", label: "XP Diff @8", value: pc("xpDiffAt8"), format: signed },
      { key: "goldDiffAt14", label: "Gold Diff @14", value: pc("goldDiffAt14"), format: signed },
      { key: "csDiffAt14", label: "CS Diff @14", value: pc("csDiffAt14"), format: signedDec },
      { key: "xpDiffAt14", label: "XP Diff @14", value: pc("xpDiffAt14"), format: signed },
    ],
  },
  {
    id: "teamfight",
    label: "Teamfight",
    cells: [
      { key: "killParticipation", label: "Kill Participation", short: "Kill Part.", value: pc("killParticipation"), format: pct },
      { key: "killPercent", label: "Share of Team Kills", short: "Kill Share", value: pc("killPercent"), format: pct },
      { key: "deathPercent", label: "Share of Team Deaths", short: "Death Share", value: pc("deathPercent"), format: pct, lowerIsBetter: true },
      { key: "killsAndAssistsAt15", label: "K+A @15", value: pc("killsAndAssistsAt15") },
      { key: "killParticipationAt15", label: "KP @15", value: pc("killParticipationAt15"), format: pct },
      { key: "killsAndAssistsAt25", label: "K+A @25", value: pc("killsAndAssistsAt25") },
      { key: "killParticipationAt25", label: "KP @25", value: pc("killParticipationAt25"), format: pct },
      { key: "firstBloodPercent", label: "First Blood Rate", short: "First Blood", value: pc("firstBloodPercent"), format: pct },
      { key: "firstBloodedPercent", label: "First Blooded Rate", short: "Blooded", value: pc("firstBloodedPercent"), format: pct, lowerIsBetter: true },
      { key: "jungleProximity", label: "Jungle Proximity", short: "Jng Prox", value: pc("jungleProximity"), format: pct },
    ],
  },
  {
    id: "highlights",
    label: "Highlights",
    cells: [
      { key: "soloKills", label: "Solo Kills", short: "Solo", value: pc("soloKills"), format: int },
      { key: "doubleKills", label: "Double Kills", short: "Doubles", value: pc("doubleKills"), format: int },
      { key: "tripleKills", label: "Triple Kills", short: "Triples", value: pc("tripleKills"), format: int },
      { key: "quadraKills", label: "Quadra Kills", short: "Quadras", value: pc("quadraKills"), format: int },
      { key: "pentaKills", label: "Penta Kills", short: "Pentas", value: pc("pentaKills"), format: int },
    ],
  },
];
