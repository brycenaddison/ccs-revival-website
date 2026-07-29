/**
 * The Champions tab — draft summary, pick/ban highlights, and the full stat surface.
 *
 * The old dashboard's champion page could show games, win rate, KDA, K/D/A, pick rate and a ban count.
 * `championstats` carries all of that plus presence, average ban turn, the per-minute suite, lane
 * diffs at 8 and 14, and a best-player-on-this-champion join — so the table is group-switched rather
 * than fixed, with four anchor columns always visible so switching groups never loses your place.
 *
 * One load (`championStats`, keyed by role so toggling back to a seen role is free). The summary tiles
 * are reductions over the rows already in hand, not extra requests.
 */

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtPct,
  fmtRatio,
  ROLE_ORDER,
  roleLabel,
  sortValue,
  type ChampionStats,
  type Role,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { cellText, CHAMPION_STAT_GROUPS, type StatCell } from "../../lib/statGroups";
import { int, pct } from "../../lib/statFormat";
import { StatGroupSwitcher } from "./StatGroupSwitcher";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
  isMobile: boolean;
  toggle?: React.ReactNode;
}

const ROLE_FILTERS: (Role | "ALL")[] = ["ALL", ...ROLE_ORDER];

/**
 * Minimum picks before a champion can hold a "best" tile.
 *
 * A 1-game champion at 100% win rate and infinite KDA would own both tiles every season and tell you
 * nothing. Three is the same floor the old dashboard used.
 */
const MIN_GAMES_FOR_BEST = 3;

/** Always-visible columns, so the table stays legible across group switches. */
const ANCHOR_CELLS: readonly StatCell<ChampionStats>[] = [
  { key: "games", label: "Picks", value: c => c.games, format: int },
  { key: "bans", label: "Bans", value: c => c.bans, format: int },
  { key: "presence", label: "Presence", value: c => c.presence, format: pct },
  { key: "winPercent", label: "Win%", value: c => c.winPercent, format: pct },
];

function Tile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="bg-bg3 border border-border rounded-lg px-3 py-3.5 text-center min-w-0">
      <div className="font-display text-[26px] leading-none truncate" style={{ color }}>{value}</div>
      <div className="text-[9px] text-text-muted font-heading tracking-wider uppercase mt-1.5 truncate" title={label}>
        {label}
      </div>
    </div>
  );
}

/** A pick or ban highlight chip. */
function ChampChip({ img, name, sub, dim }: { img: string; name: string; sub: React.ReactNode; dim?: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-bg2 border border-border rounded-md px-2.5 py-2 min-w-[132px] flex-1">
      {img && (
        <img
          src={img}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-8 h-8 rounded shrink-0"
          style={dim ? { filter: "grayscale(45%)" } : undefined}
        />
      )}
      <div className="min-w-0">
        <div className="text-[12px] font-heading font-bold text-text-bright truncate">{name}</div>
        <div className="text-[10px] text-text-muted truncate">{sub}</div>
      </div>
    </div>
  );
}

export function ChampionPanel({ conf, isMobile, toggle }: Props) {
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [groupId, setGroupId] = useState(CHAMPION_STAT_GROUPS[0].id);
  const [sortKey, setSortKey] = useState("presence");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isPending, error } = useQuery(queries.championStats(conf, role === "ALL" ? null : role));
  const champs = data ?? [];

  const group = CHAMPION_STAT_GROUPS.find(g => g.id === groupId) ?? CHAMPION_STAT_GROUPS[0];

  // Anchors first, then whatever the group adds that isn't already an anchor.
  const columns = useMemo<StatCell<ChampionStats>[]>(() => {
    const anchorKeys = new Set(ANCHOR_CELLS.map(c => c.key));
    return [...ANCHOR_CELLS, ...group.cells.filter(c => !anchorKeys.has(c.key))];
  }, [group]);

  const summary = useMemo(() => {
    // `championstats` comes from a FULL JOIN, so ban-only champions appear with zero games. Both
    // counts have to filter, or "unique picks" silently includes champions nobody played.
    const picked = champs.filter(c => c.games > 0);
    const eligible = picked.filter(c => c.games >= MIN_GAMES_FOR_BEST);
    const best = <K extends keyof ChampionStats>(key: K) =>
      eligible.length === 0
        ? null
        : eligible.reduce((a, b) => (sortValue(b[key]) > sortValue(a[key]) ? b : a));
    return {
      picks: picked.length,
      banned: champs.filter(c => c.bans > 0).length,
      bestWr: best("winPercent"),
      bestKda: best("kda"),
    };
  }, [champs]);

  const topPicked = useMemo(
    () => [...champs].filter(c => c.games > 0).sort((a, b) => b.games - a.games).slice(0, 8),
    [champs],
  );
  const topBanned = useMemo(
    () => [...champs].filter(c => c.bans > 0).sort((a, b) => b.bans - a.bans).slice(0, 8),
    [champs],
  );

  // `sortDir` is -1 for descending, 1 for ascending. `sortValue` maps null and Infinity to
  // -Infinity, which is what keeps missing data at the bottom of a descending sort.
  const sorted = useMemo(() => {
    if (sortKey === "name") {
      return [...champs].sort((a, b) => a.name.localeCompare(b.name) * sortDir);
    }
    const cell = columns.find(c => c.key === sortKey);
    if (!cell) return champs;
    return [...champs].sort((a, b) => {
      const descending = sortValue(cell.value?.(b) ?? null) - sortValue(cell.value?.(a) ?? null);
      return sortDir === -1 ? descending : -descending;
    });
  }, [champs, columns, sortKey, sortDir]);

  const onSort = (key: string) => {
    if (key === sortKey) { setSortDir(d => (d === -1 ? 1 : -1)); return; }
    setSortKey(key);
    // Names read best A→Z on first click; every statistic reads best highest-first.
    setSortDir(key === "name" ? 1 : -1);
  };

  if (isPending) return <div className="text-center py-10 text-text-subtle">Loading champions...</div>;
  if (error) return <div className="text-center py-10 text-ccs-red">{errorMessage(error)}</div>;
  if (champs.length === 0) return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;

  return (
    <div>
      {/* Role filter */}
      <div className="flex gap-1 flex-wrap mb-4">
        {ROLE_FILTERS.map(r => (
          <button
            key={r}
            onClick={() => { setRole(r); setExpanded(null); }}
            className={`py-1.5 px-3 text-[11px] font-heading uppercase tracking-wider rounded border ${
              role === r ? "bg-accent text-white border-accent" : "bg-bg2 text-text-secondary border-border"
            }`}
          >
            {roleLabel(r)}
          </button>
        ))}
      </div>

      {/* Summary tiles */}
      <div className={`grid gap-3 mb-5 ${isMobile ? "grid-cols-2" : "grid-cols-4"}`}>
        <Tile value={String(summary.picks)} label="Unique Picks" color="var(--accent)" />
        <Tile
          value={summary.bestWr ? fmtPct(summary.bestWr.winPercent) : "—"}
          label={summary.bestWr ? `Best Win% · ${summary.bestWr.name}` : "Best Win%"}
          color="var(--green)"
        />
        <Tile
          value={summary.bestKda ? fmtRatio(summary.bestKda.kda) : "—"}
          label={summary.bestKda ? `Best KDA · ${summary.bestKda.name}` : "Best KDA"}
          color="var(--gold)"
        />
        <Tile
          value={summary.banned > 0 ? String(summary.banned) : "—"}
          label={summary.banned > 0 ? "Champions Banned" : "No Ban Data"}
          color="var(--red)"
        />
      </div>

      {/* Pick / ban highlights */}
      <div className={`grid gap-3 mb-6 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
        <div className="bg-bg3 border border-border rounded-lg p-3.5">
          <div className="font-heading text-[11px] font-semibold tracking-wider uppercase text-accent mb-2.5">
            Most Picked
          </div>
          <div className="flex flex-wrap gap-2">
            {topPicked.map(c => (
              <ChampChip
                key={c.champid}
                img={c.img}
                name={c.name}
                sub={<>
                  {c.games}g · <span style={{ color: (c.winPercent ?? 0) >= 0.5 ? "var(--green)" : "var(--red)" }}>{fmtPct(c.winPercent)}</span> · {fmtRatio(c.kda)} KDA
                </>}
              />
            ))}
          </div>
        </div>

        <div className="bg-bg3 border border-border rounded-lg p-3.5">
          <div className="font-heading text-[11px] font-semibold tracking-wider uppercase text-ccs-red mb-2.5">
            Most Banned
          </div>
          {topBanned.length === 0 ? (
            <div className="text-[12px] text-text-dim py-6 text-center">No ban data for this season.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topBanned.map(c => (
                <ChampChip
                  key={c.champid}
                  img={c.img}
                  name={c.name}
                  dim
                  sub={<>
                    {c.bans}× · {fmtPct(c.banRate)}
                    {c.games > 0 && <span className="text-accent"> · {c.games}g picked</span>}
                  </>}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grouped table */}
      <StatGroupSwitcher groups={CHAMPION_STAT_GROUPS} activeId={groupId} onChange={setGroupId}>
        {toggle}
      </StatGroupSwitcher>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-bg2 rounded-md overflow-hidden text-sm">
          <thead>
            <tr className="bg-bg3 text-[10px] text-text-secondary uppercase tracking-wider">
              <th
                onClick={() => onSort("name")}
                className={`text-left py-2.5 px-3 cursor-pointer select-none ${sortKey === "name" ? "text-accent font-bold" : ""}`}
              >
                Champion{sortKey === "name" ? (sortDir === -1 ? " ▼" : " ▲") : ""}
              </th>
              {columns.map(c => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  title={c.label}
                  className={`text-center py-2.5 px-2 cursor-pointer select-none whitespace-nowrap ${sortKey === c.key ? "text-accent font-bold" : ""}`}
                >
                  {c.label}{sortKey === c.key ? (sortDir === -1 ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => {
              const open = expanded === c.champid;
              return (
                // A row and its detail row are siblings, so the key belongs on the Fragment that
                // wraps them — the shorthand `<>` cannot carry one.
                <Fragment key={c.champid}>
                  <tr
                    onClick={() => setExpanded(open ? null : c.champid)}
                    className="border-t border-border hover:bg-bg3 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {c.img && <img src={c.img} alt="" loading="lazy" className="w-7 h-7 rounded shrink-0" />}
                        <span className="font-heading font-bold text-text-bright">{c.name}</span>
                        <span className="text-text-dim text-[9px]">{open ? "▲" : "▼"}</span>
                      </div>
                    </td>
                    {columns.map(cell => (
                      <td key={cell.key} className="text-center py-2.5 px-2 font-mono text-xs">
                        {cellText(cell, c)}
                      </td>
                    ))}
                  </tr>

                  {open && (
                    <tr className="border-t border-bg3 bg-bg3/40">
                      <td colSpan={columns.length + 1} className="px-3 py-3.5">
                        {c.bestPlayerName && (
                          <div className="mb-3 text-[11px]">
                            <span className="font-heading tracking-wider uppercase text-[10px] text-text-muted mr-2">
                              Best on champion
                            </span>
                            <TeamLink conf={conf} code={c.bestPlayerTeam} className="inline-flex items-center gap-1.5 no-underline group align-middle">
                              {c.bestPlayerLogo && <img src={c.bestPlayerLogo} alt="" loading="lazy" decoding="async" className="w-4 h-4 rounded object-contain" />}
                              <span className="text-text-bright group-hover:text-accent font-bold">{c.bestPlayerName}</span>
                              <span className="text-text-dim">
                                {c.bestPlayerGames ?? 0}g · {c.bestPlayerKda === null ? "—" : fmtRatio(c.bestPlayerKda)} KDA · {fmtPct(c.bestPlayerWinrate)}
                              </span>
                            </TeamLink>
                          </div>
                        )}

                        <div className="grid gap-3" style={{ gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(190px, 1fr))" }}>
                          {CHAMPION_STAT_GROUPS.map(g => (
                            <div key={g.id}>
                              <div className="font-heading text-[10px] font-semibold tracking-wider uppercase text-accent mb-1">
                                {g.label}
                              </div>
                              {g.cells.map(cell => (
                                <div key={cell.key} className="flex justify-between items-baseline gap-2 py-0.5 border-b border-bg3 last:border-b-0">
                                  <span className="text-[10px] text-text-secondary truncate">{cell.label}</span>
                                  <span className="font-mono text-[11px] text-text shrink-0">{cellText(cell, c)}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-text-dim">
        {sorted.length} champions{role !== "ALL" && ` · ${roleLabel(role)} only`} · click a row for the full stat line
      </div>
    </div>
  );
}
