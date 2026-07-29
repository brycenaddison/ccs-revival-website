/**
 * The old dashboard's leaderboard, rebuilt on `/stats/players/:conf`.
 *
 * The filter set is deliberately the same one it had — stat, direction, minimum games, roles, team,
 * search — because that combination is what made it a tool rather than a table: "best CS/min among
 * junglers with 5+ games" is one selection, not a sort you scroll through.
 *
 * The stat catalogue is much longer than the old one's, since `playerstats` carries the lane diffs
 * and share-of-team columns the Supabase schema never had.
 *
 * One load. The percentile radar is computed here rather than served because it ranks each player
 * against *the current filter selection* — it is a function of UI state, so no endpoint could
 * precompute it.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtRatio,
  ROLE_ORDER,
  roleLabel,
  type PlayerStats,
  type Role,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { radarPoints, shortName } from "../../lib/statViews";
import { col, dec, int, pct, signed, signedDec } from "../../lib/statFormat";
import { CompareRadar, type RadarSeries } from "./CompareRadar";

interface Props {
  conf: string;
  isMobile: boolean;
  /** Rendered beside the filters — the page owns the Bars/Table toggle. */
  toggle?: React.ReactNode;
}

/** A leaderboard-able column of `PlayerStats`, with how to read and show it. */
interface StatDef {
  key: string;
  label: string;
  group: string;
  value: (p: PlayerStats) => number | null;
  format: (v: number) => string;
}

/** Bound to `PlayerStats` once, so the catalogue below reads as plain column names. */
const pc = col<PlayerStats>;

const STATS: readonly StatDef[] = [
  // Core
  { key: "kda", label: "KDA", group: "Core", value: p => p.kda, format: v => fmtRatio(v) },
  { key: "winPercent", label: "Win Rate", group: "Core", value: pc("winPercent"), format: pct },
  { key: "games", label: "Games Played", group: "Core", value: pc("games"), format: int },
  { key: "avgKills", label: "Kills / Game", group: "Core", value: pc("avgKills"), format: dec(2) },
  { key: "avgDeaths", label: "Deaths / Game", group: "Core", value: pc("avgDeaths"), format: dec(2) },
  { key: "avgAssists", label: "Assists / Game", group: "Core", value: pc("avgAssists"), format: dec(2) },
  { key: "kills", label: "Total Kills", group: "Core", value: pc("kills"), format: int },
  { key: "deaths", label: "Total Deaths", group: "Core", value: pc("deaths"), format: int },
  { key: "assists", label: "Total Assists", group: "Core", value: pc("assists"), format: int },

  // Economy & damage
  { key: "csMin", label: "CS / min", group: "Economy", value: pc("csMin"), format: dec(2) },
  { key: "goldMin", label: "Gold / min", group: "Economy", value: pc("goldMin"), format: int },
  { key: "goldPercent", label: "Gold Share", group: "Economy", value: pc("goldPercent"), format: pct },
  { key: "xpMin", label: "XP / min", group: "Economy", value: pc("xpMin"), format: int },
  { key: "damageMin", label: "Damage / min", group: "Damage", value: pc("damageMin"), format: int },
  { key: "damagePercent", label: "Damage Share", group: "Damage", value: pc("damagePercent"), format: pct },
  { key: "damagePerGold", label: "Damage per Gold", group: "Damage", value: pc("damagePerGold"), format: dec(2) },

  // Vision
  { key: "visionScoreMin", label: "Vision Score / min", group: "Vision", value: pc("visionScoreMin"), format: dec(2) },
  { key: "visionScorePercent", label: "Vision Share", group: "Vision", value: pc("visionScorePercent"), format: pct },
  { key: "wardsMin", label: "Wards Placed / min", group: "Vision", value: pc("wardsMin"), format: dec(2) },
  { key: "controlWardsMin", label: "Control Wards / min", group: "Vision", value: pc("controlWardsMin"), format: dec(2) },
  { key: "wardsClearedMin", label: "Wards Cleared / min", group: "Vision", value: pc("wardsClearedMin"), format: dec(2) },

  // Laning — the columns the old dashboard had no equivalent for at all.
  { key: "goldDiffAt8", label: "Gold Diff @8", group: "Laning", value: pc("goldDiffAt8"), format: signed },
  { key: "csDiffAt8", label: "CS Diff @8", group: "Laning", value: pc("csDiffAt8"), format: signedDec },
  { key: "xpDiffAt8", label: "XP Diff @8", group: "Laning", value: pc("xpDiffAt8"), format: signed },
  { key: "goldDiffAt14", label: "Gold Diff @14", group: "Laning", value: pc("goldDiffAt14"), format: signed },
  { key: "csDiffAt14", label: "CS Diff @14", group: "Laning", value: pc("csDiffAt14"), format: signedDec },
  { key: "xpDiffAt14", label: "XP Diff @14", group: "Laning", value: pc("xpDiffAt14"), format: signed },

  // Teamfighting
  { key: "killParticipation", label: "Kill Participation", group: "Teamfight", value: pc("killParticipation"), format: pct },
  { key: "killPercent", label: "Share of Team Kills", group: "Teamfight", value: pc("killPercent"), format: pct },
  { key: "deathPercent", label: "Share of Team Deaths", group: "Teamfight", value: pc("deathPercent"), format: pct },
  { key: "killsAndAssistsAt15", label: "K+A @15", group: "Teamfight", value: pc("killsAndAssistsAt15"), format: dec(2) },
  { key: "killParticipationAt15", label: "KP @15", group: "Teamfight", value: pc("killParticipationAt15"), format: pct },
  { key: "killsAndAssistsAt25", label: "K+A @25", group: "Teamfight", value: pc("killsAndAssistsAt25"), format: dec(2) },
  { key: "killParticipationAt25", label: "KP @25", group: "Teamfight", value: pc("killParticipationAt25"), format: pct },
  { key: "firstBloodPercent", label: "First Blood Rate", group: "Teamfight", value: pc("firstBloodPercent"), format: pct },
  { key: "firstBloodedPercent", label: "First Blooded Rate", group: "Teamfight", value: pc("firstBloodedPercent"), format: pct },
  { key: "jungleProximity", label: "Jungle Proximity", group: "Teamfight", value: pc("jungleProximity"), format: pct },

  // Highlights
  { key: "soloKills", label: "Solo Kills", group: "Highlights", value: pc("soloKills"), format: int },
  { key: "doubleKills", label: "Double Kills", group: "Highlights", value: pc("doubleKills"), format: int },
  { key: "tripleKills", label: "Triple Kills", group: "Highlights", value: pc("tripleKills"), format: int },
  { key: "quadraKills", label: "Quadra Kills", group: "Highlights", value: pc("quadraKills"), format: int },
  { key: "pentaKills", label: "Penta Kills", group: "Highlights", value: pc("pentaKills"), format: int },
];

const STAT_GROUPS = [...new Set(STATS.map(s => s.group))];

const MIN_GAMES_OPTIONS = [1, 3, 5, 8, 10];
type View = "highest" | "lowest" | "all";

/** Distinct colours for the compare slots, so a shape maps to a card without a legend lookup. */
const COMPARE_COLORS = ["#d20708", "#d7a52a", "#4c9aff"];
const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

export function PlayerLeaderboard({ conf, isMobile, toggle }: Props) {
  const [statKey, setStatKey] = useState("kda");
  const [view, setView] = useState<View>("highest");
  const [minGames, setMinGames] = useState(5);
  const [roles, setRoles] = useState<Set<Role>>(() => new Set(ROLE_ORDER));
  const [team, setTeam] = useState("ALL");
  const [search, setSearch] = useState("");
  const [compare, setCompare] = useState<string[]>([]);

  const statsQuery = useQuery(queries.playerStats(conf));
  const teamsQuery = useQuery(queries.teamsForConf(conf));
  const players = statsQuery.data ?? [];

  // Selections that name a conf's teams or players stop meaning anything in another conf.
  useEffect(() => {
    setTeam("ALL");
    setCompare([]);
  }, [conf]);

  const branding = useMemo(
    () => new Map((teamsQuery.data ?? []).map(t => [t.code, { color: t.colorHex, logo: t.logo }])),
    [teamsQuery.data],
  );

  const stat = STATS.find(s => s.key === statKey) ?? STATS[0];

  const teamCodes = useMemo(
    () => [...new Set(players.map(p => p.team))].sort((a, b) => a.localeCompare(b)),
    [players],
  );

  /**
   * Rows passing every filter *except* the stat's own availability.
   *
   * Kept separate from the ranked list because it is also the radar's comparison pool: a percentile
   * has to be measured against the same population the leaderboard is drawn from, or the shape says
   * something different from the bars next to it.
   */
  const eligible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter(p => {
      if (p.games < minGames) return false;
      if (p.role !== null && !roles.has(p.role)) return false;
      if (p.role === null && roles.size !== ROLE_ORDER.length) return false;
      if (team !== "ALL" && p.team !== team) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, minGames, roles, team, search]);

  const ranked = useMemo(() => {
    const rows = eligible
      .flatMap(p => {
        const v = stat.value(p);
        if (v === null) return [];
        return [{ p, v }];
      })
      // Infinity (a deathless KDA) sorts to the top, which is correct; it just cannot be scaled,
      // and the bar component already substitutes the max for a non-finite value.
      .sort((a, b) => (view === "lowest" ? a.v - b.v : b.v - a.v));
    return view === "all" ? rows : rows.slice(0, 10);
  }, [eligible, stat, view]);

  const max = ranked.reduce((m, r) => (Number.isFinite(r.v) ? Math.max(m, Math.abs(r.v)) : m), 0);

  const toggleRole = (r: Role) =>
    setRoles(prev => {
      const next = new Set(prev);
      // Never let the set empty out — an empty role filter shows nothing, which reads as broken.
      if (next.has(r)) { if (next.size > 1) next.delete(r); }
      else next.add(r);
      return next;
    });

  const toggleCompare = (rowKey: string) =>
    setCompare(prev =>
      prev.includes(rowKey) ? prev.filter(k => k !== rowKey) : prev.length >= 3 ? prev : [...prev, rowKey],
    );

  const comparing = useMemo(
    () => compare.flatMap(k => {
      const p = players.find(x => x.rowKey === k);
      return p ? [p] : [];
    }),
    [compare, players],
  );

  /**
   * Radar series, each scaled against its *own* role's pool.
   *
   * Comparing a support's CS/min percentile against mid laners measures the position, not the
   * player. So each shape is ranked within its role even when the leaderboard shows several.
   */
  const series = useMemo<RadarSeries[]>(
    () => comparing.map((p, i) => ({
      key: p.rowKey,
      label: shortName(p.name),
      color: COMPARE_COLORS[i] ?? "#888",
      points: radarPoints(p, eligible.filter(x => x.role === p.role)),
    })),
    [comparing, eligible],
  );

  if (statsQuery.isPending) return <div className="text-center py-10 text-text-subtle">Loading players...</div>;
  if (statsQuery.error) return <div className="text-center py-10 text-ccs-red">{errorMessage(statsQuery.error)}</div>;
  if (players.length === 0) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  const control = "bg-bg2 border border-border rounded-md text-text text-sm font-body px-3 py-2 focus:outline-none focus:border-accent w-full";
  const label = "block text-[10px] font-heading uppercase tracking-wider text-text-secondary mb-1";

  return (
    <div>
      {/* Filters */}
      <div className={`grid gap-2.5 mb-4 ${isMobile ? "grid-cols-2" : "grid-cols-5"}`}>
        <div>
          <span className={label}>Stat</span>
          <select value={statKey} onChange={e => setStatKey(e.target.value)} className={control}>
            {STAT_GROUPS.map(g => (
              <optgroup key={g} label={g}>
                {STATS.filter(s => s.group === g).map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <span className={label}>Show</span>
          <div className="flex gap-1">
            {([["highest", "▲ Top"], ["lowest", "▼ Bottom"], ["all", "All"]] as const).map(([v, text]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 rounded-md border py-2 px-1 font-heading text-[11px] tracking-wide whitespace-nowrap ${
                  view === v ? "bg-accent border-accent text-white font-bold" : "bg-bg2 border-border text-text-secondary"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={label}>Min Games</span>
          <select value={minGames} onChange={e => setMinGames(Number(e.target.value))} className={control}>
            {MIN_GAMES_OPTIONS.map(n => <option key={n} value={n}>{n}+</option>)}
          </select>
        </div>

        <div>
          <span className={label}>Team</span>
          <select value={team} onChange={e => setTeam(e.target.value)} className={control}>
            <option value="ALL">All Teams</option>
            {teamCodes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <span className={label}>Search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Player or team..."
            className={control}
          />
        </div>

        <div className={isMobile ? "col-span-2" : "col-span-5"}>
          <span className={label}>Roles</span>
          <div className="flex gap-1 flex-wrap items-center">
            {ROLE_ORDER.map(r => (
              <button
                key={r}
                onClick={() => toggleRole(r)}
                aria-pressed={roles.has(r)}
                className={`rounded-md border py-1.5 px-3 font-heading text-[11px] tracking-wide ${
                  roles.has(r) ? "bg-accent border-accent text-white font-bold" : "bg-bg2 border-border text-text-secondary"
                }`}
              >
                {roleLabel(r)}
              </button>
            ))}
            {toggle && <div className="ml-auto flex items-center gap-2">{toggle}</div>}
          </div>
        </div>
      </div>

      {/* Bars */}
      <div className={`bg-bg2 border border-border rounded-lg mb-4 ${isMobile ? "px-3 py-4" : "px-5 py-5"}`}>
        <div className="flex justify-between items-baseline mb-1">
          <h3 className="font-display text-base text-text-bright tracking-widest m-0">
            {view === "all" ? "ALL PLAYERS" : view === "lowest" ? "BOTTOM 10" : "TOP 10"} — {stat.label.toUpperCase()}
          </h3>
          <span className="text-[10px] text-text-dim font-heading tracking-wider">
            {ranked.length} of {eligible.length} shown
          </span>
        </div>
        <p className="text-[11px] text-text-dim mb-4">Click a row to compare — up to three.</p>

        {ranked.length === 0 ? (
          <div className="py-5 text-center text-text-dim text-[13px]">
            No players match these filters, or none report {stat.label}.
          </div>
        ) : (
          <div className={view === "all" ? "max-h-[560px] overflow-y-auto pr-1" : ""}>
            {ranked.map(({ p, v }, i) => {
              const brand = branding.get(p.team);
              const color = brand?.color ?? "#555";
              const isTop3 = view !== "all" && i < 3;
              const selected = compare.includes(p.rowKey);
              // Signed stats (lane diffs) need a zero-centred scale, or a −400 draws as a long bar.
              const pctWidth = max > 0 ? (Math.abs(Number.isFinite(v) ? v : max) / max) * 100 : 0;
              const slot = compare.indexOf(p.rowKey);

              return (
                <button
                  key={p.rowKey}
                  onClick={() => toggleCompare(p.rowKey)}
                  aria-pressed={selected}
                  className={`w-full flex items-center py-1.5 text-left rounded ${i < ranked.length - 1 ? "mb-1.5" : ""} ${isMobile ? "gap-2" : "gap-3"} ${selected ? "bg-accent/10" : "hover:bg-bg3"}`}
                >
                  <span
                    className="font-display font-bold text-right min-w-[26px] shrink-0"
                    style={{
                      fontSize: isTop3 ? 18 : 13,
                      color: isTop3 ? RANK_COLORS[i] : "var(--text-muted)",
                      textShadow: isTop3 ? `0 0 8px ${RANK_COLORS[i]}44` : "none",
                    }}
                  >
                    {i + 1}
                  </span>

                  <div className={`flex items-center gap-2 shrink-0 ${isMobile ? "min-w-[104px] max-w-[104px]" : "min-w-[176px] max-w-[176px]"}`}>
                    {brand?.logo
                      ? <img src={brand.logo} alt="" loading="lazy" decoding="async" className="rounded object-contain shrink-0" style={{ width: 20, height: 20 }} />
                      : <span className="rounded shrink-0" style={{ width: 20, height: 20, background: color }} />}
                    <div className="min-w-0">
                      <div className={`font-heading truncate text-[13px] ${isTop3 ? "text-text-bright font-bold" : "text-text font-medium"}`}>
                        {shortName(p.name)}
                      </div>
                      <div className="text-[9px] text-text-muted font-heading tracking-wide truncate">
                        {p.team}{!isMobile && ` · ${roleLabel(p.role)} · ${p.games}G`}
                      </div>
                    </div>
                  </div>

                  <div className={`flex-1 bg-bg rounded overflow-hidden ${isTop3 ? "h-[24px]" : "h-[20px]"}`}>
                    <div
                      className="h-full rounded transition-[width] duration-500"
                      style={{
                        width: `${pctWidth}%`,
                        background: `linear-gradient(90deg, ${color}, ${color}88)`,
                        opacity: v < 0 ? 0.45 : isTop3 ? 1 : 0.8,
                      }}
                    />
                  </div>

                  <span className={`font-mono text-right shrink-0 ${isTop3 ? "text-text-bright font-bold text-[14px]" : "text-text-secondary text-[12px]"} ${isMobile ? "min-w-[52px]" : "min-w-[72px]"}`}>
                    {stat.format(v)}
                  </span>

                  <span className="w-2 shrink-0 rounded-full" style={{ height: 16, background: slot >= 0 ? COMPARE_COLORS[slot] : "transparent" }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Compare dock */}
      {comparing.length > 0 && (
        <div className={`bg-bg2 border border-border rounded-lg mb-4 ${isMobile ? "px-3 py-4" : "px-5 py-5"}`}>
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-display text-base text-text-bright tracking-widest m-0">PLAYER COMPARISON</h3>
            <button
              onClick={() => setCompare([])}
              className="text-[10px] font-heading tracking-wider uppercase text-ccs-red border border-ccs-red rounded px-2.5 py-1 bg-transparent"
            >
              Clear
            </button>
          </div>
          <p className="text-[11px] text-text-dim mb-4">
            Each axis is a percentile within that player&apos;s own role, among the {eligible.length} players passing the filters above.
          </p>

          <div className={`flex gap-5 ${isMobile ? "flex-col items-center" : "items-start"}`}>
            <div className="shrink-0">
              <CompareRadar series={series} size={isMobile ? 230 : 270} />
            </div>
            <div className="flex-1 grid gap-3 w-full" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(170px,1fr))" }}>
              {comparing.map((p, i) => (
                <div key={p.rowKey} className="bg-bg3 border border-border rounded-lg p-3 relative overflow-hidden">
                  <span className="absolute top-0 left-0 right-0 h-0.5" style={{ background: COMPARE_COLORS[i] }} />
                  <div className="font-heading font-bold text-sm text-text-bright truncate">{shortName(p.name)}</div>
                  <div className="text-[10px] text-text-muted font-heading tracking-wide mb-2">
                    {p.team} · {roleLabel(p.role)} · {p.games}G
                  </div>
                  {series[i]?.points.map(pt => (
                    <div key={pt.label} className="flex justify-between items-center text-[11px] py-0.5">
                      <span className="text-text-secondary">{pt.label}</span>
                      <span className="font-mono text-text">{pt.display}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
