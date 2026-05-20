import { useEffect, useState, useMemo } from "react";
import { archiveApi, type ArchiveChampionStats } from "../../lib/archiveApi";

interface Props {
  conf: string;
}

const ROLES = ["ALL", "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

type SortKey = "presence" | "games" | "bans" | "winPercent" | "kda" | "pickRate" | "banRate";

export function ArchiveChampions({ conf }: Props) {
  const [champs, setChamps] = useState<ArchiveChampionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [role, setRole] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("presence");

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const fetcher = role === "ALL" ? archiveApi.championStats(conf) : archiveApi.championStatsByRole(conf, role);
    fetcher
      .then(setChamps)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [conf, role]);

  const sorted = useMemo(() => {
    return [...champs].sort((a, b) => {
      const aRaw = a[sortKey];
      const bRaw = b[sortKey];
      const av = typeof aRaw === "number" ? aRaw : parseFloat(String(aRaw ?? "0"));
      const bv = typeof bRaw === "number" ? bRaw : parseFloat(String(bRaw ?? "0"));
      const aFinite = isFinite(av) ? av : -1;
      const bFinite = isFinite(bv) ? bv : -1;
      return bFinite - aFinite;
    });
  }, [champs, sortKey]);

  if (loading) return <div className="text-center py-10 text-text-subtle">Loading champions...</div>;
  if (err) return <div className="text-center py-10 text-ccs-red">{err}</div>;
  if (sorted.length === 0) return <div className="text-center py-10 text-text-dim">No champion data yet for this tournament.</div>;

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex gap-1">
          {ROLES.map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`py-1.5 px-3 text-[11px] font-heading uppercase tracking-wider rounded border ${role === r ? "bg-accent text-white border-accent" : "bg-bg2 text-text-secondary border-border"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="bg-bg2 border border-border rounded px-3 py-1.5 text-sm text-text font-body focus:outline-none focus:border-accent ml-auto"
        >
          <option value="presence">Sort: Presence</option>
          <option value="games">Sort: Games Played</option>
          <option value="bans">Sort: Bans</option>
          <option value="pickRate">Sort: Pick Rate</option>
          <option value="banRate">Sort: Ban Rate</option>
          <option value="winPercent">Sort: Win Rate</option>
          <option value="kda">Sort: KDA</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-bg2 rounded-md overflow-hidden text-sm">
          <thead>
            <tr className="bg-bg3 text-[10px] text-text-secondary uppercase tracking-wider">
              <th className="text-left py-2.5 px-3">Champion</th>
              <th className="text-center py-2.5 px-2">Games</th>
              <th className="text-center py-2.5 px-2">Bans</th>
              <th className="text-center py-2.5 px-2">Pick %</th>
              <th className="text-center py-2.5 px-2">Ban %</th>
              <th className="text-center py-2.5 px-2">Presence</th>
              <th className="text-center py-2.5 px-2">Win %</th>
              <th className="text-center py-2.5 px-2">KDA</th>
              <th className="text-center py-2.5 px-2">K/D/A</th>
              <th className="text-left py-2.5 px-3">Best Player</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.champid} className="border-t border-border hover:bg-bg3">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    {c.img && <img src={c.img} alt={c.name} className="w-7 h-7 rounded" />}
                    <span className="font-heading font-bold text-text-bright">{c.name}</span>
                  </div>
                </td>
                <td className="text-center py-2.5 px-2 font-mono">{c.games}</td>
                <td className="text-center py-2.5 px-2 font-mono">{c.bans}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{(parseFloat(c.pickRate) * 100).toFixed(0)}%</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{(parseFloat(c.banRate) * 100).toFixed(0)}%</td>
                <td className="text-center py-2.5 px-2 font-mono font-bold">{(parseFloat(c.presence) * 100).toFixed(0)}%</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{(parseFloat(c.winPercent) * 100).toFixed(0)}%</td>
                <td className="text-center py-2.5 px-2 font-bold">{c.kda}</td>
                <td className="text-center py-2.5 px-2 text-xs font-mono">{c.avgKills}/{c.avgDeaths}/{c.avgAssists}</td>
                <td className="py-2.5 px-3 text-xs">
                  {c.bestPlayerName ? (
                    <div className="flex items-center gap-2">
                      {c.bestPlayerLogo && <img src={c.bestPlayerLogo} alt="" className="w-5 h-5 rounded" />}
                      <span className="text-text-bright">{c.bestPlayerName}</span>
                      <span className="text-text-dim">({c.bestPlayerKda} KDA · {c.bestPlayerGames}g)</span>
                    </div>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-text-dim">{sorted.length} champions</div>
    </div>
  );
}
