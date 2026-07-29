/**
 * Cumulative league totals across the top of the Stats page.
 *
 * The old dashboard had a thin version of this (players, matches, teams, game nights, date range) and
 * it was the first thing that told you the season had weight to it. This is the same idea with real
 * cumulative sums behind it.
 *
 * **Reads one endpoint and formats it. No aggregation.** Several of these figures *could* be summed
 * client-side from `/stats/players` and `/stats/teams`, and deliberately are not: that means pulling
 * every player row to render eight numbers, and it puts the definition of "total kills" in the
 * browser where nothing else can reuse it.
 *
 * `GET /stats/totals/:conf` is PROPOSED, so today this renders nothing at all — `getOne` maps the
 * 404 to `null` without throwing. It lights up on its own when the endpoint ships.
 */

import { useQuery } from "@tanstack/react-query";
import { fmtSec, type StatTotals } from "../../lib/api";
import { int } from "../../lib/statFormat";
import { queries } from "../../lib/queries";

interface Props {
  conf: string;
  isMobile: boolean;
}

/** A metric worth a tile, in display order. */
const TILES: readonly { key: keyof StatTotals; label: string }[] = [
  { key: "teams", label: "Teams" },
  { key: "players", label: "Players" },
  { key: "matches", label: "Matches" },
  { key: "games", label: "Games" },
  { key: "gameDays", label: "Game Days" },
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
  const longest = typeof data.longestGameSeconds === "number" ? `${fmtSec(data.longestGameSeconds)} longest` : null;

  const footnotes = [range, playtime, longest].filter((s): s is string => s !== null);

  return (
    <div className="bg-bg2 border border-border rounded-lg mb-5 px-4 py-3.5">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 74 : 96}px, 1fr))` }}
      >
        {tiles.map(t => (
          <div key={String(t.key)} className="text-center min-w-0">
            <div className="font-display text-text-bright leading-none truncate" style={{ fontSize: isMobile ? 18 : 24 }}>
              {t.display}
            </div>
            <div className="text-[9px] text-text-muted font-heading tracking-wider uppercase mt-1 truncate">
              {t.label}
            </div>
          </div>
        ))}
      </div>

      {footnotes.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-bg3 text-[10px] text-text-dim text-center">
          {footnotes.join(" · ")}
        </div>
      )}
    </div>
  );
}
