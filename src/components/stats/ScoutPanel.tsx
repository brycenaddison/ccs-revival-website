/**
 * The Scouting tab — one player's season, on `/stats/scout/:conf/:profileId`.
 *
 * The other stats surfaces answer "who leads this?". This one answers "what is this player actually like
 * to play against?", which needs their games in order, their champion pool with results, and who stood in
 * the opposite lane — three per-game joins that belong in the database, which is why this tab was a
 * placeholder until the endpoint shipped.
 *
 * Two loads: the index once per conf (shared by every report viewed within it), then one report per player.
 *
 * Everything here is **per season**. Career totals and cross-season pools are deliberately absent upstream;
 * they belong to a future `/players/:profileId`.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtPct,
  fmtRatio,
  roleLabel,
  type ScoutChamp,
  type ScoutGame,
  type ScoutMatchup,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { dec, int, pct, signed } from "../../lib/statFormat";
import { sortByCell, type StatCell } from "../../lib/statGroups";
import { shortName } from "../../lib/statViews";
import { ChampionIcon } from "../ChampionIcon";
import { StatTile } from "./StatTile";
import { StatTable } from "./StatTable";
import { CONTROL_CLASS, Field, FilterBar } from "./FilterBar";

interface Props {
  conf: string;
  isMobile: boolean;
}

/** How many index matches to offer at once. The index runs to every player in the conf. */
const PICKER_LIMIT = 8;

/**
 * Alphabetical sort for a name column.
 *
 * `sortByCell` only knows how to order numeric cells, so a name header would otherwise set its arrow and
 * change nothing. Missing names sort last in either direction rather than clustering at the top.
 */
function byText<T>(rows: readonly T[], read: (row: T) => string | null, dir: 1 | -1): readonly T[] {
  return [...rows].sort((a, b) => {
    const x = read(a);
    const y = read(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x.localeCompare(y) * dir;
  });
}

/** Sort state for one of the three tables. They each need their own, and none of them need expansion. */
function useSort(initial: string) {
  const [sortKey, setSortKey] = useState(initial);
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const onSort = (key: string) => {
    if (key === sortKey) { setSortDir(d => (d === -1 ? 1 : -1)); return; }
    setSortKey(key);
    setSortDir(-1);
  };
  return { sortKey, sortDir, onSort };
}

const CHAMP_COLUMNS: readonly StatCell<ScoutChamp>[] = [
  { key: "games", label: "Games", value: c => c.games, format: int },
  { key: "record", label: "W-L", text: c => `${c.wins}-${c.games - c.wins}`, value: c => c.wins },
  { key: "winPct", label: "Win%", value: c => (c.games > 0 ? c.wins / c.games : null), format: pct },
  { key: "kda", label: "KDA", value: c => c.kda, format: fmtRatio },
  { key: "kda_raw", label: "K/D/A", text: c => `${c.kills}/${c.deaths}/${c.assists}` },
];

const GAME_COLUMNS: readonly StatCell<ScoutGame>[] = [
  { key: "seasonDay", label: "Week", value: g => g.seasonDay, format: int },
  { key: "win", label: "Result", text: g => (g.win ? "W" : "L"), value: g => (g.win ? 1 : 0) },
  { key: "kda_raw", label: "K/D/A", text: g => `${g.kills}/${g.deaths}/${g.assists}` },
  { key: "kda", label: "KDA", value: g => g.kda, format: fmtRatio },
  { key: "csm", label: "CS/min", short: "CS/min", value: g => g.csm, format: dec(2) },
  { key: "gd14", label: "Gold Diff @14", short: "GD@14", value: g => g.gd14, format: signed },
  { key: "kp", label: "Kill Participation", short: "KP", value: g => g.kp, format: pct },
  { key: "visionScore", label: "Vision", value: g => g.visionScore, format: int },
  // `vs` is null when the lane opponent couldn't be resolved, and the game is still kept.
  { key: "vs", label: "Versus", text: g => g.vs?.champ ?? null },
];

const MATCHUP_COLUMNS: readonly StatCell<ScoutMatchup>[] = [
  { key: "games", label: "Games", value: m => m.games, format: int },
  { key: "record", label: "W-L", text: m => `${m.wins}-${m.losses}`, value: m => m.wins },
  { key: "winPct", label: "Win%", value: m => (m.games > 0 ? m.wins / m.games : null), format: pct },
];

export function ScoutPanel({ conf, isMobile }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [profileId, setProfileId] = useState<number | null>(null);

  const champSort = useSort("games");
  const gameSort = useSort("seasonDay");
  const matchupSort = useSort("games");

  const indexQuery = useQuery(queries.scoutIndex(conf));
  const reportQuery = useQuery({
    ...queries.scout(conf, profileId ?? 0),
    enabled: profileId !== null,
  });

  // A profile id names a player in one conf's stat rows, so it stops meaning anything in another.
  useEffect(() => {
    setProfileId(null);
    setSearch("");
  }, [conf]);

  const matches = useMemo(() => {
    const rows = indexQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows.slice(0, PICKER_LIMIT);
    return rows
      .filter(p => (p.name ?? "").toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .slice(0, PICKER_LIMIT);
  }, [indexQuery.data, search]);

  const report = reportQuery.data ?? null;

  /**
   * Newest first for reading; the array is served oldest-first because it drives a form reading, so the
   * base order here is a reversed copy rather than a re-sort of the original.
   */
  const games = useMemo(() => {
    if (!report) return [];
    const base = [...report.timeline].reverse();
    if (gameSort.sortKey === "champ") return byText(base, g => g.champ, gameSort.sortDir);
    return sortByCell(base, GAME_COLUMNS.find(c => c.key === gameSort.sortKey), gameSort.sortDir);
  }, [report, gameSort.sortKey, gameSort.sortDir]);

  const champs = useMemo(() => {
    if (!report) return [];
    if (champSort.sortKey === "champ") return byText(report.champs, c => c.champ, champSort.sortDir);
    return sortByCell(report.champs, CHAMP_COLUMNS.find(c => c.key === champSort.sortKey), champSort.sortDir);
  }, [report, champSort.sortKey, champSort.sortDir]);

  const matchups = useMemo(() => {
    if (!report) return [];
    if (matchupSort.sortKey === "name") return byText(report.matchups, m => m.name, matchupSort.sortDir);
    return sortByCell(report.matchups, MATCHUP_COLUMNS.find(c => c.key === matchupSort.sortKey), matchupSort.sortDir);
  }, [report, matchupSort.sortKey, matchupSort.sortDir]);

  if (indexQuery.isPending) return <div className="text-center py-10 text-text-subtle">Loading players...</div>;
  if (indexQuery.error) return <div className="text-center py-10 text-ccs-red">{errorMessage(indexQuery.error)}</div>;
  if ((indexQuery.data ?? []).length === 0) {
    return <div className="text-center py-10 text-text-dim">No games played yet this season.</div>;
  }

  const totals = report?.totals;

  return (
    <div>
      <FilterBar isMobile={isMobile} columns={4}>
        <Field label="Player" span={2}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Player or team..."
            className={CONTROL_CLASS}
          />
        </Field>
      </FilterBar>

      {/* Picker. Names are the player's Riot ID *now* — renames propagate through historical data. */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {matches.map(p => (
          <button
            key={p.profileId}
            onClick={() => setProfileId(p.profileId)}
            aria-pressed={p.profileId === profileId}
            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left ${
              p.profileId === profileId
                ? "bg-accent border-accent text-white"
                : "bg-bg2 border-border text-text-secondary"
            }`}
          >
            <span className="font-heading text-[12px] font-bold">{shortName(p.name ?? "Unknown")}</span>
            <span className="text-[10px] opacity-70 font-mono">
              {p.team} · {p.roles[0] ? roleLabel(p.roles[0]).slice(0, 3) : "—"} · {p.games}G
            </span>
          </button>
        ))}
        {matches.length === 0 && (
          <div className="text-[13px] text-text-dim py-2">No players match that search.</div>
        )}
      </div>

      {profileId === null ? (
        <div className="text-center py-10 text-text-dim">Pick a player to see their scouting report.</div>
      ) : reportQuery.isPending ? (
        <div className="text-center py-10 text-text-subtle">Loading report...</div>
      ) : reportQuery.error ? (
        <div className="text-center py-10 text-ccs-red">{errorMessage(reportQuery.error)}</div>
      ) : !report || !totals ? (
        <div className="text-center py-10 text-text-dim">No games for this player in this split.</div>
      ) : (
        <div>
          <div className="mb-4">
            <h3 className="font-display text-[20px] text-text-bright tracking-widest m-0">
              {shortName(report.name ?? "Unknown")}
            </h3>
            <div className="text-[11px] text-text-secondary font-heading tracking-wide">
              {report.teams.join(" · ")}
              {report.roles.length > 0 && ` · ${report.roles.map(r => roleLabel(r)).join(" / ")}`}
            </div>
          </div>

          <div className={`grid gap-3 mb-5 ${isMobile ? "grid-cols-2" : "grid-cols-5"}`}>
            <StatTile value={int(totals.games)} label="Games" color="var(--accent)" />
            <StatTile value={`${totals.wins}-${totals.losses}`} label="Record" color="var(--text-bright)" />
            <StatTile value={fmtRatio(totals.kda)} label="KDA" color="var(--gold)" />
            <StatTile
              value={totals.csm !== null ? totals.csm.toFixed(2) : "—"}
              label="CS / min"
              color="var(--blue)"
            />
            <StatTile
              value={totals.kp !== null ? fmtPct(totals.kp) : "—"}
              label="Kill Participation"
              color="var(--green)"
            />
          </div>

          <h4 className="font-display text-base text-text-bright tracking-widest mb-2">CHAMPION POOL</h4>
          <div className="mb-5">
            <StatTable
              rows={champs}
              rowKey={c => c.champId}
              columns={CHAMP_COLUMNS}
              nameHeader="Champion"
              nameSortKey="champ"
              isMobile={isMobile}
              sortKey={champSort.sortKey}
              sortDir={champSort.sortDir}
              onSort={champSort.onSort}
              expandedKey={null}
              onExpand={() => {}}
              renderName={c => (
                <div className="flex items-center gap-2">
                  <ChampionIcon src={c.img} size={28} decorative className="flex shrink-0" />
                  <span className="font-heading font-bold text-text-bright truncate">{c.champ}</span>
                </div>
              )}
            />
          </div>

          <h4 className="font-display text-base text-text-bright tracking-widest mb-2">GAME LOG</h4>
          <div className="mb-5">
            <StatTable
              rows={games}
              rowKey={g => `${g.matchId}-${g.game}`}
              columns={GAME_COLUMNS}
              nameHeader="Champion"
              nameSortKey="champ"
              isMobile={isMobile}
              sortKey={gameSort.sortKey}
              sortDir={gameSort.sortDir}
              onSort={gameSort.onSort}
              expandedKey={null}
              onExpand={() => {}}
              caption={<>{games.length} games · newest first · click a row to open the game</>}
              renderName={g => (
                <button
                  onClick={() => navigate(`/game/${encodeURIComponent(g.matchId)}`)}
                  className="flex items-center gap-2 text-left w-full min-w-0"
                >
                  <ChampionIcon src={g.champImg} size={28} decorative className="flex shrink-0" />
                  <div className="min-w-0">
                    <div className="font-heading font-bold text-text-bright truncate">{g.champ ?? "—"}</div>
                    <div className="text-[10px] text-text-secondary font-heading tracking-wide truncate">
                      vs {g.opponent}
                      {/* Presence is tested on `vs`, not on its name: a resolved opponent can be a
                          banned account with a null name. */}
                      {g.vs && ` · ${shortName(g.vs.name ?? "Unknown")}`}
                    </div>
                  </div>
                </button>
              )}
            />
          </div>

          <h4 className="font-display text-base text-text-bright tracking-widest mb-2">LANE MATCHUPS</h4>
          {matchups.length === 0 ? (
            <div className="text-[13px] text-text-dim py-4">
              No resolvable lane opponents this split.
            </div>
          ) : (
            <StatTable
              rows={matchups}
              rowKey={m => m.profileId}
              columns={MATCHUP_COLUMNS}
              nameHeader="Opponent"
              nameSortKey="name"
              isMobile={isMobile}
              sortKey={matchupSort.sortKey}
              sortDir={matchupSort.sortDir}
              onSort={matchupSort.onSort}
              expandedKey={null}
              onExpand={() => {}}
              renderName={m => (
                <div className="min-w-0">
                  <div className="font-heading font-bold text-text-bright truncate">
                    {shortName(m.name ?? "Unknown")}
                  </div>
                  <div className="text-[10px] text-text-secondary font-mono">{m.team}</div>
                </div>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}
