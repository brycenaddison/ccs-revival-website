import { useState } from "react";
import { teamInitial } from "../../lib/utils";
import type { Player } from "../../hooks/useLeagueData";

interface Props {
  players: Player[];
  isMobile: boolean;
}

const LABELS: Record<string, string> = { kda: "KDA", kills: "Kills", assists: "Assists", cs: "CS/Game" };

export function PlayerLeaders({ players, isMobile }: Props) {
  const [stat, setStat] = useState("kda");

  if (!players.length) return null;

  const sorted = [...players]
    .sort((a, b) => stat === "kda" ? parseFloat(b.kda) - parseFloat(a.kda) : ((b as any)[stat] || 0) - ((a as any)[stat] || 0))
    .slice(0, 5);

  return (
    <div className="bg-bg2 rounded-md overflow-hidden border border-border">
      <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
        <span className="font-display text-[15px] text-text-bright tracking-widest">STAT LEADERS</span>
        <select
          value={stat}
          onChange={e => setStat(e.target.value)}
          className="bg-bg-input border border-text-subtle text-text px-2.5 py-1.5 rounded text-xs font-heading cursor-pointer"
        >
          {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {sorted.map((p, i) => (
        <div
          key={p.id || i}
          className={`flex items-center gap-2.5 ${i < sorted.length - 1 ? "border-b border-bg3" : ""}`}
          style={{ padding: isMobile ? "10px 12px" : "12px 16px" }}
        >
          <span className={`font-display text-xl min-w-[24px] text-center ${i === 0 ? "text-accent" : "text-text-subtle"}`}>
            {i + 1}
          </span>
          {p.team?.logo_url ? (
            <img src={p.team.logo_url} alt={p.team.name || ""} className="w-8 h-8 rounded-full object-contain shrink-0" />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] text-white font-bold font-heading shrink-0"
              style={{ background: p.team ? `linear-gradient(135deg, ${p.team.color_primary || "#333"}, ${p.team.color_accent || "#555"})` : "var(--text-subtle)" }}
            >
              {teamInitial(p.team?.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-heading text-[13px] text-text font-medium truncate">{p.name}</div>
            <div className="text-[10px] text-text-muted">{p.team?.name || "FA"} · {p.role || "—"}</div>
          </div>
          <span className={`font-display text-[22px] tracking-wider ${i === 0 ? "text-accent" : "text-text-bright"}`}>
            {stat === "kda" ? p.kda : (p as any)[stat]}
          </span>
        </div>
      ))}
    </div>
  );
}
