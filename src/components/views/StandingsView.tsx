import { useState } from "react";
import { TeamBadge } from "../TeamBadge";
import { getPlayoffScenario } from "../../lib/playoffScenarios";
import { buildGameRecords, sortStandingsWithTiebreakers } from "../../lib/tiebreakers";
import type { Standing, Team, Match, Game } from "../../hooks/useLeagueData";

interface Props {
  standings: Standing[];
  teams: Team[];
  matches: Match[];
  games: Game[];
  isMobile: boolean;
}

export function StandingsView({ standings, teams, matches, games, isMobile }: Props) {
  const divs = [...new Set(standings.map(s => s.teams?.divisions?.name).filter(Boolean))] as string[];
  const [div, setDiv] = useState(divs[0] || "All");
  const filtered = div === "All" ? standings : standings.filter(s => s.teams?.divisions?.name === div);
  const gameRecords = buildGameRecords(games);
  const sorted = sortStandingsWithTiebreakers(filtered, matches, gameRecords);

  // Compute each team's position within their own group for scenario mapping
  const groupPositions: Record<string, number> = {};
  const byGroup: Record<string, Standing[]> = {};
  standings.forEach(s => {
    const groupName = s.teams?.divisions?.name || "_none";
    if (!byGroup[groupName]) byGroup[groupName] = [];
    byGroup[groupName].push(s);
  });
  Object.values(byGroup).forEach(group => {
    const groupSorted = [...group].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    groupSorted.forEach((s, i) => { groupPositions[s.id] = i + 1; });
  });

  if (!standings.length) return <div className="py-10 text-center text-text-dim text-[13px]">No standings data yet. Ingest some matches first.</div>;

  return (
    <div className="max-w-[900px] mx-auto">
      <h2 className="font-display text-[22px] text-text-bright tracking-widest mb-4">STANDINGS</h2>
      {divs.length > 1 && (
        <div className="flex gap-0 mb-4 border-b-2 border-accent">
          {["All", ...divs].map(d => (
            <button
              key={d}
              onClick={() => setDiv(d)}
              className={`bg-transparent border-none cursor-pointer px-4 py-2.5 font-heading text-[13px] tracking-wider uppercase -mb-0.5 ${
                div === d ? "bg-bg-input text-text-bright border-b-2 border-b-accent" : "text-text-muted border-b-2 border-b-transparent"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      <div className="bg-bg2 border border-border rounded-md overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["#", "TEAM", "W", "L", "WIN%", "STREAK"].map(h => (
                <th
                  key={h}
                  className={`px-3.5 py-3 text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border ${
                    ["W", "L", "WIN%", "STREAK"].includes(h) ? "text-center" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
              {!isMobile && <th className="px-3.5 py-3 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border">DIVISION</th>}
              <th className="px-3.5 py-3 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border">SCENARIO</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const t = s.teams || {} as Team;
              const total = s.wins + s.losses;
              const pct = total > 0 ? Math.round((s.wins / total) * 100) : 0;
              const pos = i + 1;
              const groupPos = groupPositions[s.id] || pos;
              const scenario = getPlayoffScenario(groupPos);
              // Tier separator: thick line between playoff tiers
              const tierBreaks = [1, 3, 4, 5, 6]; // after these positions
              const showTierBreak = tierBreaks.includes(groupPos);
              const rowBg = groupPos === 1 ? "rgba(215,165,42,0.12)" : groupPos <= 3 ? "rgba(63,0,8,0.25)" : "rgba(1,1,1,0.4)";
              const rowBorder = groupPos === 1 ? "#d7a52a" : groupPos <= 3 ? "#3f0008" : "#010101";
              const numColor = groupPos === 1 ? "#d7a52a" : groupPos <= 3 ? "#d20708" : "#666";
              return (
                <tr
                  key={s.id}
                  style={{
                    borderLeft: `4px solid ${rowBorder}`,
                    background: rowBg,
                    borderBottom: showTierBreak ? `2px solid ${rowBorder}` : undefined,
                  }}
                >
                  <td className="px-3.5 py-3.5 font-display text-lg" style={{ color: numColor }}>{pos}</td>
                  <td className="px-3.5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <TeamBadge team={t} size={28} />
                      <div>
                        <span className="font-heading text-sm text-text font-medium">{t.name}</span>
                        <span className="text-[10px] text-text-dim font-mono ml-2">{t.abbreviation}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3.5 py-3.5 text-center font-mono text-sm text-ccs-green font-bold">{s.wins}</td>
                  <td className="px-3.5 py-3.5 text-center font-mono text-sm text-ccs-red font-bold">{s.losses}</td>
                  <td className="px-3.5 py-3.5 text-center font-mono text-[13px] text-text-secondary">{pct}%</td>
                  <td className={`px-3.5 py-3.5 text-center font-mono text-[13px] font-bold ${(s.streak || "").startsWith("W") ? "text-ccs-green" : "text-ccs-red"}`}>
                    {s.streak || "—"}
                  </td>
                  {!isMobile && <td className="px-3.5 py-3.5 text-xs text-text-muted">{t.divisions?.name || "—"}</td>}
                  <td className="px-3.5 py-3.5">
                    {scenario && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-heading tracking-wider uppercase font-semibold"
                        style={{ background: scenario.bgColor, color: scenario.color, border: `1px solid ${scenario.borderColor}40` }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: scenario.color }} />
                        {scenario.label}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 bg-bg2 border border-border rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="font-display text-[14px] text-text-bright tracking-widest">GROUP RESULTS → PLAYOFF SEEDING</span>
        </div>
        <div className="p-4">
          <div className="flex flex-col gap-1.5">
            {[
              { pos: "1st", label: "Upper Bracket Bye", desc: "Advances directly to UB Round 2", color: "#d7a52a", bg: "rgba(215,165,42,0.12)" },
              { pos: "2nd-3rd", label: "Upper Bracket", desc: "Starts in Upper Bracket Round 1", color: "#d7a52a", bg: "rgba(215,165,42,0.08)" },
              { pos: "4th", label: "Lower Bracket Bye", desc: "Advances directly to LB Round 2", color: "#d20708", bg: "rgba(210,7,8,0.12)" },
              { pos: "5th", label: "Lower Bracket", desc: "Starts in Lower Bracket Round 1", color: "#d20708", bg: "rgba(210,7,8,0.08)" },
              { pos: "6th", label: "Gauntlet Qualifier", desc: "Bo3 vs Gauntlet Prelim winner", color: "#d1d2d4", bg: "rgba(209,210,212,0.08)" },
              { pos: "7th-8th", label: "Gauntlet Prelim", desc: "Bo1 cross-group elimination", color: "#999", bg: "rgba(209,210,212,0.05)" },
            ].map(s => (
              <div
                key={s.pos}
                className="flex items-center gap-3 px-3 py-2 rounded"
                style={{ background: s.bg, borderLeft: `3px solid ${s.color}` }}
              >
                <span className="font-mono text-[12px] font-bold min-w-[40px]" style={{ color: s.color }}>{s.pos}</span>
                <div className="flex-1">
                  <span className="font-heading text-[12px] font-semibold tracking-wider uppercase" style={{ color: s.color }}>{s.label}</span>
                  {!isMobile && <span className="text-[10px] text-text-muted ml-2">— {s.desc}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
