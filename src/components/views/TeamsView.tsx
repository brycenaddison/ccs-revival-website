import { teamInitial } from "../../lib/utils";
import type { Team, Standing, Roster } from "../../hooks/useLeagueData";

interface Props {
  teams: Team[];
  standings: Standing[];
  rosters: Roster[];
  isMobile: boolean;
}

export function TeamsView({ teams, standings, rosters, isMobile }: Props) {
  const standingsMap: Record<string, Standing> = {};
  standings.forEach(s => { if (s.teams?.id) standingsMap[s.teams.id] = s; });

  return (
    <div className="max-w-[1000px] mx-auto">
      <h2 className="font-display text-[22px] text-text-bright tracking-widest mb-4">TEAMS</h2>
      <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
        {teams.map(t => {
          const record = standingsMap[t.id];
          const teamRoster = rosters.filter(r => r.teams?.id === t.id);
          return (
            <div key={t.id} className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-3.5 px-4 py-5"
                style={{ background: `linear-gradient(135deg, ${t.color_primary || "#333"}, ${t.color_accent || "#555"})` }}
              >
                {t.logo_url ? (
                  <img src={t.logo_url} alt={t.name} className="w-12 h-12 rounded-lg object-contain bg-black/20" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-xl text-white font-bold font-heading">
                    {teamInitial(t.name)}
                  </div>
                )}
                <div>
                  <div className="font-display text-xl text-white tracking-wider">{t.name}</div>
                  <div className="flex gap-2 items-center mt-0.5">
                    <span className="text-[11px] text-white/70 font-mono">{t.abbreviation}</span>
                    {t.divisions?.name && <span className="text-[10px] text-white/50">&middot; {t.divisions.name}</span>}
                    {record && <span className="text-[11px] text-white/90 font-mono font-bold">({record.wins}W-{record.losses}L)</span>}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3">
                {teamRoster.length === 0 ? (
                  <div className="py-2 text-xs text-text-dim">No roster set</div>
                ) : (
                  <table className="w-full border-collapse">
                    <tbody>
                      {teamRoster.map((r, i) => (
                        <tr key={r.id} className={i < teamRoster.length - 1 ? "border-b border-border" : ""}>
                          <td className="py-2 font-heading text-[13px] text-text font-medium">
                            {r.players?.display_name || "Unknown"}
                            {r.is_captain && <span className="text-[9px] text-ccs-orange ml-1.5 font-bold tracking-wide">C</span>}
                          </td>
                          <td className="py-2 text-[11px] text-text-muted text-right font-heading uppercase tracking-wide">{r.role || "\u2014"}</td>
                          <td className="py-2 pl-3 text-[10px] text-right">
                            {r.is_starter ? <span className="text-ccs-green">Starter</span> : <span className="text-ccs-red">Sub</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
