import { useState } from "react";
import { roleLabel } from "../../lib/api";
import { teamInitial } from "../../lib/utils";
import { TeamLink } from "../league/TeamLink";
import { PlayerLink } from "../profile/PlayerLink";
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

/**
 * Rate stats, where one good game off the bench outranks a season of real ones. These are
 * gated on `MIN_GAMES`; the season totals next to them are not, since volume qualifies itself.
 * The threshold matches the API's own ranking pool, which drops players with four or fewer games.
 */
const RATE_STATS: ReadonlySet<StatKey> = new Set(["kda", "csMin", "damageMin"]);
const MIN_GAMES = 5;

export function PlayerLeaders({ players, isMobile }: Props) {
  const [stat, setStat] = useState<StatKey>("kills");

  if (!players.length) return null;

  const valueOf = (p: Player): number => (stat === "kda" ? parseFloat(p.kda) : p[stat]);
  const display = (p: Player): string => {
    if (stat === "kda") return p.kda;
    if (stat === "damageMin") return Math.round(p.damageMin).toLocaleString();
    if (stat === "csMin") return p.csMin.toFixed(1);
    return String(p[stat]);
  };

  const gated = RATE_STATS.has(stat);
  const sorted = players
    .filter(p => !gated || p.gp >= MIN_GAMES)
    .sort((a, b) => valueOf(b) - valueOf(a))
    .slice(0, 5);

  return (
    <div className="bg-bg2 rounded-md overflow-hidden border border-border">
      <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
        <span className="font-display text-[15px] text-text-bright tracking-widest">
          STAT LEADERS
          {gated && <span className="ml-2 font-heading text-[10px] tracking-normal text-text-muted">min {MIN_GAMES} games</span>}
        </span>
        <select
          value={stat}
          onChange={e => setStat(e.target.value as StatKey)}
          className="bg-bg-input border border-text-subtle text-text px-2.5 py-1.5 rounded text-xs font-heading cursor-pointer"
        >
          {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!sorted.length && (
        <div className="px-4 py-6 text-center text-xs text-text-muted">
          No one has played {MIN_GAMES} games yet.
        </div>
      )}
      {sorted.map((p, i) => (
        <div
          key={p.id || i}
          className={`flex items-center gap-2.5 ${i < sorted.length - 1 ? "border-b border-bg3" : ""}`}
          style={{ padding: isMobile ? "10px 12px" : "12px 16px" }}
        >
          <span className={`font-display text-xl min-w-[24px] text-center ${i === 0 ? "text-accent" : "text-text-subtle"}`}>
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <TeamLink team={p.team} className="shrink-0 no-underline">
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
            </TeamLink>
            <div className="flex-1 min-w-0">
              <PlayerLink profileId={p.profileId} className="block truncate font-heading text-[13px] font-medium text-text no-underline hover:text-accent">{p.name}</PlayerLink>
              <TeamLink team={p.team} className="block truncate text-[10px] text-text-muted no-underline hover:text-accent">{p.team?.name || "FA"} · {roleLabel(p.role)}</TeamLink>
            </div>
          </div>
          <span className={`font-display text-[22px] tracking-wider ${i === 0 ? "text-accent" : "text-text-bright"}`}>
            {display(p)}
          </span>
        </div>
      ))}
    </div>
  );
}
