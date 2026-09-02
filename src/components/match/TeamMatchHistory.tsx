/**
 * A team's games, grouped into the series they were played in.
 *
 * The team page's matchlist is one row per game, and a flat list of thirty games reads as thirty
 * unrelated results. The profile page groups its games under series cards and reads far better, so
 * this does the same for a team, in the same shape: the score chip, "vs", the opponent with its logo
 * and full name, and the placement and date on the right; then the games beneath, one dense row each,
 * the whole row a link to the game. The team's own name is not in the header: this is its page.
 *
 * **Where the fixture comes from.** Every matchlist row carries `scheduleMatchId` and `phase`, the same
 * projections `GET /profiles/:id` serves on a game, so a series is keyed on its fixture id and labeled
 * from its phase with no second read. Both are `null` on a legacy season's rows, which predate the
 * schedule and the phase list, and there the grouping falls back to `(seasonDay, opponent)`, which is
 * the `series` view's key and merges a double-header, as `/matches/:conf` does. A fixture id keeps two
 * series between one pair on one day apart, which is the reason to prefer it. This component used to
 * rebuild both fields by joining the rows to `GET /tournaments/:conf/schedule`; that join is gone, and
 * must not come back, since the server's resolution through `schedule_match` is the only way to reach a
 * bracket round.
 *
 * Team names and logos come off `GET /teams/:conf`, which the team page has already loaded for its own
 * roster, so that costs no request.
 */

import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { MatchlistEntry, MatchlistRoleKey, PhaseRef, TeamRecord } from "../../lib/api";
import { fmtSec, placementLabel } from "../../lib/api";
import { queries } from "../../lib/queries";
import { signed } from "../../lib/statFormat";
import { fmtDay } from "../../lib/utils";
import { useChampions } from "../../hooks/useChampions";
import { ChampionIcon } from "../ChampionIcon";
import { TeamChip } from "../profile/profileUi";
import { BanIcons } from "./BanIcons";

const LANES: readonly MatchlistRoleKey[] = ["top", "jg", "mid", "bot", "sup"];

interface Series {
  key: string;
  opponent: string;
  seasonDay: number;
  scheduleMatchId: number | null;
  phase: PhaseRef | null;
  wins: number;
  losses: number;
  /** Earliest game's start, for the caption. */
  startTime: string;
  games: MatchlistEntry[];
}

function groupSeries(matches: readonly MatchlistEntry[]): Series[] {
  const byKey = new Map<string, Series>();
  for (const m of matches) {
    const key = m.scheduleMatchId !== null ? `fixture:${m.scheduleMatchId}` : `${m.seasonDay}:${m.opponent}`;
    let series = byKey.get(key);
    if (!series) {
      series = {
        key,
        opponent: m.opponent,
        seasonDay: m.seasonDay,
        scheduleMatchId: m.scheduleMatchId,
        phase: m.phase,
        wins: 0,
        losses: 0,
        startTime: m.startTime,
        games: [],
      };
      byKey.set(key, series);
    }
    series.games.push(m);
    if (m.win) series.wins += 1;
    else series.losses += 1;
    if (m.startTime < series.startTime) series.startTime = m.startTime;
  }
  const out = [...byKey.values()];
  for (const s of out) s.games.sort((a, b) => a.game - b.game || a.startTime.localeCompare(b.startTime));
  out.sort((a, b) => b.startTime.localeCompare(a.startTime));
  return out;
}

/** The series header's columns: the score, "vs", the opponent, and the placement and date. */
const HEADER_COLUMNS = "grid-cols-[auto_auto_minmax(0,1fr)_fit-content(45%)]";

export function TeamMatchHistory({ matches, conf }: { matches: readonly MatchlistEntry[]; conf: string }) {
  const champions = useChampions();
  const { data: teams } = useQuery(queries.teamsForConf(conf));
  const series = useMemo(() => groupSeries(matches), [matches]);
  const teamOf = useMemo(() => {
    const index = new Map<string, TeamRecord>((teams ?? []).map(t => [t.code, t]));
    return (code: string): TeamRecord | null => index.get(code) ?? null;
  }, [teams]);

  if (series.length === 0) {
    return <p className="rounded-lg border border-border bg-bg2 px-4 py-6 text-sm text-text-dim">No games played yet.</p>;
  }

  return (
    <div className={`grid gap-x-3 gap-y-3 ${HEADER_COLUMNS}`}>
      {series.map(s => {
        const won = s.wins > s.losses;
        const placement = placementLabel(s.phase, s.seasonDay);
        return (
          <section key={s.key} className="col-span-4 grid grid-cols-subgrid overflow-hidden rounded-lg border border-border bg-bg2">
            {/*
              The whole header opens the series page when there is one, while the opponent's chip still
              opens its own page: the series link is an overlay sibling and the content sits above it
              with `pointer-events-none`, the chip opting back in. Same construction as the profile's
              card, and for the same reason: an anchor cannot contain anchors.
            */}
            <div
              className={`relative col-span-4 grid grid-cols-subgrid items-center px-3 py-2.5 transition-colors ${
                s.scheduleMatchId !== null ? "hover:bg-bg-input" : ""
              }`}
            >
              {s.scheduleMatchId !== null && (
                <Link to={`/match/${s.scheduleMatchId}`} aria-label="Open this series" className="absolute inset-0 z-0" />
              )}
              <div className="pointer-events-none relative z-10 col-span-4 grid grid-cols-subgrid items-center gap-x-3">
                <span
                  className={`rounded px-2 py-0.5 font-display text-lg leading-none ${
                    won ? "bg-ccs-green/20 text-ccs-green" : s.wins === s.losses ? "bg-bg-input text-text-muted" : "bg-ccs-red/20 text-ccs-red"
                  }`}
                >
                  {s.wins}–{s.losses}
                </span>
                <span className="font-heading text-xs text-text-muted">vs</span>
                <span className="-mx-1 flex min-w-0 overflow-hidden px-1">
                  <TeamChip conf={conf} code={s.opponent} team={teamOf(s.opponent)} className="pointer-events-auto w-fit max-w-full rounded px-1 hover:bg-brand/20" />
                </span>
                <span className="min-w-0 truncate text-right text-[11px] text-text-dim">
                  {placement && <span className="text-text-secondary">{placement} · </span>}
                  {fmtDay(s.startTime)}
                </span>
              </div>
            </div>

            <ul className="col-span-4 flex flex-col overflow-x-auto">
              {s.games.map(g => (
                <TeamGameRow key={g.matchId} game={g} champions={champions} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One game from the team's side, as a single link.
 *
 * No opponent and no date: both are on the header above, the same for every row. What the row has room
 * for instead is the draft, labeled, and the numbers that say how the game went: K/D/A, gold difference
 * at 14, objectives, duration and side. Fixed tracks so the columns line up down the card; the whole row
 * is one anchor, so there is nothing inside it competing for the click.
 */
function TeamGameRow({ game, champions }: { game: MatchlistEntry; champions: ReturnType<typeof useChampions> }) {
  const tone = game.win ? "bg-ccs-green/15 hover:bg-ccs-green/25" : "bg-ccs-red/15 hover:bg-ccs-red/25";
  return (
    <li className={`border-t border-border/40 ${tone}`}>
      <Link
        to={`/game/${encodeURIComponent(game.matchId)}`}
        aria-label={`Open game ${game.game}, ${game.win ? "win" : "loss"}`}
        className="grid min-w-[760px] grid-cols-[48px_176px_176px_minmax(0,1fr)_64px_84px_92px_44px_36px] items-center gap-x-3 px-3 py-2 no-underline"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-sm font-heading text-xs font-bold ${
              game.win ? "bg-ccs-green/20 text-ccs-green" : "bg-ccs-red/20 text-ccs-red"
            }`}
          >
            {game.win ? "W" : "L"}
          </span>
          <span className="font-mono text-[10px] text-text-dim">G{game.game}</span>
        </span>

        <Draft label="Picks">
          {LANES.map(lane => {
            const player = game.roles[lane];
            return (
              <ChampionIcon
                key={lane}
                champion={player?.champ}
                lookup={champions}
                fallbackLabel={player?.champ ?? "—"}
                size={22}
                tile
                decorative
                className="flex shrink-0"
              />
            );
          })}
        </Draft>

        <Draft label="Bans">
          {game.bans.length > 0 ? (
            <BanIcons bans={game.bans} champions={champions} size={22} tile className="flex shrink-0" />
          ) : (
            <span className="text-[10px] text-text-secondary">none</span>
          )}
        </Draft>

        <span />

        <span className="whitespace-nowrap text-center font-mono text-[11px] text-text-secondary">
          {game.kills}/{game.deaths}/{game.assists}
        </span>
        <span className="whitespace-nowrap text-left font-mono text-[11px] text-text-secondary" title="Gold difference at 14:00">
          <span className="text-text-dim">GD14 </span>
          {game.gd14 === null ? "—" : signed(game.gd14)}
        </span>
        <span className="flex items-center justify-start gap-2 whitespace-nowrap font-mono text-[10px] text-text-secondary">
          <Objective label="T" title="Towers" value={game.towers} />
          <Objective label="D" title="Dragons" value={game.dragons} />
          <Objective label="B" title="Barons" value={game.barons} />
        </span>
        <span className="whitespace-nowrap text-center font-mono text-[11px] text-text-secondary">{fmtSec(game.time)}</span>
        <span className={`text-center font-heading text-[10px] font-semibold ${game.blueside ? "text-side-blue" : "text-side-red"}`}>
          {game.blueside ? "Blue" : "Red"}
        </span>
      </Link>
    </li>
  );
}

/** A labeled strip of draft icons: "Picks" or "Bans", then the five tiles. */
function Draft({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span className="mr-1 w-8 shrink-0 font-heading text-[9px] font-semibold text-text-secondary">{label}</span>
      {children}
    </span>
  );
}

function Objective({ label, title, value }: { label: string; title: string; value: number | null }) {
  return (
    <span title={title}>
      <span className="text-text-dim">{label}</span> {value ?? "—"}
    </span>
  );
}
