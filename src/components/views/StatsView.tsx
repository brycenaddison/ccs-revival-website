import { useState } from "react";
import { TeamBadge } from "../TeamBadge";
import type { Player } from "../../hooks/useLeagueData";

interface Props {
  players: Player[];
  isMobile: boolean;
}

interface StatOption {
  key: string;
  label: string;
  format: (v: number) => string;
  perGame?: boolean;
}

const STAT_OPTIONS: StatOption[] = [
  { key: "kda", label: "KDA", format: v => Number(v).toFixed(2) },
  { key: "kills", label: "Kills/G", format: v => Number(v).toFixed(1), perGame: true },
  { key: "deaths", label: "Deaths/G", format: v => Number(v).toFixed(1), perGame: true },
  { key: "assists", label: "Assists/G", format: v => Number(v).toFixed(1), perGame: true },
  { key: "cs", label: "CS/G", format: v => Number(v).toFixed(1) },
  { key: "damage", label: "DMG/G", format: v => Math.round(Number(v)).toLocaleString() },
  { key: "gold", label: "Gold/G", format: v => Math.round(Number(v)).toLocaleString() },
  { key: "winRate", label: "Win Rate", format: v => `${Number(v).toFixed(1)}%` },
];

const ROLES = ["All", "Top", "Jng", "Mid", "ADC", "Sup"];
const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

function getStatValue(p: Player, key: string): number {
  const opt = STAT_OPTIONS.find(o => o.key === key);
  if (!opt) return 0;
  if (opt.perGame && p.gp > 0) return ((p as any)[key] || 0) / p.gp;
  return parseFloat(String((p as any)[key])) || 0;
}

function formatStatValue(p: Player, key: string): string {
  const opt = STAT_OPTIONS.find(o => o.key === key);
  if (!opt) return String((p as any)[key]);
  if (opt.perGame && p.gp > 0) return opt.format(((p as any)[key] || 0) / p.gp);
  return opt.format((p as any)[key] || 0);
}

export function StatsView({ players, isMobile }: Props) {
  const [selectedStat, setSelectedStat] = useState("kda");
  const [roleFilter, setRoleFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [tableSortBy, setTableSortBy] = useState("kda");
  const [tableSortDir, setTableSortDir] = useState(-1);
  const [barsVisible, setBarsVisible] = useState(true);

  const filteredPlayers = players.filter(p => {
    if (roleFilter !== "All" && (p.role || "").toLowerCase() !== roleFilter.toLowerCase()) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.riot_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const leaderboardPlayers = [...filteredPlayers]
    .filter(p => p.gp > 0)
    .sort((a, b) => getStatValue(b, selectedStat) - getStatValue(a, selectedStat))
    .slice(0, 10);

  const maxStatValue = leaderboardPlayers.length > 0 ? getStatValue(leaderboardPlayers[0], selectedStat) : 1;

  const handleTableSort = (col: string) => {
    if (tableSortBy === col) setTableSortDir(d => d * -1);
    else { setTableSortBy(col); setTableSortDir(-1); }
  };

  const tableSorted = [...filteredPlayers].sort((a, b) => {
    const av = getStatValue(a, tableSortBy);
    const bv = getStatValue(b, tableSortBy);
    return (bv - av) * tableSortDir;
  });

  const handleStatChange = (key: string) => { setBarsVisible(false); setSelectedStat(key); setTimeout(() => setBarsVisible(true), 50); };
  const handleRoleChange = (role: string) => { setBarsVisible(false); setRoleFilter(role); setTimeout(() => setBarsVisible(true), 50); };

  if (!players.length) return <div className="py-10 text-center text-text-dim text-[13px]">No player stats yet. Ingest some matches first.</div>;

  const currentStatLabel = STAT_OPTIONS.find(o => o.key === selectedStat)?.label || selectedStat;

  const tableCols = isMobile
    ? [["gp", "GP"], ["kda", "KDA"], ["kills", "K"], ["deaths", "D"], ["assists", "A"]]
    : [["gp", "GP"], ["kills", "K"], ["deaths", "D"], ["assists", "A"], ["kda", "KDA"], ["cs", "CS/G"], ["damage", "DMG/G"], ["gold", "GOLD/G"], ["winRate", "WIN%"]];

  return (
    <div className="max-w-[1100px] mx-auto">
      <h2 className="font-display text-[22px] text-text-bright tracking-widest mb-4">PLAYER STATS</h2>

      {/* Controls */}
      <div className="flex gap-2.5 mb-5 flex-wrap items-center">
        <select
          value={selectedStat}
          onChange={e => handleStatChange(e.target.value)}
          className="bg-bg-input border border-border3 rounded-md text-text py-2.5 px-3.5 text-[13px] font-heading cursor-pointer tracking-wide"
        >
          {STAT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

        <div className="flex gap-1">
          {ROLES.map(role => (
            <button
              key={role}
              onClick={() => handleRoleChange(role)}
              className={`rounded font-heading text-[11px] tracking-wide cursor-pointer transition-all duration-150 ${
                roleFilter === role
                  ? "bg-accent border border-accent text-text-bright font-bold"
                  : "bg-bg-input border border-border3 text-text-secondary font-normal"
              } ${isMobile ? "px-2.5 py-2" : "px-3.5 py-2"}`}
            >
              {role === "All" ? "ALL" : role.toUpperCase()}
            </button>
          ))}
        </div>

        <input
          placeholder="Search players..."
          value={search}
          onChange={e => { setSearch(e.target.value); setBarsVisible(false); setTimeout(() => setBarsVisible(true), 50); }}
          className="bg-bg-input border border-border3 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body flex-1 min-w-[140px] outline-none"
        />
      </div>

      {/* Top 10 Leaderboard */}
      <div className={`bg-bg2 border border-border rounded-lg mb-6 ${isMobile ? "px-3 py-4" : "px-6 py-6"}`}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-display text-base text-text-bright tracking-widest m-0">
            TOP 10 — {currentStatLabel.toUpperCase()}
          </h3>
          {roleFilter !== "All" && (
            <span className="text-[10px] text-accent font-heading tracking-wider">{roleFilter.toUpperCase()} ONLY</span>
          )}
        </div>
        {leaderboardPlayers.length === 0 ? (
          <div className="py-5 text-center text-text-dim text-[13px]">No qualifying players found.</div>
        ) : (
          leaderboardPlayers.map((p, i) => {
            const val = getStatValue(p, selectedStat);
            const barPct = maxStatValue > 0 ? (val / maxStatValue) * 100 : 0;
            const teamColor = p.team?.color_primary || "#555";
            const isTop3 = i < 3;
            return (
              <div key={p.id || i} className={`flex items-center py-1.5 ${i < leaderboardPlayers.length - 1 ? "mb-2" : ""} ${isMobile ? "gap-2" : "gap-3"}`}>
                <span
                  className="font-display font-bold text-right min-w-[24px]"
                  style={{
                    fontSize: isTop3 ? 18 : 14,
                    color: isTop3 ? RANK_COLORS[i] : "var(--text-muted)",
                    textShadow: isTop3 ? `0 0 8px ${RANK_COLORS[i]}44` : "none",
                  }}
                >
                  {i + 1}
                </span>
                <div className={`flex items-center gap-2 shrink-0 ${isMobile ? "min-w-[90px]" : "min-w-[140px]"}`}>
                  <TeamBadge team={p.team} size={isMobile ? 18 : 22} />
                  <div className="min-w-0">
                    <div className={`font-heading truncate ${isTop3 ? "text-text-bright font-bold" : "text-text font-medium"} ${isTop3 ? "text-sm" : "text-[13px]"}`}>
                      {p.name}
                    </div>
                    <div className="text-[9px] text-text-muted font-heading tracking-wide">
                      {p.team?.abbreviation || "FA"}{!isMobile && ` \u00B7 ${(p.role || "\u2014").toUpperCase()}`}
                    </div>
                  </div>
                </div>
                <div className={`flex-1 bg-bg rounded overflow-hidden relative ${isTop3 ? "h-[26px]" : "h-[22px]"}`}>
                  <div
                    className="h-full rounded transition-[width] duration-[600ms]"
                    style={{
                      background: `linear-gradient(90deg, ${teamColor}, ${teamColor}88)`,
                      width: barsVisible ? `${barPct}%` : "0%",
                      transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                      boxShadow: isTop3 ? `0 0 12px ${teamColor}44` : "none",
                      opacity: isTop3 ? 1 : 0.8,
                    }}
                  />
                </div>
                <span
                  className={`font-mono text-right ${isTop3 ? "text-text-bright font-bold" : "text-text-secondary font-normal"} ${isTop3 ? "text-[15px]" : "text-[13px]"} ${isMobile ? "min-w-[44px]" : "min-w-[56px]"}`}
                >
                  {formatStatValue(p, selectedStat)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Stats Table */}
      <div className="bg-bg2 border border-border rounded-md overflow-auto">
        <table className={`w-full border-collapse ${isMobile ? "min-w-[400px]" : "min-w-[700px]"}`}>
          <thead>
            <tr>
              <th className="px-2.5 py-3 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border">PLAYER</th>
              {!isMobile && <th className="px-2.5 py-3 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border">TEAM</th>}
              {!isMobile && <th className="px-2.5 py-3 text-center text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border">ROLE</th>}
              {tableCols.map(([k, label]) => (
                <th
                  key={k}
                  onClick={() => handleTableSort(k)}
                  className={`py-3 text-center text-[10px] font-heading tracking-wider border-b border-border cursor-pointer select-none whitespace-nowrap ${
                    tableSortBy === k ? "text-accent font-bold" : "text-text-muted font-normal"
                  } ${isMobile ? "px-1.5" : "px-2.5"}`}
                >
                  {label}{tableSortBy === k ? (tableSortDir === -1 ? " \u25BC" : " \u25B2") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableSorted.map((p, i) => (
              <tr key={p.id || i} className="border-b border-bg3">
                <td className={isMobile ? "px-1.5 py-2.5" : "px-2.5 py-2.5"}>
                  <div className="flex items-center gap-2">
                    {!isMobile && <span className="text-[10px] text-text-dim font-mono min-w-[18px] text-right">{i + 1}</span>}
                    <TeamBadge team={p.team} size={22} />
                    <div className="min-w-0">
                      <div className="font-heading text-[13px] text-text font-medium truncate">{p.name}</div>
                      {isMobile && <div className="text-[10px] text-text-muted">{p.team?.abbreviation || "FA"} \u00B7 {(p.role || "\u2014").toUpperCase()}</div>}
                    </div>
                  </div>
                </td>
                {!isMobile && <td className="px-2.5 py-2.5 text-xs text-text-secondary"><span className="font-heading">{p.team?.abbreviation || "FA"}</span></td>}
                {!isMobile && <td className="px-2.5 py-2.5 text-[11px] text-text-muted text-center font-heading uppercase tracking-wide">{p.role || "\u2014"}</td>}
                {tableCols.map(([k]) => (
                  <td
                    key={k}
                    className={`text-center font-mono text-[13px] ${
                      k === "kda" ? "text-text-bright font-bold" : k === "winRate" ? ((p as any).winRate >= 50 ? "text-ccs-green" : "text-ccs-red") : "text-text-secondary"
                    } ${isMobile ? "px-1.5 py-2.5" : "px-2.5 py-2.5"}`}
                  >
                    {k === "winRate" ? `${(p as any)[k]}%` : k === "damage" || k === "gold" ? ((p as any)[k] || 0).toLocaleString() : (p as any)[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
