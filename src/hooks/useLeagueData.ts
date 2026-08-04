import { useCallback, useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { errorMessage, type TeamRecord, type Tournament } from "../lib/api";
import { groupLabels, teamKey, toRosters, toSplits, toStandingsFromTeams, toTeam } from "../lib/leagueAdapters";
import { queries, queryRoots, resultsKey } from "../lib/queries";
import type { LeagueData, Roster, Split, Standing, Team } from "../types/league";

export type {
  Article,
  Game,
  LeagueData,
  Match,
  Player,
  Roster,
  Split,
  Standing,
  Team,
  TwitchEmbed,
  TwitterFeed,
} from "../types/league";

interface Options {
  /** Confs to load. Usually `useLeague().selectedConfs`. */
  confs: readonly string[];
  /** Tournament metadata, used for season labels and conf grouping. */
  tournaments: readonly Tournament[];
}

interface ConfBundle {
  teams: Team[];
  standings: Standing[];
  rosters: Roster[];
}

/**
 * Everything one conf's `/teams` response answers for.
 *
 * `/teams/:conf` carries teams, rosters *and* records — every row carries its own — so the whole
 * Teams view comes from a single call. What it does not carry is fetched only where it is shown:
 * `useSeason` for phase-scoped standings and brackets, `usePlayers` for leaderboards.
 */
function bundleConf(conf: string, records: readonly TeamRecord[], groupName: string | undefined): ConfBundle {
  // `teams.conf` is nullable, and every identity downstream is keyed on (conf, code), so pin
  // the conf we asked for before anything derives a key from it.
  const confRecords = records.map(r => ({ ...r, conf: r.conf ?? conf }));
  const teams = confRecords.map(r => toTeam(r, groupName));
  const teamsById = new Map(teams.map(t => [t.id, t]));

  return {
    teams,
    standings: toStandingsFromTeams(confRecords, teamsById, groupName),
    rosters: toRosters(confRecords, teamsById, groupName),
  };
}

/**
 * Loads the league-wide data the site renders for the selected season(s).
 *
 * Scope note: `/teams/:conf` is the only endpoint here. `/teams/:conf/:team` is deliberately **not**
 * used: it returns comprehensive data for one team via five heavy queries, and is only ever called
 * one at a time when a user opens a specific team. Calling it per team to assemble a league view
 * took 20–30s and saturated the API's connection pool.
 *
 * One query per conf rather than one for the whole selection, so the request is shared with anything
 * else that wants that conf — a team page's `/teams/:conf` lookup reuses this copy instead of
 * fetching it again seconds later.
 *
 * `standings` here are records without a ranking — see `toStandingsFromTeams`. Still empty:
 * `matches` and `games`. `GET /matches/:conf` exists now and would fill `matches` with the series
 * list; it is no longer needed for ranking, which the API resolves, only for showing *why* a
 * head-to-head tiebreak went the way it did. `games` has no bulk endpoint at all: individual games
 * are only reachable per team, through the team page's matchlist.
 */
export function useLeagueData({ confs, tournaments }: Options): LeagueData {
  const client = useQueryClient();

  // Depend on the joined value so a new array with the same contents is a no-op.
  const confKey = confs.join(",");
  const list = useMemo(() => (confKey === "" ? [] : confKey.split(",")), [confKey]);

  const results = useQueries({ queries: list.map(conf => queries.teamsForConf(conf)) });
  const key = resultsKey(results);

  const value = useMemo(() => {
    // One conf needs no group label — a division tab with a single entry is noise.
    const labels = list.length > 1 ? groupLabels(tournaments, list) : null;
    const bundles = list.map((conf, i) => bundleConf(conf, results[i]?.data ?? [], labels?.get(conf)));

    const teams = bundles.flatMap(b => b.teams);
    const splits: Split[] = toSplits(tournaments.filter(t => list.includes(t.conf)));
    const failed = results.find(r => r.error);

    return {
      teams: [...teams].sort((a, b) => a.name.localeCompare(b.name)),
      standings: bundles.flatMap(b => b.standings),
      rosters: bundles.flatMap(b => b.rosters),
      splits,
      matches: [],
      games: [],
      articles: [],
      twitterFeeds: [],
      twitchEmbeds: [],
      // Only the first load blocks the page; a background revalidation keeps the current view.
      loading: results.some(r => r.isLoading),
      error: failed ? errorMessage(failed.error) : null,
    };
    // `results` is a new array each render; `key` changes only when one of them actually does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, list, tournaments]);

  /** Drops the cached league so every mounted view refetches. Used by the live-match poll. */
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: queryRoots.teams });
    void client.invalidateQueries({ queryKey: queryRoots.standings });
  }, [client]);

  return useMemo(() => ({ ...value, refresh }), [value, refresh]);
}

/** Look up a team by conf and code — the same identity the adapters produce. */
export function findTeam(teams: readonly Team[], conf: string, code: string): Team | undefined {
  const id = teamKey(conf, code);
  return teams.find(t => t.id === id);
}
