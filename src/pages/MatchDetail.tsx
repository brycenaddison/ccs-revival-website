import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../lib/supabase";
import { TeamBadge } from "../components/TeamBadge";

interface Team {
  id: string;
  name: string;
  abbreviation?: string;
  color_primary?: string;
  color_accent?: string;
  logo_url?: string;
}

interface MatchData {
  id: string;
  team_blue_id: string;
  team_red_id: string;
  score_blue: number;
  score_red: number;
  winner_team_id: string | null;
  status: string;
  format: string;
  scheduled_at: string | null;
  completed_at: string | null;
  season_phase: string | null;
  team_blue: Team;
  team_red: Team;
  splits: { name: string } | null;
}

interface Game {
  id: string;
  match_id: string;
  game_number: number;
  winner_team_id: string | null;
  game_duration: number | null;
  game_started_at: string | null;
  mvp_player_id: string | null;
}

interface PlayerStat {
  id: string;
  game_id: string;
  player_id: string;
  team_id: string;
  champion_name: string;
  kills: number;
  deaths: number;
  assists: number;
  total_minions_killed: number;
  neutral_minions_killed: number;
  vision_score: number;
  total_damage_dealt_to_champions: number;
  gold_earned: number;
  is_mvp: boolean;
  win: boolean;
  players: { display_name: string; riot_game_name: string } | null;
}

interface Ban {
  id: string;
  game_id: string;
  team_id: string;
  champion_name: string;
  ban_order: number;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const matchData = await db("matches", {
          query: `?id=eq.${matchId}&select=*,team_blue:teams!matches_team_blue_id_fkey(*),team_red:teams!matches_team_red_id_fkey(*),splits(name)`,
        });

        if (cancelled) return;
        if (!matchData || matchData.length === 0) {
          setError("Match not found.");
          setLoading(false);
          return;
        }
        setMatch(matchData[0]);

        const gamesData = await db("games", {
          query: `?match_id=eq.${matchId}&select=*&order=game_started_at`,
        });
        if (cancelled) return;
        setGames(gamesData || []);

        if (gamesData && gamesData.length > 0) {
          const gameIds = gamesData.map((g: Game) => g.id).join(",");

          const [statsData, bansData] = await Promise.all([
            db("player_game_stats", {
              query: `?game_id=in.(${gameIds})&select=*,players(display_name,riot_game_name)`,
            }),
            db("team_bans", {
              query: `?game_id=in.(${gameIds})&select=*&order=ban_order`,
            }),
          ]);
          if (cancelled) return;
          setStats(statsData || []);
          setBans(bansData || []);
        }

        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load match data.");
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [matchId]);

  if (loading) {
    return (
      <div className="bg-bg min-h-screen w-full text-text font-body flex items-center justify-center">
        <div className="text-text-muted font-heading tracking-wider text-sm">Loading match...</div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="bg-bg min-h-screen w-full text-text font-body flex flex-col items-center justify-center gap-4">
        <div className="text-text-muted font-heading tracking-wider text-sm">{error || "Match not found."}</div>
        <button onClick={() => navigate(-1)} className="text-ccs-green font-heading text-sm hover:underline bg-transparent border-none cursor-pointer">&larr; Back</button>
      </div>
    );
  }

  const blue = match.team_blue;
  const red = match.team_red;
  const blueWin = match.winner_team_id === blue.id;
  const redWin = match.winner_team_id === red.id;

  return (
    <div className="bg-bg min-h-screen w-full text-text font-body">
      {/* Top bar */}
      <div className="bg-bg border-b border-bg2 px-4 py-3">
        <div className="max-w-[960px] mx-auto">
          <button onClick={() => navigate(-1)} className="text-ccs-green font-heading text-xs tracking-wider hover:underline bg-transparent border-none cursor-pointer">
            &larr; BACK TO SCORES
          </button>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-4 py-6">
        {/* Match header */}
        <div className="bg-bg2 border border-border rounded-lg p-6 mb-6">
          <div className="flex items-center justify-center gap-6 md:gap-10">
            {/* Blue team */}
            <div className="flex items-center gap-3 flex-1 justify-end">
              <span className={`font-heading font-medium text-base md:text-lg ${blueWin ? "text-text-bright font-bold" : "text-text-muted"}`}>
                <span className="hidden md:inline">{blue.name}</span>
                <span className="md:hidden">{blue.abbreviation || blue.name}</span>
              </span>
              <TeamBadge team={blue} size={44} />
            </div>

            {/* Score */}
            <div className="flex items-center gap-3 min-w-[80px] justify-center">
              <span className={`font-display text-3xl md:text-4xl ${blueWin ? "text-text-bright" : "text-text-muted"}`}>
                {match.score_blue ?? 0}
              </span>
              <span className="font-display text-lg text-text-subtle">-</span>
              <span className={`font-display text-3xl md:text-4xl ${redWin ? "text-text-bright" : "text-text-muted"}`}>
                {match.score_red ?? 0}
              </span>
            </div>

            {/* Red team */}
            <div className="flex items-center gap-3 flex-1">
              <TeamBadge team={red} size={44} />
              <span className={`font-heading font-medium text-base md:text-lg ${redWin ? "text-text-bright font-bold" : "text-text-muted"}`}>
                <span className="hidden md:inline">{red.name}</span>
                <span className="md:hidden">{red.abbreviation || red.name}</span>
              </span>
            </div>
          </div>

          {/* Match meta */}
          <div className="flex items-center justify-center gap-3 mt-4 text-[11px] text-text-muted font-heading tracking-wider">
            {match.splits?.name && <span>{match.splits.name.toUpperCase()}</span>}
            {match.format && (
              <>
                <span className="text-text-subtle">·</span>
                <span>{match.format.toUpperCase()}</span>
              </>
            )}
            {match.season_phase && (
              <>
                <span className="text-text-subtle">·</span>
                <span>{match.season_phase.toUpperCase()}</span>
              </>
            )}
            {match.completed_at && (
              <>
                <span className="text-text-subtle">·</span>
                <span>{new Date(match.completed_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
              </>
            )}
          </div>
        </div>

        {/* Games */}
        {games.map((game, i) => {
          const gameStats = stats.filter(s => s.game_id === game.id);
          const gameBans = bans.filter(b => b.game_id === game.id);
          const blueBans = gameBans.filter(b => b.team_id === blue.id);
          const redBans = gameBans.filter(b => b.team_id === red.id);
          const blueStats = gameStats.filter(s => s.team_id === blue.id);
          const redStats = gameStats.filter(s => s.team_id === red.id);
          const gameBlueWin = game.winner_team_id === blue.id;
          const gameRedWin = game.winner_team_id === red.id;

          return (
            <div key={game.id} className="bg-bg2 border border-border rounded-lg mb-4 overflow-hidden">
              {/* Game header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm text-text-bright tracking-widest">GAME {i + 1}</span>
                  <span className="text-text-muted text-xs font-mono">{formatDuration(game.game_duration)}</span>
                </div>
                {game.winner_team_id && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted font-heading tracking-wider">WINNER</span>
                    <TeamBadge team={gameBlueWin ? blue : red} size={20} />
                    <span className="text-ccs-green font-heading text-xs font-semibold">
                      {gameBlueWin ? (blue.abbreviation || blue.name) : (red.abbreviation || red.name)}
                    </span>
                  </div>
                )}
              </div>

              {/* Bans */}
              {(blueBans.length > 0 || redBans.length > 0) && (
                <div className="flex flex-col sm:flex-row items-stretch border-b border-border">
                  <div className="flex-1 px-4 py-2.5 flex items-center gap-2 border-b sm:border-b-0 sm:border-r border-border">
                    <span className="text-[10px] text-ccs-blue font-heading tracking-wider mr-1 shrink-0">BLUE BANS</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {blueBans.map(b => (
                        <span key={b.id} className="text-xs text-text-secondary bg-bg px-1.5 py-0.5 rounded font-mono">
                          {b.champion_name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 px-4 py-2.5 flex items-center gap-2">
                    <span className="text-[10px] text-ccs-red font-heading tracking-wider mr-1 shrink-0">RED BANS</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {redBans.map(b => (
                        <span key={b.id} className="text-xs text-text-secondary bg-bg px-1.5 py-0.5 rounded font-mono">
                          {b.champion_name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Box score table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-text-muted font-heading tracking-wider border-b border-border">
                      <th className="text-left px-4 py-2.5 min-w-[140px]">PLAYER</th>
                      <th className="text-left px-2 py-2.5 min-w-[90px]">CHAMPION</th>
                      <th className="text-center px-2 py-2.5 w-[40px]">K</th>
                      <th className="text-center px-2 py-2.5 w-[40px]">D</th>
                      <th className="text-center px-2 py-2.5 w-[40px]">A</th>
                      <th className="text-center px-2 py-2.5 w-[50px]">CS</th>
                      <th className="text-center px-2 py-2.5 w-[55px]">VISION</th>
                      <th className="text-right px-2 py-2.5 w-[70px]">DAMAGE</th>
                      <th className="text-right px-4 py-2.5 w-[65px]">GOLD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Blue team */}
                    {blueStats.map(s => {
                      const playerName = s.players?.display_name || s.players?.riot_game_name || "Unknown";
                      return (
                        <tr
                          key={s.id}
                          className={`border-b border-border/50 ${gameBlueWin ? "text-text-bright" : "text-text-secondary"}`}
                        >
                          <td className="px-4 py-2 font-heading text-xs">
                            <div className="flex items-center gap-1.5">
                              <span>{playerName}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 font-mono text-xs text-text-secondary">{s.champion_name}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{s.kills}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{s.deaths}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{s.assists}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{(s.total_minions_killed || 0) + (s.neutral_minions_killed || 0)}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{s.vision_score}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs">{(s.total_damage_dealt_to_champions || 0).toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{s.gold_earned?.toLocaleString() ?? 0}</td>
                        </tr>
                      );
                    })}

                    {/* Separator */}
                    <tr>
                      <td colSpan={9} className="h-[2px] bg-border"></td>
                    </tr>

                    {/* Red team */}
                    {redStats.map(s => {
                      const playerName = s.players?.display_name || s.players?.riot_game_name || "Unknown";
                      return (
                        <tr
                          key={s.id}
                          className={`border-b border-border/50 ${gameRedWin ? "text-text-bright" : "text-text-secondary"}`}
                        >
                          <td className="px-4 py-2 font-heading text-xs">
                            <div className="flex items-center gap-1.5">
                              <span>{playerName}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 font-mono text-xs text-text-secondary">{s.champion_name}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{s.kills}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{s.deaths}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{s.assists}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{(s.total_minions_killed || 0) + (s.neutral_minions_killed || 0)}</td>
                          <td className="px-2 py-2 text-center font-mono text-xs">{s.vision_score}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs">{(s.total_damage_dealt_to_champions || 0).toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{s.gold_earned?.toLocaleString() ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {games.length === 0 && (
          <div className="text-center text-text-muted font-heading text-sm tracking-wider py-10">
            No game data available for this match.
          </div>
        )}
      </div>
    </div>
  );
}
