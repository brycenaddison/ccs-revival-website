import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtSec,
  type RiotParticipant,
  type RiotTeam,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { useChampions } from "../../hooks/useChampions";
import type { ChampionLookup } from "../../lib/championData";
import { ChampionIcon } from "./ChampionIcon";

interface Props {
  matchId: string;
  onBack: () => void;
}

export function RiotMatchView({ matchId, onBack }: Props) {
  // The raw Riot payload has no champion artwork or display names; resolve them from DDragon.
  const champions = useChampions();
  // A finished game never changes, so this is cached for the session and never revalidated.
  const { data, isPending, error } = useQuery(queries.matchData(matchId));

  if (isPending) return <div className="text-center py-10 text-text-subtle">Loading match...</div>;
  if (error) return <div className="text-center py-10 text-ccs-red">{errorMessage(error)}</div>;
  if (!data?.info) return <div className="text-center py-10 text-text-dim">No match data found.</div>;

  const info = data.info;
  const teams = info.teams ?? [];
  const participants = info.participants ?? [];
  const blueTeam = teams.find(t => t.teamId === 100);
  const redTeam = teams.find(t => t.teamId === 200);

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
          {fmtSec(info.gameDuration)}
          {info.gameVersion ? ` · ${info.gameVersion}` : ""}
          {info.gameCreation ? ` · ${new Date(info.gameCreation).toLocaleDateString()}` : ""}
        </div>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TeamPanel side="BLUE" team={blueTeam} players={participants.filter(p => p.teamId === 100)} champions={champions} />
        <TeamPanel side="RED" team={redTeam} players={participants.filter(p => p.teamId === 200)} champions={champions} />
      </div>
    </div>
  );
}

function thousands(v: number | undefined): string {
  return v === undefined ? "—" : `${(v / 1000).toFixed(1)}k`;
}

function TeamPanel({
  side,
  team,
  players,
  champions,
}: {
  side: "BLUE" | "RED";
  team?: RiotTeam;
  players: RiotParticipant[];
  champions: ChampionLookup | null;
}) {
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
              <tr key={p.puuid ?? i} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-2 text-xs font-bold">{p.riotIdGameName || p.summonerName || "Unknown"}</td>
                <td className="py-2 px-2">
                  <ChampionIcon
                    champion={p.championId ?? p.championName}
                    lookup={champions}
                    fallbackLabel={p.championName}
                    size={22}
                    showName
                  />
                </td>
                <td className="text-center py-2 px-2 text-xs font-mono">{p.kills ?? 0}/{p.deaths ?? 0}/{p.assists ?? 0}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{(p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0)}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{thousands(p.goldEarned)}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{thousands(p.totalDamageDealtToChampions)}</td>
                <td className="text-center py-2 px-2 text-xs font-mono">{p.visionScore ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {team?.bans && team.bans.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1.5">Bans</div>
          <div className="flex flex-wrap gap-1.5">
            {team.bans
              // championId is -1 when a team declined to ban.
              .filter(b => typeof b.championId === "number" && b.championId > 0)
              .map((b, i) => (
                <ChampionIcon
                  key={`${b.pickTurn ?? i}-${b.championId}`}
                  champion={b.championId}
                  lookup={champions}
                  size={26}
                  className="flex items-center opacity-70 grayscale hover:opacity-100 hover:grayscale-0 transition"
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
