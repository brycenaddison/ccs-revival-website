import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, fmtPct, fmtRatio, sortValue } from "../../lib/api";
import { queries } from "../../lib/queries";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
}

export function TeamStatsTable({ conf }: Props) {
  const { data, isPending, error } = useQuery(queries.teamStats(conf));

  // Sorted here rather than in the query function, so the cache holds the API's own response.
  const teams = useMemo(
    () => [...(data ?? [])].sort((a, b) => sortValue(b.winrate) - sortValue(a.winrate)),
    [data],
  );

  if (isPending) return <div className="text-center py-10 text-text-subtle">Loading teams...</div>;
  if (error) return <div className="text-center py-10 text-ccs-red">{errorMessage(error)}</div>;
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
                    <img src={t.logo} alt={t.name} loading="lazy" decoding="async" className="w-8 h-8 rounded object-contain" style={{ background: t.colorHex }} />
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
