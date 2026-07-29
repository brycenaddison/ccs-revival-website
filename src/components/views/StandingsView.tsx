import { useState } from "react";
import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { getPlayoffScenario } from "../../lib/playoffScenarios";
import type { Standing, Team } from "../../hooks/useLeagueData";

interface Props {
  /** Ranked, from `useStandings`. Rendered in the order given — see the note below. */
  standings: Standing[];
  isMobile: boolean;
}

/** Game record as text, or "—" for a team with no games. */
function games(s: Standing): string {
  if (s.gameWins === undefined || s.gameLosses === undefined) return "—";
  return s.gameWins + s.gameLosses === 0 ? "—" : `${s.gameWins}-${s.gameLosses}`;
}

export function StandingsView({ standings, isMobile }: Props) {
  const divs = [...new Set(standings.map(s => s.teams?.divisions?.name).filter(Boolean))] as string[];
  const [div, setDiv] = useState(divs[0] || "All");

  // Order and positions both come from the API, which resolves series record, then game win
  // percentage, then head-to-head among the teams still level. Nothing is re-sorted here:
  // head-to-head can't be recomputed from anything this page loads, and teams level on all three
  // legitimately *share* a rank — renumbering rows by index would invent an order the league
  // doesn't recognise. `place` carries the tie marker ("T-2").
  const rows = div === "All" ? standings : standings.filter(s => s.teams?.divisions?.name === div);

  // Ranks are per conf, so with several active at once a team's own group position is its rank
  // within its division rather than its position in the merged list.
  const rankOf = (s: Standing, i: number) => s.rank ?? i + 1;

  if (!standings.length) return <div className="py-10 text-center text-text-dim text-[13px]">Standings aren't available yet.</div>;

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
              {["#", "TEAM", "W", "L", "WIN%", "GAMES", "STREAK"].map(h => (
                <th
                  key={h}
                  title={h === "GAMES" ? "Individual games won-lost. The first tiebreaker." : undefined}
                  className={`px-3.5 py-3 text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border ${
                    ["W", "L", "WIN%", "GAMES", "STREAK"].includes(h) ? "text-center" : "text-left"
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
            {rows.map((s, i) => {
              const t = s.teams || {} as Team;
              const total = s.wins + s.losses;
              const pct = total > 0 ? Math.round((s.wins / total) * 100) : 0;
              const groupPos = rankOf(s, i);
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
                  {/* `place` already marks a tie ("T-2"); the index would hide it. */}
                  <td className="px-3.5 py-3.5 font-display text-lg" style={{ color: numColor }}>{s.place ?? groupPos}</td>
                  <td className="px-3.5 py-3.5">
                    <TeamLink team={t} className="flex items-center gap-2.5 no-underline group">
                      <TeamBadge team={t} size={28} />
                      <div>
                        <span className="font-heading text-sm text-text font-medium group-hover:text-accent">{t.name}</span>
                        <span className="text-[10px] text-text-dim font-mono ml-2">{t.abbreviation}</span>
                      </div>
                    </TeamLink>
                  </td>
                  <td className="px-3.5 py-3.5 text-center font-mono text-sm text-ccs-green font-bold">{s.wins}</td>
                  <td className="px-3.5 py-3.5 text-center font-mono text-sm text-ccs-red font-bold">{s.losses}</td>
                  <td className="px-3.5 py-3.5 text-center font-mono text-[13px] text-text-secondary">{pct}%</td>
                  <td
                    className="px-3.5 py-3.5 text-center font-mono text-[13px] text-text-muted"
                    title={s.gameWinPct == null ? undefined : `${Math.round(s.gameWinPct * 100)}% of games won`}
                  >
                    {games(s)}
                  </td>
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
