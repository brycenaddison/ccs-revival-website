/**
 * Resolving which tournament(s) are "now".
 *
 * The API returns tournaments unordered and has no notion of a current season, so both
 * ordering and active-league selection are derived here. `activeConfs` is deliberately a
 * *set*: the league expects to run more than one division concurrently, and modelling that
 * in the data layer now means adding multi-league UI later is a presentation change only.
 */

import type { Tournament } from "./types";

const SEASON_ORDER: Readonly<Record<string, number>> = {
  spring: 1,
  summer: 2,
  fall: 3,
  autumn: 3,
  winter: 4,
};

/**
 * Sortable recency key, highest = most recent.
 *
 * `name` ("CCS 2022 Fall Diamond Division") carries a four-digit year and a season word, so
 * it is preferred over `shortname` ("Fall '22"). Rows we can't parse sort last.
 */
export function recencyKey(t: Tournament): number {
  const haystack = `${t.name} ${t.shortname ?? ""}`;
  const fullYear = /\b(20\d{2})\b/.exec(haystack);
  const shortYear = /'(\d{2})\b/.exec(haystack);
  const year = fullYear ? Number(fullYear[1]) : shortYear ? 2000 + Number(shortYear[1]) : 0;
  if (year === 0) return 0;

  const season = /\b(spring|summer|fall|autumn|winter)\b/i.exec(haystack);
  const seasonRank = season ? SEASON_ORDER[season[1].toLowerCase()] ?? 0 : 0;
  return year * 10 + seasonRank;
}

/** Newest season first; ties broken by conf id for stability. */
export function sortByRecency(list: readonly Tournament[]): Tournament[] {
  return [...list].sort((a, b) => recencyKey(b) - recencyKey(a) || a.conf.localeCompare(b.conf));
}

function confsFromEnv(): string[] {
  return (import.meta.env.VITE_ACTIVE_CONFS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * How the current league was decided — which of the three rules in `resolveActive` answered.
 *
 * It matters because the server has only one of them. `GET /schedule` defaults to every conf with
 * `tournaments.active`, and nothing else: it knows no env pin and does not fall back to the newest
 * season. So the feed can lean on the server's default exactly when `flagged` answered here, and has
 * to name the confs itself otherwise — or the ticker, Scores and Schedule stay empty while every
 * other tab shows the season the picker says is selected.
 */
export type ActiveSource = "pinned" | "flagged" | "newest";

export interface ActiveResolution {
  confs: string[];
  /** `null` only when there are no tournaments at all. */
  source: ActiveSource | null;
}

/**
 * Which confs make up the current league.
 *
 * Resolution order:
 *   1. `VITE_ACTIVE_CONFS` — an explicit pin, which still wins so a deployment can override the
 *      flag without a database write.
 *   2. `tournaments.active` — set from the site admin's league editor.
 *   3. The most recent tournament by `recencyKey`, for a deployment with neither.
 */
export function resolveActive(list: readonly Tournament[]): ActiveResolution {
  const known = new Set(list.map(t => t.conf));

  const pinned = confsFromEnv().filter(c => known.has(c));
  if (pinned.length > 0) return { confs: pinned, source: "pinned" };

  const flagged = list.filter(t => t.active === true).map(t => t.conf);
  if (flagged.length > 0) return { confs: flagged, source: "flagged" };

  const newest = sortByRecency(list)[0];
  return newest ? { confs: [newest.conf], source: "newest" } : { confs: [], source: null };
}

/** `resolveActive` for a caller that only wants the set. */
export function resolveActiveConfs(list: readonly Tournament[]): string[] {
  return resolveActive(list).confs;
}

/**
 * Run a per-conf fetch across several confs and concatenate the results.
 * A conf that fails contributes nothing rather than failing the whole set.
 */
export async function forEachConf<T>(
  confs: readonly string[],
  fn: (conf: string) => Promise<T[]>,
): Promise<T[]> {
  const settled = await Promise.all(confs.map(c => fn(c).catch(() => [] as T[])));
  return settled.flat();
}
