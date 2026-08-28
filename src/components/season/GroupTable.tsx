/**
 * One group's standings table.
 *
 * **Rows are rendered exactly in the order given, and never renumbered by index.** The order and the
 * ranks both come from the API, which resolves series record, then game win percentage, then
 * head-to-head among the teams still level. Head-to-head cannot be recomputed from anything this page
 * loads, and teams level on all three legitimately *share* a rank — renumbering by row would invent an
 * order the league does not recognize. `place` carries the tie marker ("T-2").
 *
 * Records here are scoped to this phase's own match days: a group table never counts a result from
 * the playoffs, which is why these rows do not come from `/standings/:conf`.
 */

import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { ScenarioPill } from "./ScenarioPill";
import { toBadge } from "../../lib/leagueAdapters";
import { toneForLevel } from "../../lib/scenarioTones";
import type { SeasonGroup, SeasonGroupRow } from "../../lib/api";

interface Props {
  group: SeasonGroup;
  conf: string;
  /** Suppressed when the phase has exactly one group — an unnamed single group *is* the phase. */
  showName: boolean;
  isMobile: boolean;
}

/** Game record as text, or "—" for a team with no games. */
function games(row: SeasonGroupRow): string {
  return row.gameWins + row.gameLosses === 0 ? "—" : `${row.gameWins}-${row.gameLosses}`;
}

export function GroupTable({ group, conf, showName, isMobile }: Props) {
  const anyTied = group.standings.some(r => r.tied);
  const headers: string[] = isMobile ? ["#", "TEAM", "W", "L", "GAMES"] : ["#", "TEAM", "W", "L", "WIN%", "GAMES"];

  return (
    <div className="mb-4 overflow-hidden rounded-md border border-border bg-bg2">
      {showName && (
        <div className="border-b border-border px-4 py-3">
          <span className="font-display text-[15px] tracking-widest text-text-bright">
            {group.name.toUpperCase()}
          </span>
        </div>
      )}

      {group.standings.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-text-dim">No teams in this group yet.</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map(h => (
                <th
                  key={h}
                  title={h === "GAMES" ? "Individual games won-lost. The first tiebreaker." : undefined}
                  // Nothing here wraps. `WIN%` and `GAMES` are short enough to look safe and are
                  // not: a narrow screen breaks them over two lines and the header row doubles in
                  // height. The team column is the one that gives, and it truncates.
                  className={`whitespace-nowrap border-b border-border px-3.5 py-3 font-heading text-[10px] font-normal tracking-wider text-text-muted ${
                    h === "#" || h === "TEAM" ? "text-left" : "text-center"
                  }`}
                >
                  {h}
                </th>
              ))}
              {/* On mobile the scenario moves under the team name — a pill in its own column would
                  push the record off the screen. */}
              {!isMobile && (
                <th className="border-b border-border px-3.5 py-3 text-left font-heading text-[10px] font-normal tracking-wider text-text-muted">
                  SCENARIO
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {group.standings.map(row => {
              const played = row.seriesWins + row.seriesLosses;
              const pct = played > 0 ? Math.round((row.seriesWins / played) * 100) : 0;
              // The row's color is the outcome's color — one source for the pill, the fill and the
              // rule, so a standings row and its legend entry cannot disagree. A row with no scenario
              // mapped gets no tint rather than an invented one.
              const tone = row.scenario ? toneForLevel(row.scenario.level) : null;

              return (
                <tr
                  key={`${row.code}-${row.position}`}
                  style={{
                    borderLeft: `4px solid ${tone?.line ?? "transparent"}`,
                    background: tone?.bg,
                  }}
                >
                  <td
                    // `T-2` breaks at its hyphen given half a chance, which puts the `2` on a second
                    // line and makes one tied row twice the height of its neighbours.
                    className="whitespace-nowrap px-3.5 py-3.5 font-display text-lg"
                    style={{ color: tone?.fg ?? "var(--text-muted)" }}
                  >
                    {/* `place` already marks a tie ("T-2"); the row index would hide it. */}
                    {row.place}
                    {row.tied && <span className="align-super text-[10px]">†</span>}
                  </td>
                  <td className="px-3.5 py-3.5">
                    {/*
                      `min-w-0` on both the link and the text block, and `truncate` on each line.
                      This is the only column allowed to give: every other one is a short number that
                      means nothing broken in half, so the name is what shortens when the table runs
                      out of room. Without `min-w-0` a flex item refuses to shrink below its content
                      and `truncate` never engages — the name pushes the record off screen instead.
                    */}
                    <TeamLink
                      conf={conf}
                      code={row.code}
                      className="group flex min-w-0 items-center gap-2.5 no-underline"
                    >
                      <TeamBadge team={toBadge(row)} size={28} />
                      <div className="min-w-0">
                        <div className="truncate">
                          <span className="font-heading text-sm font-medium text-text group-hover:text-accent">
                            {row.name}
                          </span>
                          <span className="ml-2 font-mono text-[10px] text-text-dim">{row.code}</span>
                        </div>
                        {isMobile && row.scenario && (
                          <span
                            className="block truncate font-heading text-[9px] font-bold uppercase tracking-wider"
                            style={{ color: toneForLevel(row.scenario.level).fg }}
                          >
                            {row.scenario.title}
                          </span>
                        )}
                      </div>
                    </TeamLink>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-3.5 text-center font-mono text-sm font-bold text-ccs-green">
                    {row.seriesWins}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-3.5 text-center font-mono text-sm font-bold text-ccs-red">
                    {row.seriesLosses}
                  </td>
                  {!isMobile && (
                    <td className="whitespace-nowrap px-3.5 py-3.5 text-center font-mono text-[13px] text-text-secondary">
                      {pct}%
                    </td>
                  )}
                  <td
                    // `5-2` is another hyphen waiting to break.
                    className="whitespace-nowrap px-3.5 py-3.5 text-center font-mono text-[13px] text-text-muted"
                    title={
                      row.gameWinPct == null ? undefined : `${Math.round(row.gameWinPct * 100)}% of games won`
                    }
                  >
                    {games(row)}
                  </td>
                  {!isMobile && (
                    <td className="px-3.5 py-3.5">
                      {row.scenario && <ScenarioPill scenario={row.scenario} provisional={row.tied} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {anyTied && (
        <div className="border-t border-border px-4 py-2.5 text-[11px] text-text-muted">
          † Tied on rank. The outcome shown is the one for that row — which of the tied teams takes it
          isn&rsquo;t settled until the tiebreaker is.
        </div>
      )}
    </div>
  );
}
