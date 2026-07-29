import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtPct,
  fmtRatio,
  ROLE_ORDER,
  roleLabel,
  sortValue,
  type PlayerStats,
  type Role,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
}

const ROLE_FILTERS: (Role | "ALL")[] = ["ALL", ...ROLE_ORDER];

type SortKey = keyof Pick<
  PlayerStats,
  | "kda"
  | "winPercent"
  | "kills"
  | "deaths"
  | "assists"
  | "csMin"
  | "damageMin"
  | "goldMin"
  | "visionScoreMin"
  | "killParticipation"
  | "games"
>;

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "kda", label: "KDA" },
  { key: "winPercent", label: "Win %" },
  { key: "games", label: "Games" },
  { key: "kills", label: "Kills" },
  { key: "deaths", label: "Deaths" },
  { key: "assists", label: "Assists" },
  { key: "csMin", label: "CS/min" },
  { key: "damageMin", label: "DMG/min" },
  { key: "goldMin", label: "Gold/min" },
  { key: "visionScoreMin", label: "Vision/min" },
  { key: "killParticipation", label: "Kill Participation" },
];

export function PlayerStatsTable({ conf }: Props) {
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("kda");
  const [search, setSearch] = useState("");

  // Same key the home page's leaderboards use, so whichever loads second reads the first's copy.
  const { data, isPending, error } = useQuery(queries.playerStats(conf));
  const players = data ?? [];

  const filtered = useMemo(() => {
    let rows = players;
    if (role !== "ALL") rows = rows.filter(p => p.role === role);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => sortValue(b[sortKey]) - sortValue(a[sortKey]));
  }, [players, role, sortKey, search]);

  if (isPending) return <div className="text-center py-10 text-text-subtle">Loading players...</div>;
  if (error) return <div className="text-center py-10 text-ccs-red">{errorMessage(error)}</div>;
  if (players.length === 0) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

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
              {roleLabel(r)}
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
          {SORT_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>Sort: {o.label}</option>
          ))}
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
              <tr key={p.rowKey} className="border-t border-border hover:bg-bg3">
                <td className="py-2.5 px-3 text-text-dim font-mono text-xs">{i + 1}</td>
                <td className="py-2.5 px-3 font-heading font-bold text-text-bright">{p.name}</td>
                <td className="py-2.5 px-3">
                  <TeamLink conf={p.conf} code={p.team} className="flex items-center gap-2 no-underline group">
                    {p.logo && <img src={p.logo} alt="" loading="lazy" decoding="async" className="w-5 h-5 rounded object-contain" />}
                    <span className="text-xs text-text-secondary group-hover:text-accent">{p.team}</span>
                  </TeamLink>
                </td>
                <td className="text-center py-2.5 px-2 text-[10px] text-text-muted">{roleLabel(p.role)}</td>
                <td className="text-center py-2.5 px-2">{p.games}</td>
                <td className="text-center py-2.5 px-2 text-xs"><span className="text-ccs-green">{p.wins}</span>-<span className="text-ccs-red">{p.losses}</span></td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{fmtPct(p.winPercent)}</td>
                <td className="text-center py-2.5 px-2 font-bold">{fmtRatio(p.kda)}</td>
                <td className="text-center py-2.5 px-2 text-xs font-mono">{fmtRatio(p.avgKills ?? 0, 1)}/{fmtRatio(p.avgDeaths ?? 0, 1)}/{fmtRatio(p.avgAssists ?? 0, 1)}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{p.csMin === null ? "—" : fmtRatio(p.csMin)}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{p.damageMin === null ? "—" : Math.round(p.damageMin)}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{p.goldMin === null ? "—" : Math.round(p.goldMin)}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{p.visionScoreMin === null ? "—" : fmtRatio(p.visionScoreMin)}</td>
                <td className="text-center py-2.5 px-2 font-mono text-xs">{fmtPct(p.killParticipation)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-text-dim">{filtered.length} rows · players are listed once per role played</div>
    </div>
  );
}
