import { useState } from "react";
import { teamInitial } from "../../lib/utils";
import type { Player } from "../../hooks/useLeagueData";

interface Props {
  players: Player[];
  isMobile: boolean;
}

export function PlayersView({ players, isMobile }: Props) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const roles = ["All", ...new Set(players.map(p => p.role).filter(Boolean))] as string[];

  const filtered = players.filter(p => {
    if (roleFilter !== "All" && p.role !== roleFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.riot_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!players.length) return <div className="py-10 text-center text-text-dim text-[13px]">No players on any roster yet.</div>;

  return (
    <div className="max-w-[900px] mx-auto">
      <h2 className="font-display text-[22px] text-text-bright tracking-widest mb-4">PLAYERS</h2>
      <div className="flex gap-2.5 mb-4 flex-wrap">
        <input
          placeholder="Search players..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-bg-input border border-border3 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body flex-1 min-w-[160px] outline-none"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="bg-bg-input border border-border3 rounded-md text-text py-2.5 px-3.5 text-[13px] font-heading cursor-pointer"
        >
          {roles.map(r => <option key={r} value={r}>{r === "All" ? "All Roles" : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </div>
      <div className="bg-bg2 border border-border rounded-md overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-text-dim text-[13px]">No players match your search.</div>
        ) : (
          filtered.map((p, i) => (
            <div
              key={p.id || i}
              className={`flex items-center ${i < filtered.length - 1 ? "border-b border-border" : ""} ${isMobile ? "gap-2.5 p-3" : "gap-3.5 px-[18px] py-3"}`}
            >
              {p.team?.logo_url ? (
                <img src={p.team.logo_url} alt={p.team.name || ""} className="w-9 h-9 rounded-full object-contain shrink-0" />
              ) : (
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs text-white font-bold font-heading shrink-0"
                  style={{ background: p.team ? `linear-gradient(135deg, ${p.team.color_primary || "#333"}, ${p.team.color_accent || "#555"})` : "var(--border3)" }}
                >
                  {teamInitial(p.team?.name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-heading text-sm text-text font-medium">
                  {p.name}
                  {p.is_captain && <span className="text-[9px] text-ccs-orange ml-1.5">CAPTAIN</span>}
                </div>
                <div className="text-[11px] text-text-muted">
                  {p.team?.name || "Free Agent"} &middot; {(p.role || "\u2014").toUpperCase()}
                  {p.riot_name && <span className="text-text-dim"> &middot; {p.riot_name}#{p.riot_tag || "?"}</span>}
                </div>
              </div>
              {p.gp > 0 && !isMobile && (
                <div className="flex gap-4 items-center">
                  <div className="text-center">
                    <div className="text-[9px] text-text-muted font-heading tracking-wide">GP</div>
                    <div className="font-mono text-[13px] text-text-secondary">{p.gp}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-text-muted font-heading tracking-wide">KDA</div>
                    <div className="font-mono text-[13px] text-text-bright font-bold">{p.kda}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-text-muted font-heading tracking-wide">WIN%</div>
                    <div className={`font-mono text-[13px] ${(p as any).winRate >= 50 ? "text-ccs-green" : "text-ccs-red"}`}>{(p as any).winRate}%</div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
