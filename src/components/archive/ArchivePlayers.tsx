import { useEffect, useState, useMemo } from "react";
import { archiveApi, type ArchivePlayerStats } from "../../lib/archiveApi";

interface Props {
  conf: string;
}

const ROLES = ["ALL", "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

type SortKey = "kda" | "winPercent" | "kills" | "deaths" | "assists" | "csMin" | "damageMin" | "goldMin" | "visionScoreMin" | "killParticipation" | "games";

export function ArchivePlayers({ conf }: Props) {
  const [players, setPlayers] = useState<ArchivePlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [role, setRole] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("kda");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setErr(null);
    archiveApi.playerStats(conf)
      .then(setPlayers)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [conf]);

  const filtered = useMemo(() => {
    let rows = players;
    if (role !== "ALL") {
      const target = role.toUpperCase();
      rows = rows.filter(p => String(p.role || "").toUpperCase().trim() === target);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      const aRaw = a[sortKey];
      const bRaw = b[sortKey];
      const av = typeof aRaw === "number" ? aRaw : parseFloat(String(aRaw ?? "0"));
      const bv = typeof bRaw === "number" ? bRaw : parseFloat(String(bRaw ?? "0"));
      const aFinite = isFinite(av) ? av : -1;
      const bFinite = isFinite(bv) ? bv : -1;
      return bFinite - aFinite;
    });
  }, [players, role, sortKey, search]);

  if (loading) return <div className="text-center py-10 text-text-subtle">Loading players...</div>;
  if (err) return <div className="text-center py-10 text-ccs-red">{err}</div>;
  if (players.length === 0) return <div className="text-center py-10 text-text-dim">No player data yet for this tournament.</div>;

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
        <input
          type="text"
          placeholder="Search player or team..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-bg2 border border-border rounded px-3 py-1.5 text-sm text-text font-body w-[220px] focus:outline-none focus:border-accent"
        />
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="bg-bg2 border border-border rounded px-3 py-1.5 text-sm text-text font-body focus:outline-none focus:border-accent ml-auto"
        >
          <option value="kda">Sort: KDA</option>
          <option value="winPercent">Sort: Win %</option>
          <option value="games">Sort: Games</option>
          <option value="kills">Sort: Kills</option>
          <option value="deaths">Sort: Deaths</option>
          <option value="assists">Sort: Assists</option>
          <option value="csMin">Sort: CS/min</option>
          <option value="damageMin">Sort: DMG/min</option>
          <option value="goldMin">Sort: Gold/min</option>
          <option value="visionScoreMin">Sort: Vision/min</option>
          <option value="killParticipation">Sort: Kill Participation</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-bg2 rounded-md overflow-hidden text-sm">
          <thead>
            <tr className="bg-bg3 text-[10px] text-text-secondary uppercase tracking-wider">
              <th className="text-left py-2.5 px-3">#</th>
              <th className="text-left py-2.5 px-3">Player</th>
              <th className="text-left py-2.5 px-3">Team</th>
              <th className="text-center py-2.5 px-2">Role</th>
              <th className="text-center py-2.5 px-2">GP</th>
              <th className="text-center py-2.5 px-2">W-L</th>
              <th className="text-center py-2.5 px-2">Win%</th>
              <th className="text-center py-2.5 px-2">KDA</th>
              <th className="text-center py-2.5 px-2">K/D/A</th>
              <th className="text-center py-2.5 px-2">CS/M</th>
              <th className="text-center py-2.5 px-2">DMG/M</th>
              <th className="text-center py-2.5 px-2">G/M</th>
              <th className="text-center py-2.5 px-2">Vis/M</th>
              <th className="text-center py-2.5 px-2">KP%</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={`${p.id}-${p.role}-${p.team}-${i}`} className="border-t border-border hover:bg-bg3">
                <td className="py-2.5 px-3 text-text-dim font-mono text-xs">{i + 1}</td>
                <td className="py-2.5 px-3 font-heading font-bold text-text-bright">{p.name}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    {p.logo && <img src={p.logo} alt="" className="w-5 h-5 rounded object-contain" />}
                    <span className="text-xs text-text-secondary">{p.team}</span>
                  </div>
                </td>
                <td className="text-center py-2.5 px-2 text-[10px] text-text-muted">{p.role}</td>
                <td className="text-center py-2.5 px-2">{p.games}</td>
                <td className="text-center py-2.5 px-2 text-xs"><span className="text-ccs-green">{p.wins}</span>-<span className="text-ccs-red">{p.losses}</span></td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{(parseFloat(p.winPercent) * 100).toFixed(0)}%</td>
                <td className="text-center py-2.5 px-2 font-bold">{p.kda}</td>
                <td className="text-center py-2.5 px-2 text-xs font-mono">{p.avgKills}/{p.avgDeaths}/{p.avgAssists}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{p.csMin}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{Math.round(parseFloat(p.damageMin))}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{Math.round(parseFloat(p.goldMin))}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{p.visionScoreMin}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{(parseFloat(p.killParticipation) * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-text-dim">{filtered.length} players</div>
    </div>
  );
}
