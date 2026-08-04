/**
 * The Home page's standings panel — a compact read of the same season document the Standings tab
 * renders in full.
 *
 * **Which phase it shows is the whole design question**, and `standingsPhase` answers it: the active
 * phase when that is a group phase, otherwise the nearest group phase before it. During playoffs a
 * reader glancing at the sidebar still wants the table that produced the seeding, not a bracket
 * squeezed into 280 pixels — the tab is where the bracket lives.
 *
 * The tab strip here is groups within the one conference. It used to be divisions across several,
 * which is the merge the Standings tab no longer does either: two conferences are two seasons.
 *
 * `STRK` is gone with the old `/standings/:conf` source. A streak is season-wide and these rows are
 * phase-scoped; showing the two side by side would put two different denominators in one row.
 */

import { useState } from "react";
import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { toBadge } from "../../lib/leagueAdapters";
import { toneForLevel } from "../../lib/scenarioTones";
import { standingsPhase, type SeasonPayload } from "../../lib/api";
import type { Team } from "../../types/league";

interface Props {
  season: SeasonPayload | null;
  /** The conference the rows belong to, for the team links. */
  conf: string | null;
  /** Every team in the selected season(s), for the fallback list before a season is drawn. */
  teams: Team[];
  /** True while the season is in flight, so the team-list fallback doesn't flash first. */
  loading?: boolean;
}

export function StandingsWidget({ season, conf, teams, loading }: Props) {
  const phase = standingsPhase(season);
  const groups = phase?.groups ?? [];
  const [groupName, setGroupName] = useState<string | null>(null);
  const group = groups.find(g => g.name === groupName) ?? groups[0] ?? null;

  // The season loads on its own request, so "none yet" and "none at all" are different states —
  // showing the fallback while one is in flight would swap the panel out from under the reader.
  if (loading && !group) return null;

  if (!group && teams.length) {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-bg2">
        <div className="border-b border-border px-4 py-3.5">
          <span className="font-display text-[15px] tracking-widest text-text-bright">TEAMS</span>
        </div>
        {teams.map((t, i) => (
          <TeamLink
            key={t.id}
            team={t}
            className={`group flex items-center gap-2 px-3 py-2.5 no-underline ${
              i < teams.length - 1 ? "border-b border-bg2" : ""
            }`}
          >
            <TeamBadge team={t} size={28} />
            <span className="font-heading text-[13px] font-medium text-text group-hover:text-accent">
              {t.name}
            </span>
            <span className="ml-auto font-mono text-[10px] text-text-dim">{t.abbreviation}</span>
          </TeamLink>
        ))}
      </div>
    );
  }

  if (!group || !conf || group.standings.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg2">
      {groups.length > 1 ? (
        <div className="flex border-b border-border">
          {groups.map(g => (
            <button
              key={`${g.ordinal}-${g.name}`}
              onClick={() => setGroupName(g.name)}
              className={`flex-1 cursor-pointer border-none py-2.5 font-display text-[13px] tracking-widest ${
                g.name === group.name
                  ? "border-b-2 border-b-accent bg-bg-input text-text-bright"
                  : "border-b-2 border-b-transparent bg-transparent text-text-muted"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="border-b border-border px-4 py-3">
          <span className="font-display text-[15px] tracking-widest text-text-bright">
            {(phase?.name ?? "STANDINGS").toUpperCase()}
          </span>
        </div>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-border px-3 py-2 text-left font-heading text-[10px] font-normal tracking-wider text-text-muted">
              TEAM
            </th>
            <th className="border-b border-border px-2 py-2 text-center font-heading text-[10px] font-normal text-text-muted">
              W-L
            </th>
            <th className="border-b border-border px-2 py-2 text-center font-heading text-[10px] font-normal text-text-muted">
              GAMES
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Rendered in the order served. Never re-sorted and never renumbered by row index — the
              ranking resolves head-to-head, which nothing on this page could reconstruct. */}
          {group.standings.map(row => {
            const tone = row.scenario ? toneForLevel(row.scenario.level) : null;

            return (
              <tr
                key={`${row.code}-${row.position}`}
                style={{
                  borderLeft: `4px solid ${tone?.line ?? "transparent"}`,
                  background: tone?.bg,
                }}
              >
                <td className="px-3.5 py-2.5">
                  <TeamLink conf={conf} code={row.code} className="group flex items-center gap-2 no-underline">
                    <span
                      className="min-w-[14px] text-right font-mono text-[10px] font-bold"
                      style={{ color: tone?.fg ?? "var(--text-muted)" }}
                    >
                      {row.place}
                    </span>
                    <TeamBadge team={toBadge(row)} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-heading text-[13px] font-medium text-text group-hover:text-accent">
                        {row.name}
                      </span>
                      {row.scenario && (
                        <span
                          className="font-heading text-[8px] font-bold uppercase tracking-wider"
                          style={{ color: tone?.fg }}
                          title={row.tied ? "Tied on rank — not settled yet" : row.scenario.subtitle || undefined}
                        >
                          {row.scenario.title}
                          {row.tied && "†"}
                        </span>
                      )}
                    </div>
                  </TeamLink>
                </td>
                <td className="text-center font-mono text-[13px] text-text-secondary">
                  {row.seriesWins}-{row.seriesLosses}
                </td>
                <td className="text-center font-mono text-xs text-text-muted">
                  {row.gameWins + row.gameLosses === 0 ? "—" : `${row.gameWins}-${row.gameLosses}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
