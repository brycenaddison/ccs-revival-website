import { useCallback, useEffect, useMemo, useState } from "react";
import {
  errorMessage,
  isAbort,
  playerStats,
  teamStats,
  teamsForConf,
  type RequestOpts,
  type Tournament,
} from "../lib/api";
import { groupLabels, teamKey, toPlayers, toRosters, toSplits, toTeam } from "../lib/leagueAdapters";
import type { LeagueData, Player, Roster, Split, Team } from "../types/league";

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

type State = Omit<LeagueData, "refresh">;

const EMPTY: State = {
  teams: [],
  matches: [],
  standings: [],
  players: [],
  rosters: [],
  articles: [],
  splits: [],
  games: [],
  twitterFeeds: [],
  twitchEmbeds: [],
  loading: true,
  error: null,
};

interface ConfBundle {
  teams: Team[];
  players: Player[];
  rosters: Roster[];
}

/** Three cheap requests per conf, ~0.2s each. */
async function loadConf(
  conf: string,
  groupName: string | undefined,
  opts: RequestOpts,
): Promise<ConfBundle> {
  const [records, playerRows] = await Promise.all([
    teamsForConf(conf, opts),
    playerStats(conf, opts),
  ]);

  const teams = records.map(r => toTeam({ ...r, conf: r.conf ?? conf }, groupName));
  const teamsById = new Map(teams.map(t => [t.id, t]));

  return {
    teams,
    players: toPlayers(playerRows, teamsById),
    rosters: toRosters(playerRows, teamsById, groupName),
  };
}

/**
 * Loads the league-wide data the site renders for the selected season(s).
 *
 * Scope note: this only uses bulk endpoints — `/teams/:conf` and `/stats/players/:conf`.
 * `/teams/:conf/:team` is deliberately **not** used here. It returns comprehensive data for
 * one team via five heavy queries, and is only ever called one at a time when a user opens a
 * specific team. Calling it per team to assemble a league view took 20–30s and saturated the
 * API's connection pool.
 *
 * The consequence is that `matches`, `games` and `standings` stay empty: every one of them
 * needs match results, and no bulk endpoint exposes those yet. `GET /matches/:conf` and
 * `GET /standings/:conf` are the blocking gaps — see the gap analysis.
 */
export function useLeagueData({ confs, tournaments }: Options): LeagueData {
  const [state, setState] = useState<State>(EMPTY);
  const [reloadToken, setReloadToken] = useState(0);

  // Depend on the joined value so a new array with the same contents is a no-op.
  const confKey = confs.join(",");

  useEffect(() => {
    const list = confKey === "" ? [] : confKey.split(",");
    if (list.length === 0) {
      setState({ ...EMPTY, loading: false });
      return;
    }

    const ac = new AbortController();
    const opts: RequestOpts = { signal: ac.signal };
    const labels = list.length > 1 ? groupLabels(tournaments, list) : null;
    setState(prev => ({ ...prev, loading: true, error: null }));

    Promise.all(list.map(conf => loadConf(conf, labels?.get(conf), opts)))
      .then(bundles => {
        if (ac.signal.aborted) return;
        const teams = bundles.flatMap(b => b.teams);
        const splits: Split[] = toSplits(tournaments.filter(t => list.includes(t.conf)));

        setState({
          ...EMPTY,
          teams: [...teams].sort((a, b) => a.name.localeCompare(b.name)),
          players: bundles.flatMap(b => b.players),
          rosters: bundles.flatMap(b => b.rosters),
          splits,
          loading: false,
        });
      })
      .catch(e => {
        if (isAbort(e) || ac.signal.aborted) return;
        setState({ ...EMPTY, loading: false, error: errorMessage(e) });
      });

    return () => ac.abort();
  }, [confKey, tournaments, reloadToken]);

  const refresh = useCallback(() => setReloadToken(n => n + 1), []);

  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}

/** Look up a team by conf and code — the same identity the adapters produce. */
export function findTeam(teams: readonly Team[], conf: string, code: string): Team | undefined {
  const id = teamKey(conf, code);
  return teams.find(t => t.id === id);
}
