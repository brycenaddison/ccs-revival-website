import { useEffect, useState } from "react";
import { archiveApi } from "../../lib/archiveApi";

interface Props {
  matchId: string;
  onBack: () => void;
}

interface RiotParticipant {
  riotIdGameName?: string;
  summonerName?: string;
  championName?: string;
  teamId: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  champLevel: number;
  win: boolean;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
}

interface RiotTeamBan {
  championId: number;
  pickTurn: number;
}

interface RiotTeam {
  teamId: number;
  win: boolean;
  bans: RiotTeamBan[];
  objectives: Record<string, { first?: boolean; kills?: number }>;
}

interface RiotMatchData {
  info?: {
    gameDuration: number;
    gameCreation: number;
    gameVersion: string;
    participants: RiotParticipant[];
    teams: RiotTeam[];
  };
  metadata?: { matchId: string };
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ArchiveMatchDetail({ matchId, onBack }: Props) {
  const [data, setData] = useState<RiotMatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    archiveApi.matchData(matchId)
      .then(d => setData(d as RiotMatchData))
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [matchId]);

  if (loading) return <div className="text-center py-10 text-text-subtle">Loading match...</div>;
  if (err) return <div className="text-center py-10 text-ccs-red">{err}</div>;
  if (!data?.info) return <div className="text-center py-10 text-text-dim">No match data found.</div>;

  const info = data.info;
  const blueTeam = info.teams.find(t => t.teamId === 100);
  const redTeam = info.teams.find(t => t.teamId === 200);
  const bluePlayers = info.participants.filter(p => p.teamId === 100);
  const redPlayers = info.participants.filter(p => p.teamId === 200);

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-xs text-text-secondary hover:text-accent font-heading tracking-wider uppercase">
        ← Back
      </button>

      {/* Header */}
      <div className="bg-bg2 border border-border rounded-md p-4 mb-5 text-center">
        <div className="text-[10px] text-text-secondary font-heading tracking-wider uppercase">Match</div>
        <div className="font-mono text-xs text-text-dim">{matchId}</div>
        <div className="mt-2 flex justify-center items-center gap-6">
          <div className={`font-display text-2xl tracking-widest ${blueTeam?.win ? "text-ccs-green" : "text-ccs-red"}`}>
            {blueTeam?.win ? "WIN" : "LOSS"}
          </div>
          <div className="text-text-dim text-xs">vs</div>
          <div className={`font-display text-2xl tracking-widest ${redTeam?.win ? "text-ccs-green" : "text-ccs-red"}`}>
            {redTeam?.win ? "WIN" : "LOSS"}
          </div>
        </div>
        <div className="mt-2 text-xs text-text-secondary font-mono">
          {fmtDuration(info.gameDuration)} · {info.gameVersion} · {new Date(info.gameCreation).toLocaleDateString()}
        </div>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TeamPanel side="BLUE" team={blueTeam} players={bluePlayers} />
        <TeamPanel side="RED" team={redTeam} players={redPlayers} />
      </div>
    </div>
  );
}

function TeamPanel({ side, team, players }: { side: "BLUE" | "RED"; team?: RiotTeam; players: RiotParticipant[] }) {
  const color = side === "BLUE" ? "#3b82f6" : "#ef4444";
  return (
    <div className="bg-bg2 border border-border rounded-md p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-display tracking-widest" style={{ color }}>{side}</h3>
        <span className={`font-heading text-xs uppercase tracking-wider ${team?.win ? "text-ccs-green" : "text-ccs-red"}`}>
          {team?.win ? "Victory" : "Defeat"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-text-secondary uppercase tracking-wider border-b border-border">
              <th className="text-left py-2 pr-2">Player</th>
              <th className="text-left py-2 px-2">Champion</th>
              <th className="text-center py-2 px-2">K/D/A</th>
              <th className="text-center py-2 px-2">CS</th>
              <th className="text-center py-2 px-2">Gold</th>
              <th className="text-center py-2 px-2">DMG</th>
              <th className="text-center py-2 px-2">Vis</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-2 text-xs font-bold">{p.riotIdGameName || p.summonerName || "Unknown"}</td>
                <td className="py-2 px-2 text-xs text-text-secondary">{p.championName}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{p.kills}/{p.deaths}/{p.assists}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{p.totalMinionsKilled + p.neutralMinionsKilled}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{(p.goldEarned / 1000).toFixed(1)}k</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}k</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{p.visionScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {team?.bans && team.bans.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Bans</div>
          <div className="font-mono text-xs text-text-dim">
            {team.bans.map(b => b.championId).join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}
