/**
 * The Preview tab: what each side brings into this match.
 *
 * **Two extra requests, and only when this tab is open.** `GET /teams/:conf/:code` is five heavy queries
 * upstream and is documented as a read for one team, fetched because a user asked for that team — so it
 * is never loaded speculatively. On a fixture with games the Results tab is the default and this fires
 * only on a click; on one without, a preview is the entire reason someone opened the page.
 *
 * It costs nothing twice over: the query key is the one the team pages use, so clicking a team from here
 * needs no fetch, and arriving from a team page warms this.
 *
 * **Nothing here is on the match endpoint and nothing needs to be.** Season statistics, per-player rates,
 * top champions and a match history are what the team read exists to serve, and duplicating them onto a
 * fixture payload would be a second copy of the same aggregate keyed differently.
 *
 * Starters only, deliberately — a bench player is on the roster and not in this match, and a preview is
 * about who is going to play. The team's own page is where the whole squad lives.
 */

import { useQueries } from "@tanstack/react-query";
import {
  errorMessage,
  fmtPct,
  fmtRatio,
  roleLabel,
  type PlayerStatsRanked,
  type TeamDetail,
} from "../../lib/api";
import { queries } from "../../lib/queries";
import { joinRoster, type RosterEntry } from "../../lib/roster";
import { PlayerLink } from "../profile/PlayerLink";
import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { ChampionIcon } from "../ChampionIcon";
import { HeadToHead, asOne, asPct, asRatio, compare, compareText, type ComparisonRow } from "./HeadToHead";
import { MatchResultList } from "./MatchResultList";

interface Props {
  conf: string;
  codeA: string | null;
  codeB: string | null;
}

export function SeriesPreview({ conf, codeA, codeB }: Props) {
  // One `useQueries` rather than two `useQuery` calls, so a fixture with only one side known still runs
  // the hook the same number of times.
  const codes = [codeA, codeB].filter((c): c is string => c !== null);
  const results = useQueries({ queries: codes.map(code => queries.teamDetail(conf, code)) });

  if (codes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg2 px-4 py-6 text-center text-[13px] text-text-dim">
        Neither side is decided yet, so there is nothing to preview.
      </div>
    );
  }

  if (results.some(r => r.isPending)) {
    return <div className="py-10 text-center text-[13px] text-text-subtle">Loading the preview…</div>;
  }

  const failed = results.find(r => r.error);
  if (failed?.error) {
    return <div className="py-10 text-center text-[13px] text-ccs-red">{errorMessage(failed.error)}</div>;
  }

  const a = results[0]?.data ?? null;
  const b = codes.length > 1 ? (results[1]?.data ?? null) : null;

  if (a === null && b === null) {
    return (
      <div className="rounded-lg border border-border bg-bg2 px-4 py-6 text-center text-[13px] text-text-dim">
        Neither team could be loaded.
      </div>
    );
  }

  return (
    <>
      {a && b && <SeasonComparison a={a} b={b} />}

      {[a, b].map(team => (team === null ? null : <Starters key={team.code} team={team} conf={conf} />))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[a, b].map(team => (team === null ? null : <RecentGames key={team.code} team={team} conf={conf} />))}
      </div>
    </>
  );
}

// -------------------------------------------------------------- the comparison

/**
 * Season form, side by side.
 *
 * Only rendered when both sides are known: a single column of numbers with a label in the middle and a
 * dash on the other side is a comparison of a team against nothing.
 *
 * **Series and games are labelled separately and never mixed.** `record` is series — what the standings
 * rank on — while `wins`/`losses` off `teamstats` are individual games; a 2-1 series win is one series
 * win and three games, so an unlabelled figure overstates one of them by roughly 2.5×.
 */
function SeasonComparison({ a, b }: { a: TeamDetail; b: TeamDetail }) {
  const seriesPct = (t: TeamDetail): number | null => {
    if (!t.record) return null;
    const played = t.record.seriesWins + t.record.seriesLosses;
    return played === 0 ? null : t.record.seriesWins / played;
  };
  const seriesText = (t: TeamDetail): string =>
    t.record ? `${t.record.seriesWins}-${t.record.seriesLosses}` : "—";
  const gamesText = (t: TeamDetail): string => (t.hasStats ? `${t.wins}-${t.losses}` : "—");

  const rows: ComparisonRow[] = [
    compareText(
      "Series record",
      seriesText(a),
      seriesText(b),
      compare("", seriesPct(a), seriesPct(b), asPct).better,
    ),
    compareText("Game record", gamesText(a), gamesText(b), compare("", a.winrate, b.winrate, asPct).better),
    compare("Game win %", a.winrate, b.winrate, asPct),
    compareText("Avg game time", a.avgTime || "—", b.avgTime || "—", null),
    compare("K/D ratio", a.killDeathRatio, b.killDeathRatio, asRatio),
    compare("Avg kills", a.avgKills, b.avgKills, asOne),
    compare("First blood %", a.firstBloodPercent, b.firstBloodPercent, asPct),
    compare("Gold / min", a.goldMin, b.goldMin, v => String(Math.round(v))),
    compare("Gold diff @14", a.goldDiffAt14, b.goldDiffAt14, v => `${v > 0 ? "+" : ""}${Math.round(v)}`),
    compare("First tower %", a.firstTowerPercent, b.firstTowerPercent, asPct),
    compare("Avg dragons", a.avgDragonsTaken, b.avgDragonsTaken, asOne),
    compare("Avg barons", a.avgBaronsTaken, b.avgBaronsTaken, asOne),
  ];

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-bg2">
      <div className="border-b border-border bg-bg3 px-4 py-3">
        <span className="font-display text-sm tracking-widest text-text-bright">SEASON FORM</span>
      </div>
      <div className="px-4 py-3">
        <div className="mb-1 flex items-baseline justify-between font-heading text-[11px] font-bold tracking-wider text-text-secondary">
          <span>{a.code}</span>
          <span>{b.code}</span>
        </div>
        <HeadToHead rows={rows} />
      </div>

      {(!a.hasStats || !b.hasStats) && (
        <p className="border-t border-border px-4 py-2 text-[10px] text-text-dim">
          {!a.hasStats && !b.hasStats
            ? "Neither team has played a recorded game this season yet."
            : `${(!a.hasStats ? a : b).code} has no recorded games this season yet, so there is nothing to compare against.`}
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- the starters

/**
 * The stat columns, each with the width it gets under `table-fixed`.
 *
 * Widths are declared rather than left to the browser because the alternative is what this table used to
 * do: distribute the slack to whichever column had the loosest content, which put a hundred pixels of
 * nothing beside three champion icons and pushed the rest off the card.
 *
 * **Every width holds its widest content plus its `px-2`, and that is not negotiable.** Under
 * `table-fixed` a cell narrower than its `whitespace-nowrap` contents doesn't grow, it *overflows* —
 * the text runs under the neighbouring column and the two read as one smudged number. `K / D / A` at
 * 92px was ~120px of monospace, which is why it collided with `DMG/M`. Sized from the worst realistic
 * line (`10.4 / 10.2 / 15.6`, 18 monospace characters at 11px ≈ 119px) rather than the typical one.
 * The slack all comes out of Player, which had far more than it could use.
 */
const STARTER_COLUMNS = [
  { label: "GP", width: "w-[38px]" },
  { label: "KDA", width: "w-[50px]" },
  { label: "K / D / A", width: "w-[136px]" },
  { label: "CS/M", width: "w-[50px]" },
  { label: "DMG/M", width: "w-[56px]" },
  { label: "GOLD/M", width: "w-[58px]" },
  { label: "KP", width: "w-[50px]" },
  { label: "WIN%", width: "w-[56px]" },
] as const;

/**
 * The Champs column: three 24px icons, two 6px gaps, `pl-2 pr-4` — 108px exactly.
 *
 * 86px held 104px of icons, so the row's last column overhung `WIN%`. Declared as one constant
 * because the header and the cell have to agree on it and a drifting pair is what caused the overlap.
 */
const CHAMPS_WIDTH = "w-[108px]";

/**
 * The five declared starters with their season lines.
 *
 * Full width rather than two narrow columns: eight labelled stat columns don't fit in half a page, and
 * the two tables are in the same role order, so the roles still line up vertically for comparison.
 *
 * `joinRoster` is the same join every team card uses. A starter with no recorded games is the whole
 * reason to read the roster rather than the statistics, so the row stays and says so.
 */
function Starters({ team, conf }: { team: TeamDetail; conf: string }) {
  const starters = joinRoster(team.roster, team.players).entries.filter(e => e.starter);

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-bg2">
      <div className="flex items-center gap-2 border-b border-border bg-bg3 px-4 py-2.5">
        <TeamBadge
          team={{ name: team.name, color_primary: team.colorHex, color_accent: team.colorHex, logo_url: team.logo }}
          size={20}
        />
        <TeamLink conf={conf} code={team.code} className="min-w-0 no-underline">
          <span className="truncate font-heading text-xs font-semibold text-text hover:text-accent">
            {team.name}
          </span>
        </TeamLink>
        <span className="ml-auto font-heading text-[10px] uppercase tracking-wider text-text-dim">Starters</span>
      </div>

      {starters.length === 0 ? (
        <p className="px-4 py-3 text-xs text-text-dim">No roster set for this team.</p>
      ) : (
        <div className="overflow-x-auto">
          {/* `min-w-[800px]` is the point below which the fixed columns alone won't fit; under that the
              wrapper scrolls rather than crushing them. On a desktop card it never applies. */}
          <table className="w-full min-w-[800px] table-fixed border-collapse">
            <thead>
              <tr className="border-b border-border">
                {/*
                  `table-fixed` with a width on every column but Player. `w-full` on Player was worse than
                  the problem it solved: it claims the *whole* table width, the other ten columns are then
                  added on top, and the table ends up wider than its box — which is where the scrollbar and
                  the overhanging rows came from. Fixed layout instead lets Player take whatever is left
                  over and truncate when there isn't enough, so the stat columns keep their places and the
                  numbers stay right-aligned against the edge of the card.
                */}
                <th className="py-2 pl-4 pr-2 text-left font-heading text-[9px] font-normal uppercase tracking-wider text-text-dim">
                  Player
                </th>
                <th className="w-[46px] py-2 px-2 text-left font-heading text-[9px] font-normal uppercase tracking-wider text-text-dim">
                  Role
                </th>
                {STARTER_COLUMNS.map(({ label, width }) => (
                  <th
                    key={label}
                    className={`${width} whitespace-nowrap py-2 px-2 text-right font-heading text-[9px] font-normal uppercase tracking-wider text-text-dim`}
                  >
                    {label}
                  </th>
                ))}
                <th
                  className={`${CHAMPS_WIDTH} whitespace-nowrap py-2 pl-2 pr-4 text-right font-heading text-[9px] font-normal uppercase tracking-wider text-text-dim`}
                >
                  Champs
                </th>
              </tr>
            </thead>
            <tbody>
              {starters.map(e => (
                <StarterRow key={e.key} entry={e} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StarterRow({ entry }: { entry: RosterEntry<PlayerStatsRanked> }) {
  const p = entry.stats;
  const num = (v: number | null | undefined, digits = 2): string =>
    v === null || v === undefined ? "—" : fmtRatio(v, digits);
  const whole = (v: number | null | undefined): string =>
    v === null || v === undefined ? "—" : String(Math.round(v));

  return (
    <tr className="border-b border-border/40 last:border-b-0">
      {/* Truncation on the cell, not on a span inside it: under `table-fixed` the cell has a resolved
          width to overflow, and a Riot ID with a long tag is what makes that necessary. */}
      <td
        className="truncate py-2 pl-4 pr-2 font-heading text-xs font-semibold text-text-bright"
        title={entry.name}
      >
        <PlayerLink profileId={entry.profileId} className="text-text-bright no-underline hover:text-accent">{entry.name}</PlayerLink>
      </td>
      <td className="py-2 px-2 font-heading text-[10px] tracking-wider text-text-muted">
        {roleLabel(entry.role)}
      </td>

      {p === null ? (
        // Seven columns of dashes says less than one sentence does.
        <>
          <td colSpan={STARTER_COLUMNS.length} className="py-2 px-2 text-center text-[11px] italic text-text-dim">
            no recorded games
          </td>
          <td className="py-2 pl-2 pr-4" />
        </>
      ) : (
        <>
          <td className="py-2 px-2 text-right font-mono text-[11px] text-text-muted">{p.games}</td>
          <td className="py-2 px-2 text-right font-mono text-[11px] font-bold text-text-bright">
            {fmtRatio(p.kda)}
          </td>
          <td className="whitespace-nowrap py-2 px-2 text-right font-mono text-[11px] text-text-secondary">
            {num(p.avgKills, 1)} / {num(p.avgDeaths, 1)} / {num(p.avgAssists, 1)}
          </td>
          <td className="py-2 px-2 text-right font-mono text-[11px] text-text-muted">{num(p.csMin)}</td>
          <td className="py-2 px-2 text-right font-mono text-[11px] text-text-muted">{whole(p.damageMin)}</td>
          <td className="py-2 px-2 text-right font-mono text-[11px] text-text-muted">{whole(p.goldMin)}</td>
          <td className="py-2 px-2 text-right font-mono text-[11px] text-text-muted">
            {fmtPct(p.killParticipation)}
          </td>
          <td className="py-2 px-2 text-right font-mono text-[11px] text-text-muted">{fmtPct(p.winPercent)}</td>
          <td className="py-2 pl-2 pr-4">
            <div className="flex justify-end gap-1.5">
              {/* `src` rather than a lookup, because `Champ` already carries the resolved icon — and
                  it is the same URL the lookup would build, so the two paths can't disagree. */}
              {p.champs.slice(0, 3).map(ch => (
                <ChampionIcon
                  key={ch.champid}
                  src={ch.img}
                  name={ch.name}
                  title={`${ch.name} — ${ch.picks ?? 0} game${ch.picks === 1 ? "" : "s"}`}
                  size={24}
                  className="flex shrink-0"
                />
              ))}
            </div>
          </td>
        </>
      )}
    </tr>
  );
}

// ------------------------------------------------------------- recent games

const RECENT = 12;

/**
 * The recent games, most recent first, with what the team played in each.
 *
 * **Games, not series** — `matchlist` is one row per game, so a 2-1 contributes three rows, and calling
 * this "recent matches" would misreport a team's run. Sorted here rather than taken in served order: the
 * endpoint's direction isn't part of its contract and "recent" needs one. Dates, not season days — see
 * `CLAUDE.md`.
 *
 * The champions are the point of showing a dozen rather than a handful: five icons a row is a read on what
 * a team actually plays, which three rows of it isn't. They come off `roles`, which carries a champion
 * **name** and no icon — the one place on the site that resolves artwork from a name rather than an id,
 * and so the only place a name-keyed index being wrong was ever visible. See `lib/championData.ts`.
 */
function RecentGames({ team, conf }: { team: TeamDetail; conf: string }) {
  const recent = [...team.matchlist]
    .sort((x, y) => new Date(y.startTime).getTime() - new Date(x.startTime).getTime())
    .slice(0, RECENT);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg2">
      <div className="flex items-baseline gap-2 border-b border-border bg-bg3 px-4 py-2.5">
        <TeamLink conf={conf} code={team.code} className="min-w-0 no-underline">
          <span className="truncate font-heading text-xs font-semibold text-text hover:text-accent">
            {team.name}
          </span>
        </TeamLink>
        <span className="ml-auto shrink-0 font-heading text-[10px] uppercase tracking-wider text-text-dim">
          Recent games
        </span>
      </div>

      <MatchResultList matches={recent} conf={conf} />
    </div>
  );
}
