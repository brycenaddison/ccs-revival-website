/**
 * The career numbers, as tiles.
 *
 * **Games, record, win rate and KDA are deliberately absent.** They sit in the identity header,
 * where a reader meets them first, and repeating them here made the top of the page say the same
 * four things twice. What is left is the part the header can't carry: how this player actually
 * plays. Average game length went for a different reason — it is a property of the games, not of
 * the player, and it never once answered a question the rest of the grid didn't answer better.
 *
 * Eight above the fold and eight behind a disclosure, split by how often a reader wants the number:
 * production and lane first, then shares, efficiency and the sparse extras.
 *
 * Every value comes straight off `career.totals`. Nothing here is derived — the API computes rates
 * as ratios of sums rather than means of per-game rates, and recomputing any of them in the browser
 * would produce a subtly different number to the one the leaderboard shows.
 */

import { useState } from "react";
import { fmtPct, type ProfileMetrics } from "../../lib/api";
import { dec, int, signed } from "../../lib/statFormat";
import { StatTile } from "../stats/StatTile";
import { ACTION_QUIET } from "../admin/adminUi";
import { metricText } from "./profileUi";

interface Tile {
  key: string;
  label: string;
  color: string;
  text: (t: ProfileMetrics) => string;
}

const HEADLINE: readonly Tile[] = [
  { key: "csMin", label: "CS / min", color: "var(--blue)", text: t => metricText(t.csMin, dec(2)) },
  { key: "damageMin", label: "Damage / min", color: "var(--orange)", text: t => metricText(t.damageMin, int) },
  {
    key: "killParticipation",
    label: "Kill participation",
    color: "var(--green)",
    text: t => metricText(t.killParticipation, fmtPct),
  },
  {
    key: "visionScoreMin",
    label: "Vision / min",
    color: "var(--purple)",
    text: t => metricText(t.visionScoreMin, dec(2)),
  },
  { key: "goldMin", label: "Gold / min", color: "var(--gold)", text: t => metricText(t.goldMin, int) },
  { key: "xpMin", label: "XP / min", color: "var(--blue)", text: t => metricText(t.xpMin, int) },
  {
    key: "damagePercent",
    label: "Damage share",
    color: "var(--orange)",
    text: t => metricText(t.damagePercent, fmtPct),
  },
  { key: "goldPercent", label: "Gold share", color: "var(--gold)", text: t => metricText(t.goldPercent, fmtPct) },
];

const EXTENDED: readonly Tile[] = [
  {
    key: "damagePerGold",
    label: "Damage / gold",
    color: "var(--orange)",
    text: t => metricText(t.damagePerGold, dec(2)),
  },
  // Share of the team's deaths. Low is good here, unlike every other share on the grid.
  { key: "deathPercent", label: "Death share", color: "var(--red)", text: t => metricText(t.deathPercent, fmtPct) },
  { key: "goldDiffAt14", label: "GD @14", color: "var(--blue)", text: t => metricText(t.goldDiffAt14, signed) },
  { key: "csDiffAt14", label: "CSD @14", color: "var(--blue)", text: t => metricText(t.csDiffAt14, signed) },
  { key: "xpDiffAt14", label: "XPD @14", color: "var(--blue)", text: t => metricText(t.xpDiffAt14, signed) },
  {
    key: "controlWardsMin",
    label: "Control wards / min",
    color: "var(--purple)",
    text: t => metricText(t.controlWardsMin, dec(2)),
  },
  { key: "soloKills", label: "Solo kills", color: "var(--red)", text: t => metricText(t.soloKills, int) },
  {
    key: "firstBloodPercent",
    label: "First blood %",
    color: "var(--red)",
    text: t => metricText(t.firstBloodPercent, fmtPct),
  },
];

export function CareerTiles({ totals }: { totals: ProfileMetrics }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {HEADLINE.map(tile => (
          <StatTile key={tile.key} value={tile.text(totals)} label={tile.label} color={tile.color} />
        ))}
        {expanded &&
          EXTENDED.map(tile => (
            <StatTile key={tile.key} value={tile.text(totals)} label={tile.label} color={tile.color} />
          ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className={`${ACTION_QUIET} mt-2.5`}
      >
        {expanded ? "Fewer career stats" : "More career stats"}
      </button>
    </>
  );
}
