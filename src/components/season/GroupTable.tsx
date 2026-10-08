/**
 * One group's standings table.
 *
 * **Rows are rendered exactly in the order given, and never renumbered by index.** The order and the
 * ranks both come from the API, which applies the league's chosen tiebreakers in turn. Head-to-head
 * cannot be recomputed from anything this page loads, and teams level on every rule legitimately
 * *share* a rank, so renumbering by row would invent an order the league does not recognize. `place`
 * carries the tie marker ("T-2").
 *
 * **Rule columns** show the figures a tiebreaker ranks on that the base columns do not already show:
 * series and game differential, game win % and the average win and loss times. Each appears only when
 * the league ranks on it, in the league's order, since that is when it explains an order. They are
 * desktop-only, like win %. Head-to-head has no per-row figure, so the "How ties are broken" note is
 * what explains it. The differentials are the row's own wins minus losses, nothing re-ranked.
 *
 * Records here are scoped to this phase's own match days: a group table never counts a result from
 * the playoffs, which is why these rows do not come from `/standings/:conf`.
 *
 * A bracket phase's standings table renders here too, without scenarios: its rows are group rows with
 * no outcomes to resolve.
 */

import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { ScenarioPill } from "./ScenarioPill";
import { toBadge } from "../../lib/leagueAdapters";
import { toneForLevel } from "../../lib/scenarioTones";
import { AvgGameTime } from "./AvgGameTime";
import {
  tiebreakerInfos,
  type KnownTiebreakerId,
  type SeasonScenario,
  type SeasonStandingsRow,
  type TiebreakerDocument,
} from "../../lib/api";

type TableRow = SeasonStandingsRow & { scenario?: SeasonScenario | null };

/** Rules with a per-row figure the base columns (W, L, Win %, Games) do not already show. */
const RULE_COLUMNS = {
  series_differential: "Series diff",
  game_differential: "Game diff",
  game_win_pct: "Game %",
  avg_win_time: "Avg win",
  avg_loss_time: "Avg loss",
} as const satisfies Partial<Record<KnownTiebreakerId, string>>;

type RuleColumnId = keyof typeof RULE_COLUMNS;

export interface RuleColumn {
  id: RuleColumnId;
  /** The served rule name, for assistive technology; the header shows the short form. */
  label: string;
}

const isRuleColumn = (id: string): id is RuleColumnId => id in RULE_COLUMNS;

/**
 * The rule columns a table shows: the league's rules that have one, in the league's order, optionally
 * limited to `only`. Empty without a tiebreaker read, so a failed read only drops the columns.
 */
export function ruleColumns(doc: TiebreakerDocument | undefined, only?: readonly RuleColumnId[]): RuleColumn[] {
  if (!doc) return [];
  return tiebreakerInfos(doc).flatMap(info =>
    isRuleColumn(info.id) && (!only || only.includes(info.id)) ? [{ id: info.id, label: info.label }] : [],
  );
}

/** A signed count, so a differential reads as one: "+2", "0", "-1". */
const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

function RuleCell({ id, row }: { id: RuleColumnId; row: TableRow }) {
  const content =
    id === "series_differential" ? (
      signed(row.seriesWins - row.seriesLosses)
    ) : id === "game_differential" ? (
      signed(row.gameWins - row.gameLosses)
    ) : id === "game_win_pct" ? (
      row.gameWinPct === null ? "—" : `${Math.round(row.gameWinPct * 100)}%`
    ) : (
      <AvgGameTime seconds={id === "avg_win_time" ? row.avgWinSeconds : row.avgLossSeconds} />
    );
  return (
    <td className="whitespace-nowrap px-3.5 py-3.5 text-center font-mono text-[13px] text-text-muted">{content}</td>
  );
}

interface Props {
  group: { name: string; standings: readonly TableRow[] };
  /** Suppressed when the phase has exactly one group — an unnamed single group *is* the phase. */
  showName: boolean;
  /** One line under the name, such as when the table next moves. */
  subtitle?: string;
  /** False for a bracket table, which has no outcomes: no Scenario column and no tie footnote. */
  scenarios?: boolean;
  emptyText?: string;
  /** From `ruleColumns`: the rules this table explains with a column of their own. */
  rules: readonly RuleColumn[];
  isMobile: boolean;
}

/** Game record as text, or "—" for a team with no games. */
function games(row: TableRow): string {
  return row.gameWins + row.gameLosses === 0 ? "—" : `${row.gameWins}-${row.gameLosses}`;
}

export function GroupTable({
  group,
  showName,
  subtitle,
  scenarios = true,
  emptyText = "No teams in this group yet.",
  rules,
  isMobile,
}: Props) {
  // The dagger explains a tied row's outcome; a table with no outcomes shows the tie in `place` alone.
  const anyTied = scenarios && group.standings.some(r => r.tied);
  const scenarioColumn = scenarios && !isMobile;
  const ruleCols = isMobile ? [] : rules;
  const headers: string[] = ["#", "Team", "W", "L", ...(isMobile ? [] : ["Win %"]), "Games"];

  return (
    <div className="mb-4 overflow-hidden rounded-md border border-border bg-bg2">
      {showName && (
        <div className="border-b border-border px-4 py-3">
          <span className="font-display text-[15px] text-text-bright">{group.name}</span>
          {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        </div>
      )}

      {group.standings.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-text-dim">{emptyText}</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map(h => (
                <th
                  key={h}
                  // Nothing here wraps. `Win %` and `Games` are short enough to look safe and are
                  // not: a narrow screen breaks them over two lines and the header row doubles in
                  // height. The team column is the one that gives, and it truncates.
                  className={`whitespace-nowrap border-b border-border px-3.5 py-3 font-heading text-[10px] font-normal text-text-muted ${
                    h === "#" || h === "Team" ? "text-left" : "text-center"
                  }`}
                >
                  {h}
                </th>
              ))}
              {ruleCols.map(rule => (
                <th
                  key={rule.id}
                  className="whitespace-nowrap border-b border-border px-3.5 py-3 text-center font-heading text-[10px] font-normal text-text-muted"
                >
                  <span aria-hidden="true">{RULE_COLUMNS[rule.id]}</span>
                  <span className="sr-only">{rule.label}</span>
                </th>
              ))}
              {/* On mobile the scenario moves under the team name — a pill in its own column would
                  push the record off the screen. */}
              {scenarioColumn && (
                <th className="border-b border-border px-3.5 py-3 text-left font-heading text-[10px] font-normal text-text-muted">
                  Scenario
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
                  key={`${row.teamId ?? row.code}-${row.position}`}
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
                    {anyTied && row.tied && <span className="align-super text-[10px]">†</span>}
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
                      teamId={row.teamId}
                      className="group flex min-w-0 items-center gap-2.5 no-underline"
                    >
                      <TeamBadge team={toBadge(row)} size={28} />
                      <div className="min-w-0">
                        <div className="truncate">
                          <span className="font-heading text-sm font-medium text-text group-hover:text-brand">
                            {row.name}
                          </span>
                          <span className="ml-2 font-mono text-[10px] text-text-dim">{row.code}</span>
                        </div>
                        {isMobile && row.scenario && (
                          <span
                            className="block truncate font-heading text-[9px] font-bold "
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
                  {ruleCols.map(rule => (
                    <RuleCell key={rule.id} id={rule.id} row={row} />
                  ))}
                  {scenarioColumn && (
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
