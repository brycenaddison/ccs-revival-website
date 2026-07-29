import { useState } from "react";
import { roleLabel } from "../../lib/api";
import { teamInitial } from "../../lib/utils";
import { TeamLink } from "../league/TeamLink";
import type { Player } from "../../hooks/useLeagueData";

interface Props {
  players: Player[];
  isMobile: boolean;
}

type StatKey = "kda" | "kills" | "assists" | "csMin" | "damageMin";

const LABELS: Record<StatKey, string> = {
  kda: "KDA",
  kills: "Kills",
  assists: "Assists",
  csMin: "CS/Min",
  damageMin: "DMG/Min",
};

export function PlayerLeaders({ players, isMobile }: Props) {
  const [stat, setStat] = useState<StatKey>("kda");

  if (!players.length) return null;

  const valueOf = (p: Player): number => (stat === "kda" ? parseFloat(p.kda) : p[stat]);
  const display = (p: Player): string => {
    if (stat === "kda") return p.kda;
    if (stat === "damageMin") return Math.round(p.damageMin).toLocaleString();
    if (stat === "csMin") return p.csMin.toFixed(1);
    return String(p[stat]);
  };

  const sorted = [...players]
    .sort((a, b) => valueOf(b) - valueOf(a))
    .slice(0, 5);

  return (
    <div className="bg-bg2 rounded-md overflow-hidden border border-border">
      <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
        <span className="font-display text-[15px] text-text-bright tracking-widest">STAT LEADERS</span>
        <select
          value={stat}
          onChange={e => setStat(e.target.value as StatKey)}
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
          <TeamLink team={p.team} className="flex items-center gap-2.5 flex-1 min-w-0 no-underline group">
            {p.team?.logo_url ? (
              <img src={p.team.logo_url} alt={p.team.name || ""} loading="lazy" decoding="async" className="w-8 h-8 rounded-full object-contain shrink-0" />
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
              <div className="text-[10px] text-text-muted group-hover:text-accent">{p.team?.name || "FA"} · {roleLabel(p.role)}</div>
            </div>
          </TeamLink>
          <span className={`font-display text-[22px] tracking-wider ${i === 0 ? "text-accent" : "text-text-bright"}`}>
            {display(p)}
          </span>
        </div>
      ))}
    </div>
  );
}
