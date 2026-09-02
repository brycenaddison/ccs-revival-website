/**
 * The Teams tab: every team in one conference, with its roster, one card each.
 *
 * **One conference at a time**, like Standings and Stats. With several running, a strip picks one and
 * the grid shows only that division's teams; a merged grid of two divisions sorted by name reads as
 * one league of twenty, which is a competition nobody is in. The strip is labeled by `groupLabels`,
 * so it says the same thing the Standings strip does for the same conf.
 *
 * The pick is held locally and must **not** call `setSelection` — that collapses `selectedConfs` to
 * the one conf, which makes the strip vanish the instant it is used. `StandingsView` and
 * `StandingsWidget` carry the same warning for the same reason.
 *
 * Teams arrive already loaded for every selected conf (`useLeagueData` is one call per conf and
 * covers every tab), so the filter is a partition of what is on hand, not a fetch. A team's conf is
 * the prefix of its id — `teamKey` is `conf:code` — which is the identity the adapters produce.
 */

import { useMemo, useState } from "react";
import { roleLabel } from "../../lib/api";
import { useLeague } from "../../lib/leagueContext";
import { groupLabels, parseTeamKey } from "../../lib/leagueAdapters";
import { teamGradient } from "../../lib/teamStyle";
import { teamInitial } from "../../lib/utils";
import { TeamLink } from "../league/TeamLink";
import { PlayerLink } from "../profile/PlayerLink";
import type { Team, Standing, Roster } from "../../hooks/useLeagueData";

interface Props {
  teams: Team[];
  standings: Standing[];
  rosters: Roster[];
  isMobile: boolean;
}

export function TeamsView({ teams, standings, rosters, isMobile }: Props) {
  const { tournaments, selectedConfs } = useLeague();

  // Resolved rather than stored, so a stale pick after the season selection changes falls back to
  // the first conference instead of showing an empty grid.
  const [confPick, setConfPick] = useState<string | null>(null);
  const conf = (confPick && selectedConfs.includes(confPick) ? confPick : selectedConfs[0]) ?? null;

  const labels = useMemo(() => groupLabels(tournaments, selectedConfs), [tournaments, selectedConfs]);

  // With one conf selected there is nothing to partition, and `teams` is already that conf's list.
  const shown =
    selectedConfs.length > 1 && conf !== null
      ? teams.filter(t => parseTeamKey(t.id)?.conf === conf)
      : teams;

  const standingsMap: Record<string, Standing> = {};
  standings.forEach(s => { if (s.teams?.id) standingsMap[s.teams.id] = s; });

  return (
    <div className="max-w-[1000px] mx-auto">
      <h2 className="font-display text-[22px] text-text-bright mb-4">Teams</h2>

      {/* `overflow-y-hidden` because `overflow-x` being set at all makes `overflow-y` compute to
          `auto`, and a single row of buttons has no business owning a vertical scrollbar. */}
      {selectedConfs.length > 1 && (
        <div className="mb-4 flex flex-nowrap gap-4 overflow-x-auto overflow-y-hidden">
          {selectedConfs.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setConfPick(c)}
              className={`shrink-0 cursor-pointer border-none bg-transparent p-0 font-heading text-[12px] ${
                c === conf ? "text-text-bright" : "text-text-muted"
              }`}
            >
              {labels.get(c) ?? c.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-text-dim">No teams yet.</div>
      ) : (
      <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
        {shown.map(t => {
          const record = standingsMap[t.id];
          const teamRoster = rosters.filter(r => r.teams?.id === t.id);
          return (
            <div key={t.id} className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <TeamLink
                team={t}
                className="flex items-center gap-3.5 px-4 py-5 no-underline"
                style={{ background: teamGradient(t.color_primary || "#333", t.color_accent || "#555") }}
              >
                {t.logo_url ? (
                  <img src={t.logo_url} alt={t.name} loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-contain bg-black/20" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-xl text-white font-bold font-heading">
                    {teamInitial(t.name)}
                  </div>
                )}
                <div>
                  <div className="font-display text-xl text-white ">{t.name}</div>
                  <div className="flex gap-2 items-center mt-0.5">
                    <span className="text-[11px] text-white/70 font-mono">{t.abbreviation}</span>
                    {/* The division caption is gone from the card: the strip above names the
                        division every card on screen belongs to, so repeating it per card said
                        the same thing twenty times. */}
                    {record && <span className="text-[11px] text-white/90 font-mono font-bold">({record.wins}W-{record.losses}L)</span>}
                  </div>
                </div>
              </TeamLink>
              <div className="px-4 py-3">
                {teamRoster.length === 0 ? (
                  <div className="py-2 text-xs text-text-dim">No roster set</div>
                ) : (
                  <table className="w-full border-collapse">
                    <tbody>
                      {teamRoster.map((r, i) => (
                        <tr key={r.id} className={i < teamRoster.length - 1 ? "border-b border-border" : ""}>
                          <td className="py-2 font-heading text-[13px] text-text font-medium">
                            {/* Every reader-facing name backed by a `profileId` goes through
                                `PlayerLink`; this roster was the last one on the site that didn't. */}
                            <PlayerLink
                              profileId={r.profileId}
                              className="text-text no-underline hover:text-brand"
                            >
                              {r.players?.display_name || "Unknown"}
                            </PlayerLink>
                            {r.is_captain && <span className="text-[9px] text-ccs-orange ml-1.5 font-bold tracking-wide">C</span>}
                          </td>
                          {/* Empty rather than a dash: the bench genuinely has no assigned role,
                              so a placeholder would imply the data is missing. */}
                          <td className="py-2 text-[11px] text-text-muted text-right font-heading tracking-wide">{roleLabel(r.role, "")}</td>
                          <td className="py-2 pl-3 text-[10px] text-right">
                            {r.is_starter ? <span className="text-ccs-green">Starter</span> : <span className="text-ccs-red">Sub</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
