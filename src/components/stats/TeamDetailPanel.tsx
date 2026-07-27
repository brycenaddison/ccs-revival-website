import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  errorMessage,
  fmtPct,
  fmtRatio,
  fmtSec,
  isAbort,
  sortByRole,
  teamDetail,
  type TeamDetail,
} from "../../lib/api";
import { TeamLink } from "../league/TeamLink";

interface Props {
  conf: string;
  code: string;
  /** Omit when the panel is a whole page and the page provides its own navigation. */
  onBack?: () => void;
  onSelectMatch: (matchId: string) => void;
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border last:border-b-0">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-sm text-text-bright font-mono">{value}</span>
    </div>
  );
}

/** Team statistics are optional — a team that hasn't played has none at all. */
function stat(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? "—" : fmtRatio(v, digits);
}

function rounded(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : String(Math.round(v));
}

export function TeamDetailPanel({ conf, code, onBack, onSelectMatch }: Props) {
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    teamDetail(conf, code, { signal: ac.signal })
      .then(setTeam)
      .catch(e => { if (!isAbort(e)) setErr(errorMessage(e)); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [conf, code]);

  if (loading) return <div className="text-center py-10 text-text-subtle">Loading team...</div>;
  if (err) return <div className="text-center py-10 text-ccs-red">{err}</div>;
  if (!team) return <div className="text-center py-10 text-text-dim">Team not found.</div>;

  const players = sortByRole(team.players);

  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="mb-4 text-xs text-text-secondary hover:text-accent font-heading tracking-wider uppercase">
          ← Back
        </button>
      )}

      {/* Header */}
      <div className="rounded-lg overflow-hidden mb-5" style={{ background: `linear-gradient(135deg, ${team.colorHex}, var(--bg2))` }}>
        <div className="flex items-center gap-4 p-5">
          {team.logo ? (
            <img src={team.logo} alt={team.name} className="w-16 h-16 rounded-lg object-contain bg-black/30" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-black/30 flex items-center justify-center text-2xl font-bold text-white">
              {team.code.charAt(0)}
            </div>
          )}
          <div>
            <h2 className="font-display text-2xl text-white tracking-wider">{team.name}</h2>
            <div className="text-sm text-white/70 mt-1 font-mono">
              {team.hasStats
                ? `${team.code} · ${team.wins}W-${team.losses}L · ${fmtPct(team.winrate)} WR · ${team.games} games`
                : `${team.code} · no games played yet`}
            </div>
          </div>
        </div>
      </div>

      {!team.hasStats ? (
        <div className="bg-bg2 border border-border rounded-md p-8 text-center text-text-dim text-sm">
          This team has no recorded games yet. Statistics will appear once matches are played.
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="bg-bg2 border border-border rounded-md p-4">
              <h3 className="font-display text-sm text-text-bright tracking-wider mb-2">Combat</h3>
              <StatRow label="Avg Game Time" value={team.avgTime || "—"} />
              <StatRow label="KD Ratio" value={stat(team.killDeathRatio)} />
              <StatRow label="Avg Kills" value={stat(team.avgKills)} />
              <StatRow label="Avg Deaths" value={stat(team.avgDeaths)} />
              <StatRow label="Avg Assists" value={stat(team.avgAssists)} />
              <StatRow label="First Blood Rate" value={fmtPct(team.firstBloodPercent)} />
            </div>
            <div className="bg-bg2 border border-border rounded-md p-4">
              <h3 className="font-display text-sm text-text-bright tracking-wider mb-2">Economy</h3>
              <StatRow label="DMG / min" value={rounded(team.damageMin)} />
              <StatRow label="Gold / min" value={rounded(team.goldMin)} />
              <StatRow label="CS / min" value={stat(team.csMin)} />
              <StatRow label="Gold Diff @14" value={rounded(team.goldDiffAt14)} />
              <StatRow label="Vision / min" value={stat(team.visionScoreMin)} />
              <StatRow label="Blueside WR" value={fmtPct(team.bluesideWinrate)} />
            </div>
            <div className="bg-bg2 border border-border rounded-md p-4">
              <h3 className="font-display text-sm text-text-bright tracking-wider mb-2">Objectives</h3>
              <StatRow label="First Tower %" value={fmtPct(team.firstTowerPercent)} />
              <StatRow label="Avg Towers" value={stat(team.avgTowersTaken)} />
              <StatRow label="First Dragon %" value={fmtPct(team.firstDragonPercent)} />
              <StatRow label="Avg Dragons" value={stat(team.avgDragonsTaken)} />
              <StatRow label="First Baron %" value={fmtPct(team.firstBaronPercent)} />
              <StatRow label="Avg Barons" value={stat(team.avgBaronsTaken)} />
            </div>
          </div>

          {/* Roster */}
          <div className="bg-bg2 border border-border rounded-md p-4 mb-5">
            <h3 className="font-display text-sm text-text-bright tracking-wider mb-3">Roster</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-text-secondary uppercase tracking-wider border-b border-border">
                    <th className="text-left py-2 pr-3">Player</th>
                    <th className="text-center py-2 px-2">Role</th>
                    <th className="text-center py-2 px-2">GP</th>
                    <th className="text-center py-2 px-2">KDA</th>
                    <th className="text-center py-2 px-2">K/D/A</th>
                    <th className="text-center py-2 px-2">CS/M</th>
                    <th className="text-center py-2 px-2">DMG/M</th>
                    <th className="text-center py-2 px-2">Win%</th>
                    <th className="text-left py-2 px-2">Top Champs</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(p => (
                    <tr key={p.rowKey} className="border-b border-border last:border-b-0">
                      <td className="py-2.5 pr-3 font-heading font-bold text-text-bright">{p.name}</td>
                      <td className="text-center py-2.5 px-2 text-[10px] text-text-muted">{p.role ?? "—"}</td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{p.games}</td>
                      <td className="text-center py-2.5 px-2 font-bold">{fmtRatio(p.kda)}</td>
                      <td className="text-center py-2.5 px-2 text-xs font-mono">
                        {stat(p.avgKills, 1)}/{stat(p.avgDeaths, 1)}/{stat(p.avgAssists, 1)}
                      </td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{stat(p.csMin)}</td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{rounded(p.damageMin)}</td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{fmtPct(p.winPercent)}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex gap-1">
                          {p.champs.slice(0, 3).map(ch => (
                            <img key={ch.champid} src={ch.img} alt={ch.name} title={`${ch.name} (${ch.picks ?? 0}p)`} className="w-6 h-6 rounded" />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bans */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-bg2 border border-border rounded-md p-4">
              <h3 className="font-display text-sm text-text-bright tracking-wider mb-3">Most Banned Against {team.code}</h3>
              <div className="flex flex-wrap gap-2">
                {team.bannedAgainst.slice(0, 10).map(b => (
                  <div key={b.championId} className="flex items-center gap-2 bg-bg3 border border-border rounded px-2 py-1">
                    <img src={b.img} alt={b.name} className="w-6 h-6 rounded" />
                    <span className="text-xs">{b.name}</span>
                    <span className="text-xs text-text-dim font-mono">{b.bans}x</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-bg2 border border-border rounded-md p-4">
              <h3 className="font-display text-sm text-text-bright tracking-wider mb-3">Most Banned By {team.code}</h3>
              <div className="flex flex-wrap gap-2">
                {team.bannedBy.slice(0, 10).map(b => (
                  <div key={b.championId} className="flex items-center gap-2 bg-bg3 border border-border rounded px-2 py-1">
                    <img src={b.img} alt={b.name} className="w-6 h-6 rounded" />
                    <span className="text-xs">{b.name}</span>
                    <span className="text-xs text-text-dim font-mono">{b.bans}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Matchlist */}
          <div className="bg-bg2 border border-border rounded-md p-4">
            <h3 className="font-display text-sm text-text-bright tracking-wider mb-3">Match History</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-text-secondary uppercase tracking-wider border-b border-border">
                    <th className="text-left py-2 pr-3">Wk</th>
                    <th className="text-left py-2 px-2">Result</th>
                    <th className="text-left py-2 px-2">Opponent</th>
                    <th className="text-center py-2 px-2">Side</th>
                    <th className="text-center py-2 px-2">Time</th>
                    <th className="text-center py-2 px-2">K/D/A</th>
                    <th className="text-center py-2 px-2">Towers</th>
                    <th className="text-center py-2 px-2">Drag</th>
                    <th className="text-center py-2 px-2">Baron</th>
                  </tr>
                </thead>
                <tbody>
                  {team.matchlist.map(m => (
                    <tr
                      key={m.matchId}
                      onClick={() => onSelectMatch(m.matchId)}
                      className="border-b border-border last:border-b-0 hover:bg-bg3 cursor-pointer"
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        {/* A real link as well as the row click, so games can open in a new tab. */}
                        <Link
                          to={`/game/${encodeURIComponent(m.matchId)}`}
                          onClick={e => e.stopPropagation()}
                          className="no-underline text-text hover:text-accent"
                        >
                          W{m.week}
                        </Link>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`font-bold ${m.win ? "text-ccs-green" : "text-ccs-red"}`}>{m.win ? "W" : "L"}</span>
                        <span className="text-text-dim ml-2 text-xs">G{m.game}</span>
                      </td>
                      <td className="py-2.5 px-2 font-heading font-bold">
                        <TeamLink conf={conf} code={m.opponent} stopPropagation className="no-underline text-text hover:text-accent">
                          {m.opponent}
                        </TeamLink>
                      </td>
                      <td className="text-center py-2.5 px-2 text-[10px] font-bold" style={{ color: m.blueside ? "#3b82f6" : "#ef4444" }}>{m.blueside ? "BLUE" : "RED"}</td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{fmtSec(m.time)}</td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{m.kills}/{m.deaths}/{m.assists}</td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{m.towers ?? "—"}</td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{m.dragons ?? "—"}</td>
                      <td className="text-center py-2.5 px-2 font-mono text-xs">{m.barons ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[10px] text-text-dim">Click a row to view the full game</div>
          </div>
        </>
      )}
    </div>
  );
}
