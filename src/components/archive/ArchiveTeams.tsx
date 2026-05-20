import { useEffect, useState } from "react";
import { archiveApi, hexFromInt, type ArchiveTeamStats } from "../../lib/archiveApi";

interface Props {
  conf: string;
  onSelectTeam: (code: string) => void;
}

export function ArchiveTeams({ conf, onSelectTeam }: Props) {
  const [teams, setTeams] = useState<ArchiveTeamStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    archiveApi.teamStats(conf)
      .then(data => setTeams([...data].sort((a, b) => parseFloat(b.winrate) - parseFloat(a.winrate))))
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [conf]);

  if (loading) return <div className="text-center py-10 text-text-subtle">Loading teams...</div>;
  if (err) return <div className="text-center py-10 text-ccs-red">{err}</div>;
  if (!teams.length) return <div className="text-center py-10 text-text-dim">No teams found for this tournament.</div>;

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
            <tr
              key={t.id}
              onClick={() => onSelectTeam(t.code)}
              className="border-t border-border hover:bg-bg3 cursor-pointer transition-colors"
            >
              <td className="py-3 px-4 text-text-dim font-mono text-sm">{i + 1}</td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {t.logo ? (
                    <img src={t.logo} alt={t.name} className="w-8 h-8 rounded object-contain" style={{ background: hexFromInt(t.color) }} />
                  ) : (
                    <div className="w-8 h-8 rounded flex items-center justify-center text-white font-bold text-sm" style={{ background: hexFromInt(t.color) }}>
                      {t.code.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="font-heading text-sm text-text-bright">{t.name}</div>
                    <div className="text-[10px] text-text-dim font-mono">{t.code}</div>
                  </div>
                </div>
              </td>
              <td className="text-center py-3 px-3 text-sm">{t.games}</td>
              <td className="text-center py-3 px-3 text-sm text-ccs-green">{t.wins}</td>
              <td className="text-center py-3 px-3 text-sm text-ccs-red">{t.losses}</td>
              <td className="text-center py-3 px-3 text-sm font-bold text-text-bright">{(parseFloat(t.winrate) * 100).toFixed(0)}%</td>
              <td className="text-center py-3 px-3 text-sm font-mono">{t.avgTime}</td>
              <td className="text-center py-3 px-3 text-sm">{t.killDeathRatio}</td>
              <td className="text-center py-3 px-3 text-sm">{(parseFloat(t.firstBloodPercent) * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
