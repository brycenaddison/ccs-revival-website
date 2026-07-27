import { useEffect, useMemo, useState } from "react";
import {
  championStats,
  errorMessage,
  fmtPct,
  fmtRatio,
  isAbort,
  ROLE_ORDER,
  sortValue,
  type ChampionStats,
  type Role,
} from "../../lib/api";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
}

const ROLE_FILTERS: (Role | "ALL")[] = ["ALL", ...ROLE_ORDER];

type SortKey = keyof Pick<
  ChampionStats,
  "presence" | "games" | "bans" | "winPercent" | "kda" | "pickRate" | "banRate"
>;

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "presence", label: "Presence" },
  { key: "games", label: "Games Played" },
  { key: "bans", label: "Bans" },
  { key: "pickRate", label: "Pick Rate" },
  { key: "banRate", label: "Ban Rate" },
  { key: "winPercent", label: "Win Rate" },
  { key: "kda", label: "KDA" },
];

export function ChampionStatsTable({ conf }: Props) {
  const [champs, setChamps] = useState<ChampionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("presence");

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    championStats(conf, role === "ALL" ? null : role, { signal: ac.signal })
      .then(setChamps)
      .catch(e => { if (!isAbort(e)) setErr(errorMessage(e)); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [conf, role]);

  const sorted = useMemo(
    () => [...champs].sort((a, b) => sortValue(b[sortKey]) - sortValue(a[sortKey])),
    [champs, sortKey],
  );

  if (loading) return <div className="text-center py-10 text-text-subtle">Loading champions...</div>;
  if (err) return <div className="text-center py-10 text-ccs-red">{err}</div>;
  if (sorted.length === 0) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex gap-1">
          {ROLE_FILTERS.map(r => (
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
          {SORT_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>Sort: {o.label}</option>
          ))}
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
              <tr key={`${c.champid}-${c.role ?? "all"}`} className="border-t border-border hover:bg-bg3">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    {c.img && <img src={c.img} alt={c.name} className="w-7 h-7 rounded" />}
                    <span className="font-heading font-bold text-text-bright">{c.name}</span>
                  </div>
                </td>
                <td className="text-center py-2.5 px-2 font-mono">{c.games}</td>
                <td className="text-center py-2.5 px-2 font-mono">{c.bans}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{fmtPct(c.pickRate)}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{fmtPct(c.banRate)}</td>
                <td className="text-center py-2.5 px-2 font-mono font-bold">{fmtPct(c.presence)}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{fmtPct(c.winPercent)}</td>
                <td className="text-center py-2.5 px-2 font-bold">{c.games === 0 ? "—" : fmtRatio(c.kda)}</td>
                <td className="text-center py-2.5 px-2 text-xs font-mono">
                  {c.games === 0
                    ? "—"
                    : `${fmtRatio(c.avgKills ?? 0, 1)}/${fmtRatio(c.avgDeaths ?? 0, 1)}/${fmtRatio(c.avgAssists ?? 0, 1)}`}
                </td>
                <td className="py-2.5 px-3 text-xs">
                  {c.bestPlayerName ? (
                    <TeamLink
                      conf={conf}
                      code={c.bestPlayerTeam}
                      title={c.bestPlayerTeam ? `${c.bestPlayerTeam} team page` : undefined}
                      className="flex items-center gap-2 no-underline group"
                    >
                      {c.bestPlayerLogo && <img src={c.bestPlayerLogo} alt="" className="w-5 h-5 rounded object-contain" />}
                      <span className="text-text-bright group-hover:text-accent">{c.bestPlayerName}</span>
                      <span className="text-text-dim">
                        ({c.bestPlayerKda === null ? "—" : fmtRatio(c.bestPlayerKda)} KDA · {c.bestPlayerGames ?? 0}g)
                      </span>
                    </TeamLink>
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
