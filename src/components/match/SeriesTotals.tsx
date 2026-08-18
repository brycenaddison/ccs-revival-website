/**
 * The series added up, above the games that make it up.
 *
 * Two things a game-by-game list can't answer: who won the series on aggregate rather than on the
 * scoreline (a 3-2 where one team out-killed the other two to one is a different match from a 3-2 that
 * went the distance), and who the series belonged to individually.
 *
 * Everything here is `lib/seriesStats.ts` over data already loaded — **added up by team code, not by
 * side**, because teams swap ends between games. It is deliberately not a second opinion on the result:
 * `MatchOutcome` is counted upstream from the fixture's own games and the header renders that.
 *
 * **Two cards, not one.** They answer different questions and they are read differently: the totals are
 * a paired comparison scanned down the middle, while the leaders are independent rows. Sharing a frame
 * meant one header for both and no way to caption either.
 */

import { fmtRatio, fmtSec } from "../../lib/api";
import type { SeriesGame } from "../../lib/api";
import {
  kdaOf,
  leaderBy,
  mean,
  perMinute,
  seriesStats,
  type SeriesPlayerTotals,
  type SeriesStats,
} from "../../lib/seriesStats";
import { HeadToHead, asInt, asK, compare, type ComparisonRow } from "./HeadToHead";
import { TeamNameLink, type TeamNamer } from "./TeamNameLink";
import { PlayerLink } from "../profile/PlayerLink";

/** A gold lead reads as a lead — the sign is the whole content of the number. */
const signed = (v: number): string => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;

interface Props {
  games: readonly SeriesGame[];
  codeA: string;
  codeB: string;
  nameOf: TeamNamer;
}

export function SeriesTotals({ games, codeA, codeB, nameOf }: Props) {
  const stats = seriesStats(games, codeA, codeB);

  // Nothing to add up. The games list below still has something to say about each one — a forfeit, or a
  // game Riot never served — so this removes itself rather than printing two columns of zeroes.
  if (stats.counted === 0) return null;

  return (
    // Totals wider than leaders: fifteen paired values need the room, and a leader row is a name and a
    // number. `items-start` so the shorter card doesn't stretch to match the taller one.
    <div className="mb-4 grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <TotalsCard stats={stats} codeA={codeA} codeB={codeB} nameOf={nameOf} />
      <LeadersCard stats={stats} nameOf={nameOf} />
    </div>
  );
}

// --------------------------------------------------------------------- totals

function TotalsCard({
  stats,
  codeA,
  codeB,
  nameOf,
}: {
  stats: SeriesStats;
  codeA: string;
  codeB: string;
  nameOf: TeamNamer;
}) {
  const { a, b } = stats;

  const rows: ComparisonRow[] = [
    compare("Kills", a.kills, b.kills, asInt),
    compare("Deaths", a.deaths, b.deaths, asInt, "low"),
    compare("Assists", a.assists, b.assists, asInt),
    compare("Multi-kills", a.multiKills, b.multiKills, asInt),
    compare("Solo kills", a.soloKills, b.soloKills, asInt),
    compare("Damage", a.damage, b.damage, asK),
    compare("Gold", a.gold, b.gold, asK),
    compare("Gold diff @14", a.goldDiff14, b.goldDiff14, signed),
    compare("CS", a.cs, b.cs, asInt),
    compare("Vision score", a.visionScore, b.visionScore, asInt),
    compare("Towers", a.towers, b.towers, asInt),
    compare("Dragons", a.dragons, b.dragons, asInt),
    compare("Barons", a.barons, b.barons, asInt),
    compare("Heralds", a.heralds, b.heralds, asInt),
    compare("Voidgrubs", a.grubs, b.grubs, asInt),
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border bg-bg3 px-4 py-3">
        <span className="font-display text-sm tracking-widest text-text-bright">SERIES TOTALS</span>
        <span className="font-mono text-[11px] text-text-dim">
          {stats.duration !== null && <>{fmtSec(stats.duration)} played</>}
          {stats.longest !== null && stats.counted > 1 && (
            <> · longest {fmtSec(stats.longest.duration)} (G{stats.longest.game})</>
          )}
        </span>
      </div>

      <div className="px-4 py-3">
        <div className="mb-1 flex items-baseline justify-between gap-2 font-heading text-[11px] font-bold tracking-wider text-text-secondary">
          <TeamNameLink code={codeA} nameOf={nameOf} className="text-text-secondary" />
          <TeamNameLink code={codeB} nameOf={nameOf} className="text-text-secondary" />
        </div>
        <HeadToHead rows={rows} />
      </div>

      {/*
        Said out loud rather than left to be inferred from a total that looks low. A forfeited game and a
        game Riot never served both count for the scoreline in the header and contribute nothing here, so
        without this the two disagree for no visible reason.
      */}
      {stats.counted < stats.total && (
        <p className="border-t border-border px-4 py-2 text-[10px] text-text-dim">
          From {stats.counted} of {stats.total} games — the{" "}
          {stats.total - stats.counted === 1 ? "other has" : "others have"} no statistics recorded, though{" "}
          {stats.total - stats.counted === 1 ? "its" : "their"} result still counts.
        </p>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- leaders

interface LeaderMetric {
  label: string;
  /** Sort key, and `null` for a player the metric wasn't measured for — those aren't candidates. */
  value: (p: SeriesPlayerTotals) => number | null;
  format: (v: number) => string;
  /**
   * Drop the whole row when the best value is zero. True for a count, where "most pentakills: 0" is not a
   * leader — and **false for anything signed**, where zero and negative are real answers: if every player
   * were level at fourteen minutes, that is the finding.
   */
  hideZero?: boolean;
}

/**
 * The leaderboards, mixing totals, ratios and averages — because which one is meaningful depends on the
 * metric.
 *
 * A **total** is right for a count over a best-of: "most damage in the series" is the honest superlative,
 * and a rate would flatter whoever played fewest games. A **rate** is right for anything a long game
 * inflates, so damage and farm are also given per minute *played* rather than per game — a 45-minute game
 * and a 22-minute one are not two equal samples. Damage per gold is the quotient of the player's series
 * totals, so each point of damage and gold has the same weight regardless of which game it came from. An
 * **average** is right for a snapshot: a gold lead at fourteen minutes is a per-game fact, and adding four
 * of them together produces a number with no meaning.
 */
const LEADERS: LeaderMetric[] = [
  { label: "Damage", value: p => p.damage, format: asK, hideZero: true },
  { label: "Damage / min", value: p => perMinute(p.damage, p.seconds), format: v => v.toFixed(0), hideZero: true },
  {
    label: "DMG / gold",
    value: p => (p.gold > 0 ? p.damage / p.gold : null),
    format: fmtRatio,
    hideZero: true,
  },
  { label: "Kills", value: p => p.kills, format: v => String(v), hideZero: true },
  { label: "Assists", value: p => p.assists, format: v => String(v), hideZero: true },
  { label: "KDA", value: kdaOf, format: v => fmtRatio(v), hideZero: true },
  { label: "Gold", value: p => p.gold, format: asK, hideZero: true },
  { label: "CS", value: p => p.cs, format: v => String(v), hideZero: true },
  { label: "CS / min", value: p => perMinute(p.cs, p.seconds), format: v => v.toFixed(1), hideZero: true },
  { label: "Vision", value: p => p.visionScore, format: v => String(v), hideZero: true },
  { label: "Solo kills", value: p => p.soloKills, format: v => String(v), hideZero: true },
  { label: "Multi-kills", value: p => p.multiKills, format: v => String(v), hideZero: true },
  { label: "Avg gold @8", value: p => mean(p.goldDiff8, p.goldDiff8Games), format: signed },
  { label: "Avg gold @14", value: p => mean(p.goldDiff14, p.goldDiff14Games), format: signed },
];

function LeadersCard({ stats, nameOf }: { stats: SeriesStats; nameOf: TeamNamer }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg2">
      <div className="border-b border-border bg-bg3 px-4 py-3">
        <span className="font-display text-sm tracking-widest text-text-bright">SERIES LEADERS</span>
      </div>

      <div className="px-4 py-1.5">
        {LEADERS.map(metric => {
          const player = leaderBy(stats.players, metric.value);
          if (player === null) return null;

          const best = metric.value(player);
          if (best === null || (metric.hideZero && best <= 0)) return null;

          return (
            <Leader
              key={metric.label}
              label={metric.label}
              player={player}
              value={metric.format(best)}
              nameOf={nameOf}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * One leader: the metric, who led it, and the number.
 *
 * The team code sits **in front of the name** rather than in a column of its own. It is a three-letter tag
 * on a person, not an independent value — a column for it took width from the names and read as a table of
 * teams. The full name is the tooltip.
 */
function Leader({
  label,
  player,
  value,
  nameOf,
}: {
  label: string;
  player: SeriesPlayerTotals;
  value: string;
  nameOf: TeamNamer;
}) {
  const team = nameOf(player.team);

  return (
    <div className="flex items-baseline gap-2 border-b border-border/50 py-1.5 last:border-b-0">
      <span className="w-17 shrink-0 font-heading text-[9px] uppercase tracking-wider text-text-dim">
        {label}
      </span>
      <span className="flex min-w-0 grow items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-[10px] text-text-dim" title={team?.name ?? player.team}>
          {player.team}
        </span>
        <PlayerLink profileId={player.profileId} className="min-w-0 truncate text-[12px] text-text no-underline hover:text-accent" title={player.name}>
          {player.name}
        </PlayerLink>
      </span>
      <span className="shrink-0 text-right font-mono text-[12px] font-bold text-text-bright">{value}</span>
    </div>
  );
}
