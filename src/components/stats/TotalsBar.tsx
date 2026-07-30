/**
 * Cumulative league totals across the top of the Stats page.
 *
 * The old dashboard had a thin version of this (players, matches, teams, date range) and it was the first
 * thing that told you the season had weight to it. This is the same idea with real cumulative sums behind
 * it — and deliberately quiet. It was a grid of 24px display-font tiles for a while, which made a row of
 * context the loudest thing on a page whose actual subject is the table below it. One line, one weight of
 * emphasis on the numbers themselves, and a rule under it.
 *
 * **Reads one endpoint and formats it. No aggregation.** Several of these figures *could* be summed
 * client-side from `/stats/players` and `/stats/teams`, and deliberately are not: that means pulling
 * every player row to render eight numbers, and it puts the definition of "total kills" in the
 * browser where nothing else can reuse it.
 */

import { useQuery } from "@tanstack/react-query";
import { type StatTotals } from "../../lib/api";
import { int } from "../../lib/statFormat";
import { queries } from "../../lib/queries";

interface Props {
  conf: string;
  isMobile: boolean;
}

/**
 * A metric worth showing, in display order.
 *
 * No game days: the number of distinct calendar days a split touched says something about the schedule
 * rather than about the league, and it sat in the same line as kills and gold pretending to be comparable.
 */
const TILES: readonly { key: keyof StatTotals; label: string }[] = [
  { key: "teams", label: "Teams" },
  { key: "players", label: "Players" },
  { key: "matches", label: "Matches" },
  { key: "games", label: "Games" },
  { key: "kills", label: "Kills" },
  { key: "assists", label: "Assists" },
  { key: "gold", label: "Gold" },
  { key: "damage", label: "Damage" },
  { key: "cs", label: "CS" },
  { key: "visionScore", label: "Vision Score" },
  { key: "wardsPlaced", label: "Wards" },
  { key: "dragons", label: "Dragons" },
  { key: "barons", label: "Barons" },
  { key: "turrets", label: "Turrets" },
  { key: "soloKills", label: "Solo Kills" },
  { key: "pentaKills", label: "Pentas" },
];

/**
 * Large counts get a compact suffix.
 *
 * Total gold across a season runs to eight digits, and "48,204,117" in a tile that's four characters
 * wide on a phone just truncates. Below a million the exact number fits and is more useful.
 */
function compact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  return int(v);
}

const dateLabel = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function TotalsBar({ conf, isMobile }: Props) {
  const { data } = useQuery(queries.statTotals(conf));

  // Absent endpoint, absent conf, or a genuinely empty season — all three mean "nothing to say".
  if (!data) return null;

  const tiles = TILES.flatMap(t => {
    const v = data[t.key];
    return typeof v === "number" ? [{ ...t, display: compact(v) }] : [];
  });
  if (tiles.length === 0) return null;

  const from = dateLabel(data.firstGame);
  const to = dateLabel(data.lastGame);
  const range = from && to ? (from === to ? from : `${from} — ${to}`) : null;
  const playtime = typeof data.playtimeSeconds === "number"
    ? `${Math.round(data.playtimeSeconds / 3600).toLocaleString("en-US")}h played`
    : null;
  // No "longest game" caption: this endpoint serves no superlatives by design — they live on
  // /stats/records/:conf, where the tie rules and the not-a-game floor are, and where a row links to the
  // game itself. The Records tab shows it.
  const footnotes = [range, playtime].filter((s): s is string => s !== null);

  // One running line: body text at a single size, grey for the labels, and the numbers carrying all of
  // the emphasis through weight and the accent colour. The rule underneath separates it from the tabs
  // without drawing a box around it.
  return (
    <div className={`mb-5 pb-3 border-b border-border flex flex-wrap text-[12px] font-body text-text-muted ${
      isMobile ? "gap-x-3 gap-y-1" : "gap-x-4 gap-y-1"
    }`}>
      {tiles.map(t => (
        <span key={String(t.key)} className="whitespace-nowrap">
          <span className="font-bold text-accent">{t.display}</span> {t.label}
        </span>
      ))}
      {footnotes.map(f => (
        <span key={f} className="whitespace-nowrap">{f}</span>
      ))}
    </div>
  );
}
