import { useState } from "react";
import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { getPlayoffScenario } from "../../lib/playoffScenarios";
import type { Standing, Team } from "../../hooks/useLeagueData";

interface Props {
  /** Ranked, from `useStandings`. Rendered in the order given. */
  standings: Standing[];
  teams: Team[];
  /** True while standings are in flight, so the team-list fallback doesn't flash first. */
  loading?: boolean;
}

export function StandingsWidget({ standings, teams, loading }: Props) {
  const divs = [...new Set(standings.map(s => s.teams?.divisions?.name).filter(Boolean))] as string[];
  const [div, setDiv] = useState(divs[0] || "All");

  // Ranked by the API — series record, then game win percentage, then head-to-head. Not re-sorted
  // here: head-to-head isn't derivable from anything this page loads, and tied teams share a rank
  // rather than being forced into an order. See `useStandings`.
  const rows = div === "All" ? standings : standings.filter(s => s.teams?.divisions?.name === div);

  // Standings load on their own request, so "none yet" and "none at all" are different states —
  // showing the fallback while one is in flight would swap the panel out from under the reader.
  if (loading && !standings.length) return null;

  if (!standings.length && teams.length) {
    return (
      <div className="bg-bg2 rounded-md overflow-hidden border border-border">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[15px] text-text-bright tracking-widest">TEAMS</span>
        </div>
        {teams.map((t, i) => (
          <TeamLink
            key={t.id}
            team={t}
            className={`flex items-center gap-2 px-3 py-2.5 no-underline group ${i < teams.length - 1 ? "border-b border-bg2" : ""}`}
          >
            <TeamBadge team={t} size={28} />
            <span className="font-heading text-[13px] text-text font-medium group-hover:text-accent">{t.name}</span>
            <span className="text-[10px] text-text-dim font-mono ml-auto">{t.abbreviation}</span>
          </TeamLink>
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
          {rows.map((s, i) => {
            const t = s.teams || {} as Team;
            const groupPos = s.rank ?? i + 1;
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
                  <TeamLink team={t} className="flex items-center gap-2 no-underline group">
                    <span className="text-[10px] font-mono min-w-[14px] text-right font-bold" style={{ color: numColor }}>{s.place ?? groupPos}</span>
                    <TeamBadge team={t} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-heading text-[13px] text-text font-medium group-hover:text-accent">{t.name}</span>
                      {scenario && (
                        <span
                          className="text-[8px] font-heading tracking-wider uppercase font-bold"
                          style={{ color: scenario.color }}
                        >
                          {scenario.shortLabel}
                        </span>
                      )}
                    </div>
                  </TeamLink>
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
      {true && rows.length > 0 && (
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
