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
}

export function StandingsWidget({ standings, teams, matches, games }: Props) {
  const divs = [...new Set(standings.map(s => s.teams?.divisions?.name).filter(Boolean))] as string[];
  const [div, setDiv] = useState(divs[0] || "All");
  const filtered = div === "All" ? standings : standings.filter(s => s.teams?.divisions?.name === div);
  const gameRecords = buildGameRecords(games);
  const sorted = sortStandingsWithTiebreakers(filtered, matches, gameRecords);

  // Compute per-group positions for scenario mapping
  const groupPositions: Record<string, number> = {};
  const byGroup: Record<string, typeof standings> = {};
  standings.forEach(s => {
    const g = s.teams?.divisions?.name || "_none";
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(s);
  });
  Object.values(byGroup).forEach(group => {
    [...group].sort((a, b) => b.wins - a.wins || a.losses - b.losses)
      .forEach((s, i) => { groupPositions[s.id] = i + 1; });
  });

  if (!standings.length && teams.length) {
    return (
      <div className="bg-bg2 rounded-md overflow-hidden border border-border">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[15px] text-text-bright tracking-widest">TEAMS</span>
        </div>
        {teams.map((t, i) => (
          <div key={t.id} className={`flex items-center gap-2 px-3 py-2.5 ${i < teams.length - 1 ? "border-b border-bg2" : ""}`}>
            <TeamBadge team={t} size={28} />
            <span className="font-heading text-[13px] text-text font-medium">{t.name}</span>
            <span className="text-[10px] text-text-dim font-mono ml-auto">{t.abbreviation}</span>
          </div>
        ))}
      </div>
    );
  }

  if (!standings.length) return null;

  return (
    <div className="bg-bg2 rounded-md overflow-hidden border border-border">
      {divs.length > 1 && (
        <div className="flex border-b border-border">
          {divs.map(d => (
            <button
              key={d}
              onClick={() => setDiv(d)}
              className={`flex-1 border-none cursor-pointer py-2.5 font-display text-[13px] tracking-widest ${
                div === d ? "bg-bg-input text-text-bright border-b-2 border-b-accent" : "bg-transparent text-text-muted border-b-2 border-b-transparent"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border">TEAM</th>
            <th className="px-2 py-2 text-center text-[10px] text-text-muted font-heading font-normal border-b border-border">W-L</th>
            <th className="px-2 py-2 text-center text-[10px] text-text-muted font-heading font-normal border-b border-border">STRK</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const t = s.teams || {} as Team;
            const pos = i + 1;
            const groupPos = groupPositions[s.id] || pos;
            const scenario = getPlayoffScenario(groupPos);
            const tierBreaks = [1, 3, 4, 5, 6];
            const showTierBreak = tierBreaks.includes(groupPos);
            const rowBg = groupPos === 1 ? "rgba(215,165,42,0.12)" : groupPos <= 3 ? "rgba(63,0,8,0.25)" : "rgba(1,1,1,0.4)";
            const rowBorder = groupPos === 1 ? "#d7a52a" : groupPos <= 3 ? "#3f0008" : "#010101";
            const numColor = groupPos === 1 ? "#d7a52a" : groupPos <= 3 ? "#d20708" : "#666";
            return (
              <tr
                key={s.id}
                className="cursor-pointer"
                style={{
                  borderLeft: `4px solid ${rowBorder}`,
                  background: rowBg,
                  borderBottom: showTierBreak ? `2px solid ${rowBorder}` : undefined,
                }}
              >
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono min-w-[14px] text-right font-bold" style={{ color: numColor }}>{pos}</span>
                    <TeamBadge team={t} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-heading text-[13px] text-text font-medium">{t.name}</span>
                      {scenario && (
                        <span
                          className="text-[8px] font-heading tracking-wider uppercase font-bold"
                          style={{ color: scenario.color }}
                        >
                          {scenario.shortLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="text-center font-mono text-[13px] text-text-secondary">{s.wins}-{s.losses}</td>
                <td className={`text-center font-mono text-xs font-bold ${(s.streak || "").startsWith("W") ? "text-ccs-green" : "text-ccs-red"}`}>
                  {s.streak || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Legend */}
      {true && sorted.length > 0 && (
        <div className="px-3 py-2 border-t border-border flex flex-wrap gap-x-3 gap-y-1">
          {[
            { label: "Upper", color: "#d7a52a" },
            { label: "Lower", color: "#d20708" },
            { label: "Gauntlet", color: "#d1d2d4" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
              <span className="text-[8px] text-text-muted font-heading tracking-wider">{l.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
