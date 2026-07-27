import { useEffect, useState } from "react";
import { errorMessage, fmtPct, fmtRatio, isAbort, sortValue, teamStats, type TeamStats } from "../../lib/api";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
}

export function TeamStatsTable({ conf }: Props) {
  const [teams, setTeams] = useState<TeamStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    teamStats(conf, { signal: ac.signal })
      .then(data => setTeams([...data].sort((a, b) => sortValue(b.winrate) - sortValue(a.winrate))))
      .catch(e => { if (!isAbort(e)) setErr(errorMessage(e)); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [conf]);

  if (loading) return <div className="text-center py-10 text-text-subtle">Loading teams...</div>;
  if (err) return <div className="text-center py-10 text-ccs-red">{err}</div>;
  if (!teams.length) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse bg-bg2 rounded-md overflow-hidden">
        <thead>
          <tr className="bg-bg3 text-[10px] text-text-secondary uppercase tracking-wider">
            <th className="text-left py-3 px-4">#</th>
            <th className="text-left py-3 px-4">Team</th>
            <th className="text-center py-3 px-3">Games</th>
            <th className="text-center py-3 px-3">W</th>
            <th className="text-center py-3 px-3">L</th>
            <th className="text-center py-3 px-3">Win%</th>
            <th className="text-center py-3 px-3">Avg Time</th>
            <th className="text-center py-3 px-3">KD Ratio</th>
            <th className="text-center py-3 px-3">First Blood %</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.id} className="border-t border-border hover:bg-bg3 transition-colors">
              <td className="py-3 px-4 text-text-dim font-mono text-sm">{i + 1}</td>
              <td className="py-3 px-4">
                <TeamLink conf={conf} code={t.code} className="flex items-center gap-3 no-underline group">
                  {t.logo ? (
                    <img src={t.logo} alt={t.name} className="w-8 h-8 rounded object-contain" style={{ background: t.colorHex }} />
                  ) : (
                    <div className="w-8 h-8 rounded flex items-center justify-center text-white font-bold text-sm" style={{ background: t.colorHex }}>
                      {t.code.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="font-heading text-sm text-text-bright group-hover:text-accent">{t.name}</div>
                    <div className="text-[10px] text-text-dim font-mono">{t.code}</div>
                  </div>
                </TeamLink>
              </td>
              <td className="text-center py-3 px-3 text-sm">{t.games}</td>
              <td className="text-center py-3 px-3 text-sm text-ccs-green">{t.wins}</td>
              <td className="text-center py-3 px-3 text-sm text-ccs-red">{t.losses}</td>
              <td className="text-center py-3 px-3 text-sm font-bold text-text-bright">{fmtPct(t.winrate)}</td>
              <td className="text-center py-3 px-3 text-sm font-mono">{t.avgTime || "—"}</td>
              <td className="text-center py-3 px-3 text-sm">{t.killDeathRatio === null ? "—" : fmtRatio(t.killDeathRatio)}</td>
              <td className="text-center py-3 px-3 text-sm">{fmtPct(t.firstBloodPercent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
