/**
 * A best-of, added up.
 *
 * **Aggregated by team code, never by side.** Teams swap ends between games of a series, so summing
 * `blue` across four games adds two games of one team to two games of the other — which is the one
 * mistake this file exists to prevent.
 *
 * A trivial reduction over data already in hand: the match read serves every game's box score in one
 * response, so this is a loop over at most five games rather than anything the server should be asked
 * for. Nothing here re-derives a *result* — `MatchOutcome` is counted upstream from the fixture's own
 * games, and these totals are deliberately not a second opinion on it.
 */

import type { SeriesGame, SeriesPlayer, SeriesSide } from "./api";

/**
 * One team's contribution across the series. Counts only games that have a box score.
 *
 * The objective counts come off the side; damage, creep score, vision, solo kills, multi-kills and the
 * gold difference are summed from its five players, because the side row carries none of them.
 *
 * `soloKills` and `goldDiff14` are **nullable and that is not zero**: both are per-player and both are
 * null on a game whose timeline aged out or that never reached fourteen minutes. A series of those would
 * report `0`, which reads as "nobody got a solo kill" rather than "nothing was measured".
 */
export interface SeriesTeamTotals {
  code: string;
  /** Games this team won **among those counted**, which is not the series score. */
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  damage: number;
  cs: number;
  visionScore: number;
  /** Doubles, triples, quadras and pentas together — one row says more than four mostly-empty ones. */
  multiKills: number;
  soloKills: number | null;
  /**
   * The side's gold lead at fourteen minutes, summed over its players — so each side's figure is the
   * other's negated, which is what makes it readable as a pair rather than two independent numbers.
   */
  goldDiff14: number | null;
  towers: number;
  dragons: number;
  barons: number;
  heralds: number;
  grubs: number;
  /** Games played on blue. Only counted where the side was actually recorded. */
  blueGames: number;
}

/**
 * A player's line summed over the series.
 *
 * Two kinds of denominator travel with the sums, because a total is not always the interesting figure and
 * an average needs to know what it is over:
 *
 *  - `seconds` is the play time behind the totals, so a rate is per minute *played* rather than per game —
 *    a 45-minute game and a 22-minute one are not two equal samples. Zero when no game recorded a
 *    duration, which is what makes `perMinute` return null instead of dividing by it.
 *  - `goldDiff8Games`/`goldDiff14Games` count the games that *measured* each diff. Both are null on a game
 *    whose timeline aged out or that ended before the mark, so the count is not `games`.
 */
export interface SeriesPlayerTotals {
  /** Stable key: the profile where there is one, else the name, else the slot's position. */
  key: string;
  name: string;
  team: string;
  games: number;
  /** Play time behind these totals, in seconds. */
  seconds: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  visionScore: number;
  /** Doubles, triples, quadras and pentas together. */
  multiKills: number;
  /** Null when no game recorded one — see `SeriesTeamTotals`. */
  soloKills: number | null;
  goldDiff8: number | null;
  goldDiff8Games: number;
  goldDiff14: number | null;
  goldDiff14Games: number;
  /** Champions played, in game order, deduplicated. */
  champions: { championId: number | null; champion: string | null }[];
}

/**
 * Adds a value that may not have been measured.
 *
 * `null` in leaves the running total alone rather than contributing zero, and a total that has never
 * seen a real value stays `null`. That distinction is the whole reason this exists.
 */
const addNullable = (acc: number | null, v: number | null): number | null =>
  v === null ? acc : (acc ?? 0) + v;

export interface SeriesStats {
  a: SeriesTeamTotals;
  b: SeriesTeamTotals;
  /** Games with a box score behind them — what every total above is out of. */
  counted: number;
  /** Games in the series, box score or not. */
  total: number;
  /** Seconds, summed over the games that recorded one. Null when none did. */
  duration: number | null;
  /** The longest game, for the one superlative a single series can honestly claim. */
  longest: { game: number; duration: number } | null;
  players: SeriesPlayerTotals[];
}

const emptyTotals = (code: string): SeriesTeamTotals => ({
  code,
  wins: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  gold: 0,
  damage: 0,
  cs: 0,
  visionScore: 0,
  multiKills: 0,
  soloKills: null,
  goldDiff14: null,
  towers: 0,
  dragons: 0,
  barons: 0,
  heralds: 0,
  grubs: 0,
  blueGames: 0,
});

function addSide(into: SeriesTeamTotals, side: SeriesSide): void {
  into.wins += side.win ? 1 : 0;
  into.kills += side.kills;
  into.deaths += side.deaths;
  into.assists += side.assists;
  into.gold += side.gold;
  into.towers += side.towers;
  into.dragons += side.dragons;
  into.barons += side.barons;
  into.heralds += side.heralds;
  into.grubs += side.grubs;
  // `blueside` is three-valued: null means upstream guessed which key was which, so it is not
  // evidence of a blue game and is not counted as one.
  if (side.blueside === true) into.blueGames += 1;

  // The side row has objectives and a gold total and nothing else — everything below is per-player.
  for (const p of side.players) {
    into.damage += p.damage;
    into.cs += p.cs;
    into.visionScore += p.visionScore;
    into.multiKills += p.multiKills.double + p.multiKills.triple + p.multiKills.quadra + p.multiKills.penta;
    into.soloKills = addNullable(into.soloKills, p.soloKills);
    into.goldDiff14 = addNullable(into.goldDiff14, p.goldDiff14);
  }
}

function addPlayer(
  into: Map<string, SeriesPlayerTotals>,
  p: SeriesPlayer,
  team: string,
  index: number,
  /** The game's duration in seconds, or null where it wasn't recorded. */
  duration: number | null,
): void {
  // A line with no profile and no name still has to be told apart from its four team-mates, and the
  // lane order is stable within a game — hence the index as the last resort.
  const key = p.profileId !== null ? `p${p.profileId}` : p.name !== null ? `n${p.name}` : `${team}:${index}`;
  const existing = into.get(key);

  const row: SeriesPlayerTotals =
    existing ??
    {
      key,
      name: p.name ?? "Unknown",
      team,
      games: 0,
      seconds: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      gold: 0,
      damage: 0,
      visionScore: 0,
      multiKills: 0,
      soloKills: null,
      goldDiff8: null,
      goldDiff8Games: 0,
      goldDiff14: null,
      goldDiff14Games: 0,
      champions: [],
    };

  row.games += 1;
  row.seconds += duration ?? 0;
  if (p.goldDiff8 !== null) row.goldDiff8Games += 1;
  if (p.goldDiff14 !== null) row.goldDiff14Games += 1;
  row.goldDiff8 = addNullable(row.goldDiff8, p.goldDiff8);
  row.goldDiff14 = addNullable(row.goldDiff14, p.goldDiff14);
  row.kills += p.kills;
  row.deaths += p.deaths;
  row.assists += p.assists;
  row.cs += p.cs;
  row.gold += p.gold;
  row.damage += p.damage;
  row.visionScore += p.visionScore;
  row.multiKills += p.multiKills.double + p.multiKills.triple + p.multiKills.quadra + p.multiKills.penta;
  row.soloKills = addNullable(row.soloKills, p.soloKills);
  if (!row.champions.some(c => c.championId === p.championId)) {
    row.champions.push({ championId: p.championId, champion: p.champion });
  }

  into.set(key, row);
}

/**
 * The series added up, oriented to the fixture's own two teams.
 *
 * `codeA`/`codeB` come from the fixture, not from the games, so the two totals stay on the same side of
 * the page as the header's scoreline. A side whose code matches neither — which would mean the games
 * attached to this fixture are not this fixture's games — is dropped rather than folded into whichever
 * total it is closest to.
 */
export function seriesStats(games: readonly SeriesGame[], codeA: string, codeB: string): SeriesStats {
  const a = emptyTotals(codeA);
  const b = emptyTotals(codeB);
  const players = new Map<string, SeriesPlayerTotals>();

  let counted = 0;
  let duration: number | null = null;
  let longest: SeriesStats["longest"] = null;

  for (const game of games) {
    if (game.duration !== null) {
      duration = (duration ?? 0) + game.duration;
      if (longest === null || game.duration > longest.duration) {
        longest = { game: game.game, duration: game.duration };
      }
    }

    const sides = [game.blue, game.red].filter((s): s is SeriesSide => s !== null);
    if (sides.length === 0) continue;
    counted += 1;

    for (const side of sides) {
      const into = side.team === codeA ? a : side.team === codeB ? b : null;
      if (into === null) continue;
      addSide(into, side);
      side.players.forEach((p, i) => addPlayer(players, p, side.team, i, game.duration));
    }
  }

  return { a, b, counted, total: games.length, duration, longest, players: [...players.values()] };
}

/** KDA as a number, infinite for a player who never died — the same convention `PlayerStats.kda` uses. */
export function kdaOf(p: SeriesPlayerTotals): number {
  return p.deaths === 0 ? (p.kills + p.assists === 0 ? 0 : Infinity) : (p.kills + p.assists) / p.deaths;
}

/**
 * A total as a per-minute rate, over the time actually played.
 *
 * Null rather than zero when nothing timed the games: a rate with no denominator is unknown, and reporting
 * it as `0.0` would put a player at the bottom of a leaderboard they aren't on.
 */
export function perMinute(total: number, seconds: number): number | null {
  return seconds <= 0 ? null : total / (seconds / 60);
}

/** A nullable sum as a mean over the games that measured it. */
export function mean(sum: number | null, count: number): number | null {
  return sum === null || count <= 0 ? null : sum / count;
}

/**
 * The highest-scoring player on a metric, or null when nobody has one.
 *
 * `value` returns `null` for a player the metric wasn't measured for, and those are not candidates — a
 * leaderboard of a statistic nobody's games recorded should be empty rather than won by whoever happens to
 * be first in the list.
 */
export function leaderBy(
  players: readonly SeriesPlayerTotals[],
  value: (p: SeriesPlayerTotals) => number | null,
): SeriesPlayerTotals | null {
  let best: SeriesPlayerTotals | null = null;
  let bestValue = -Infinity;

  for (const p of players) {
    const v = value(p);
    if (v === null) continue;
    // Strictly greater, so a tie keeps the first — which is blue side of game one, a stable answer
    // rather than one that depends on iteration order changing.
    if (v > bestValue) {
      best = p;
      bestValue = v;
    }
  }

  return best;
}
