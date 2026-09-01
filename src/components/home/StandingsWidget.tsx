/**
 * The Home page's standings panel — one league at a time, with a picker when several are running.
 *
 * **Two sources, and the fallback is not a nicety.** The panel was written against the season
 * document, whose group phases are the only place phase-scoped records exist. With no group phase
 * configured — which is every league until somebody builds one — `standingsPhase` answers null, and
 * the panel used to fall through to a flat list of every active conference's teams with no records
 * on it at all. That list is gone. Season-wide `/standings/:conf` is the fallback, and the header
 * says which of the two is on screen.
 *
 * Why the group phase still leads where there is one: a group table is scoped to its phase, while
 * season-wide records count playoff results into the same column. Both are true; only one of them
 * is the table that produced the seeding.
 *
 * The conference strip is the outer choice, held **locally**. It must not call `setSelection` —
 * that collapses `selectedConfs` to the one conf, which makes the strip vanish the instant it is
 * used. `StandingsView` carries the same warning for the same reason.
 *
 * **One number, and it is the series record.** At 280px there is room for a rank, a badge, a team
 * name and a single column; the game score was the third of those and it lost. Truncating a team
 * name to fit a secondary tiebreaker is the wrong trade on a glanceable panel — the Standings tab
 * carries games, game win %, and the whole legend.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { useSeason } from "../../hooks/useSeason";
import { useLeague } from "../../lib/leagueContext";
import { groupLabels, toBadge } from "../../lib/leagueAdapters";
import { toneForLevel } from "../../lib/scenarioTones";
import { queries } from "../../lib/queries";
import { standingsPhase, type SeasonScenario } from "../../lib/api";

interface Props {
  /** The conferences the season selection resolves to. Usually `useLeague().selectedConfs`. */
  confs: readonly string[];
}

/** What a row needs to render, whichever source it came from. */
interface PanelRow {
  code: string;
  name: string;
  logo?: string;
  color: number | null;
  colorHex: string;
  colorSecondary?: number | null;
  place: string;
  seriesWins: number;
  seriesLosses: number;
  gameWins: number;
  gameLosses: number;
  /** Group phases only: the playoff/elimination outcome this row is currently on for. */
  scenario: SeasonScenario | null;
  tied: boolean;
}

export function StandingsWidget({ confs }: Props) {
  const { tournaments } = useLeague();

  // Resolved rather than stored, so a stale pick after the season selection changes falls back to
  // the first conference instead of showing an empty panel.
  const [confPick, setConfPick] = useState<string | null>(null);
  const conf = (confPick && confs.includes(confPick) ? confPick : confs[0]) ?? null;

  // Codename first, full name otherwise — `groupLabels` is the one place that rule lives, so this
  // strip, Standings, Stats and Teams cannot name the same division differently.
  const labels = groupLabels(tournaments, confs);

  return conf === null ? null : (
    // Keyed on the conf so switching one throws away the group selection with it: group names are
    // conf-scoped, so carrying one across would select nothing.
    <div className="overflow-hidden rounded-md border border-border bg-bg2">
      {confs.length > 1 && (
        <div className="flex flex-nowrap gap-3 overflow-x-auto overflow-y-hidden border-b border-border px-3 py-2">
          {confs.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setConfPick(c)}
              className={`shrink-0 cursor-pointer border-none bg-transparent p-0 font-heading text-[11px] uppercase tracking-wider ${
                c === conf ? "text-text-bright" : "text-text-muted"
              }`}
            >
              {labels.get(c) ?? c.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      <ConfPanel key={conf} conf={conf} />
    </div>
  );
}

function ConfPanel({ conf }: { conf: string }) {
  const { season, loading: seasonLoading } = useSeason(conf);
  // Always enabled rather than only when the season turns out to have no group phase: gating it
  // would make the common case a waterfall of two round trips to show one table.
  const { data: seasonWide, isLoading: standingsLoading } = useQuery(queries.standings(conf));

  const phase = standingsPhase(season);
  const groups = phase?.groups ?? [];
  const [groupName, setGroupName] = useState<string | null>(null);
  const group = groups.find(g => g.name === groupName) ?? groups[0] ?? null;

  const rows: PanelRow[] =
    group && group.standings.length > 0
      ? group.standings.map(row => ({ ...row, scenario: row.scenario, tied: row.tied }))
      : (seasonWide ?? []).map(row => ({
          code: row.code,
          name: row.name,
          logo: row.logo ?? undefined,
          color: row.color,
          colorHex: row.colorHex,
          colorSecondary: row.colorSecondary ?? null,
          place: row.place,
          seriesWins: row.seriesWins,
          seriesLosses: row.seriesLosses,
          gameWins: row.gameWins,
          gameLosses: row.gameLosses,
          scenario: null,
          tied: false,
        }));

  // "Nothing yet" and "nothing at all" are different states, and swapping the panel out from under
  // a reader mid-load is what showing a fallback while one is in flight looks like.
  if (rows.length === 0) return seasonLoading || standingsLoading ? null : <Empty />;

  const usingGroups = group !== null && group.standings.length > 0;

  return (
    <>
      {usingGroups && groups.length > 1 ? (
        <div className="flex border-b border-border">
          {groups.map(g => (
            <button
              key={`${g.ordinal}-${g.name}`}
              onClick={() => setGroupName(g.name)}
              className={`flex-1 cursor-pointer border-none py-2.5 font-display text-[13px] tracking-widest ${
                g.name === group.name
                  ? "border-b-2 border-b-brand bg-bg-input text-text-bright"
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
            {(usingGroups ? phase?.name ?? "STANDINGS" : "STANDINGS").toUpperCase()}
          </span>
        </div>
      )}

      {/*
        `whitespace-nowrap` on the numeric column is not cosmetic. This panel is 280px wide
        (`Home.tsx`), the table lays out automatically, and **`W-L` breaks at its hyphen** — as does
        a record like `5-2`. So a group whose longest team name is a few characters longer than the
        next group's squeezes the column until the heading splits over two lines. Pinning it makes
        the team column absorb the pressure instead, which it can: it truncates.
      */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-border px-3 py-2 text-left font-heading text-[10px] font-normal tracking-wider text-text-muted">
              TEAM
            </th>
            <th className="whitespace-nowrap border-b border-border px-3 py-2 text-right font-heading text-[10px] font-normal text-text-muted">
              W-L
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Rendered in the order served. Never re-sorted and never renumbered by row index — the
              ranking resolves head-to-head, which nothing on this page could reconstruct. */}
          {rows.map(row => {
            const tone = row.scenario ? toneForLevel(row.scenario.level) : null;

            return (
              <tr
                key={`${row.code}-${row.place}`}
                style={{
                  borderLeft: `4px solid ${tone?.line ?? "transparent"}`,
                  background: tone?.bg,
                }}
              >
                <td className="px-3.5 py-2.5">
                  <TeamLink
                    conf={conf}
                    code={row.code}
                    className="group flex min-w-0 items-center gap-2 no-underline"
                  >
                    <span
                      className="min-w-[14px] text-right font-mono text-[10px] font-bold"
                      style={{ color: tone?.fg ?? "var(--text-muted)" }}
                    >
                      {row.place}
                    </span>
                    <TeamBadge team={toBadge(row)} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-heading text-[13px] font-medium text-text group-hover:text-brand">
                        {row.name}
                      </span>
                      {row.scenario && (
                        <span
                          className="truncate font-heading text-[8px] font-bold uppercase tracking-wider"
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
                <td
                  className="whitespace-nowrap px-3 text-right font-mono text-[13px] text-text-secondary"
                  // The games are still worth having somewhere, and a hover is somewhere: it costs no
                  // width, and the column it was cut from is the one being hovered.
                  title={
                    row.gameWins + row.gameLosses === 0
                      ? "No games played yet"
                      : `${row.gameWins}-${row.gameLosses} in games`
                  }
                >
                  {row.seriesWins}-{row.seriesLosses}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function Empty() {
  return (
    <div className="px-4 py-6 text-center text-[13px] text-text-dim">
      No standings yet.
    </div>
  );
}
