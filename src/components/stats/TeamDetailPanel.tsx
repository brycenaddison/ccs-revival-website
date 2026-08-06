import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  fmtPct,
  fmtRatio,
  fmtSec,
  roleLabel,
  sortByRole,
  type PlayerStatsRanked,
  type TeamDetail,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { joinRoster, type JoinedRoster } from "../../lib/roster";
import { ChampionIcon } from "../ChampionIcon";
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

/**
 * The header's summary line.
 *
 * `record` is series — what the standings rank on — while `teamstats` wins/losses are individual
 * games, so both are labelled rather than left as a bare "4W-1L". A 2-1 series win is one series
 * win and three games; showing the game record unlabelled overstates it by roughly 2.5×.
 */
function headline(team: TeamDetail): string {
  const parts = [team.code];
  if (team.record) parts.push(`${team.record.seriesWins}-${team.record.seriesLosses} series`);
  if (team.hasStats) parts.push(`${team.wins}-${team.losses} games`, `${fmtPct(team.winrate)} game WR`);
  else parts.push("no games played yet");
  return parts.join(" · ");
}

const ROSTER_COLUMNS = ["Player", "Role", "GP", "KDA", "K/D/A", "CS/M", "DMG/M", "Win%", "Top Champs"] as const;

/** The stat columns of a roster row, shared by roster slots and unclaimed stat lines. */
function StatCells({ p }: { p: PlayerStatsRanked | null }) {
  // A slot-holder with no games is the whole point of reading the roster, so say so plainly
  // instead of filling seven columns with dashes.
  if (!p) {
    return (
      <>
        <td colSpan={6} className="text-center py-2.5 px-2 text-[11px] text-text-dim italic">
          no recorded games
        </td>
        <td className="py-2.5 px-2" />
      </>
    );
  }
  return (
    <>
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
            <ChampionIcon key={ch.champid} src={ch.img} name={ch.name} title={`${ch.name} (${ch.picks ?? 0}p)`} className="flex shrink-0" />
          ))}
        </div>
      </td>
    </>
  );
}

function RosterHead() {
  return (
    <thead>
      <tr className="text-[10px] text-text-secondary uppercase tracking-wider border-b border-border">
        {ROSTER_COLUMNS.map((label, i) => (
          <th key={label} className={i === 0 ? "text-left py-2 pr-3" : i === ROSTER_COLUMNS.length - 1 ? "text-left py-2 px-2" : "text-center py-2 px-2"}>
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * The declared roster, with each slot's stat line beside it.
 *
 * Rendered whether or not the team has played: the roster comes from `teams`, so a team with no
 * games still has one to show. `extras` are stat lines no slot claimed — a stand-in, or a
 * slot-holder's second role — kept in their own table so they read as appearances rather than
 * as roster members.
 */
function RosterPanel({ entries, extras, code }: JoinedRoster<PlayerStatsRanked> & { code: string }) {
  return (
    <>
      <div className="bg-bg2 border border-border rounded-md p-4 mb-5">
        <h3 className="font-display text-sm text-text-bright tracking-wider mb-3">Roster</h3>
        {entries.length === 0 ? (
          <div className="py-2 text-xs text-text-dim">No roster set for this team.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <RosterHead />
              <tbody>
                {entries.map(e => (
                  <tr key={e.key} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 pr-3 font-heading font-bold text-text-bright">
                      {e.name}
                      {!e.starter && (
                        <span className="ml-1.5 text-[9px] text-text-muted font-bold tracking-wide uppercase">Sub</span>
                      )}
                    </td>
                    <td className="text-center py-2.5 px-2 text-[10px] text-text-muted">{roleLabel(e.role)}</td>
                    <StatCells p={e.stats} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {extras.length > 0 && (
        <div className="bg-bg2 border border-border rounded-md p-4 mb-5">
          <h3 className="font-display text-sm text-text-bright tracking-wider mb-1">Other Appearances</h3>
          <p className="text-[11px] text-text-dim mb-3">
            Games played for {code} outside a roster slot — stand-ins, and roster players in a second role.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <RosterHead />
              <tbody>
                {sortByRole(extras).map(p => (
                  <tr key={p.rowKey} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 pr-3 font-heading font-bold text-text-bright">{p.name}</td>
                    <td className="text-center py-2.5 px-2 text-[10px] text-text-muted">{roleLabel(p.role)}</td>
                    <StatCells p={p} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export function TeamDetailPanel({ conf, code, onBack, onSelectMatch }: Props) {
  // Fans out to `/teams/:c/:t` plus the conf listing for the roster and record — and that listing
  // is the same query the league loader uses, so arriving from the Teams tab reuses it.
  const { data: team, isPending, error } = useQuery(queries.teamDetail(conf, code));

  if (isPending) return <div className="text-center py-10 text-text-subtle">Loading team...</div>;
  if (error) return <div className="text-center py-10 text-ccs-red">{errorMessage(error)}</div>;
  if (!team) return <div className="text-center py-10 text-text-dim">Team not found.</div>;

  const roster = joinRoster(team.roster, team.players);

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
            <img src={team.logo} alt={team.name} decoding="async" className="w-16 h-16 rounded-lg object-contain bg-black/30" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-black/30 flex items-center justify-center text-2xl font-bold text-white">
              {team.code.charAt(0)}
            </div>
          )}
          <div>
            <h2 className="font-display text-2xl text-white tracking-wider">{team.name}</h2>
            <div className="text-sm text-white/70 mt-1 font-mono">{headline(team)}</div>
          </div>
        </div>
      </div>

      {!team.hasStats && (
        <div className="bg-bg2 border border-border rounded-md p-8 text-center text-text-dim text-sm mb-5">
          This team has no recorded games yet. Statistics will appear once matches are played.
        </div>
      )}

      {team.hasStats && (
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
        </>
      )}

      {/* Outside the `hasStats` branch: the roster comes from `teams`, so a team that has
          never played still has one to show. */}
      <RosterPanel {...roster} code={team.code} />

      {team.hasStats && (
        <>
          {/* Bans */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-bg2 border border-border rounded-md p-4">
              <h3 className="font-display text-sm text-text-bright tracking-wider mb-3">Most Banned Against {team.code}</h3>
              <div className="flex flex-wrap gap-2">
                {team.bannedAgainst.slice(0, 10).map(b => (
                  <div key={b.championId} className="flex items-center gap-2 bg-bg3 border border-border rounded px-2 py-1">
                    <ChampionIcon src={b.img} name={b.name} className="flex shrink-0" />
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
                    <ChampionIcon src={b.img} name={b.name} className="flex shrink-0" />
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
                          W{m.seasonDay}
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
