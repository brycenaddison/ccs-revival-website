/**
 * A group scenario as a badge — "Advances · Playoffs" in the color its `level` names.
 *
 * Shared between the site-admin scenario editor and the public standings table on purpose: what an
 * admin approves in the editor should be pixel-for-pixel what a viewer gets, and the two drifting is
 * how a league ends up choosing a color that reads differently on the page it was chosen for.
 *
 * The tone comes from `lib/scenarioTones.ts`, which mixes one CSS variable per level, so a pill
 * shifts with light and dark mode without this component knowing either exists.
 */

import { toneForLevel } from "../../lib/scenarioTones";
import type { SeasonScenario } from "../../lib/api";

interface Props {
  scenario: Pick<SeasonScenario, "level" | "title" | "subtitle">;
  /**
   * The row this pill sits on shares its rank with another.
   *
   * The scenario is looked up by *row*, so two teams genuinely tied for 2nd are handed different
   * outcomes while the tiebreaker is still unsettled. Drawn dashed rather than hidden: which of them
   * takes it is unknown, but that both are in play is exactly the information a reader wants.
   */
  provisional?: boolean;
}

export function ScenarioPill({ scenario, provisional }: Props) {
  const tone = toneForLevel(scenario.level);

  return (
    // `items-baseline`, not `items-center`. The title is a heading and the subtitle is body text at
    // the same 11px; when the two roles wore different faces their ascent and descent metrics
    // differed, so centering each one's *line box* left the glyphs at visibly different heights.
    // Baselines are what the eye reads as level, whatever the faces are.
    <span
      className="inline-flex items-baseline gap-1.5 rounded px-2.5 py-1"
      style={{
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.line}`,
        borderStyle: provisional ? "dashed" : "solid",
      }}
      title={
        provisional
          ? "Tied on rank — which of the tied teams takes this outcome isn't settled yet"
          : undefined
      }
    >
      {/* The dot has no text, so it has no baseline worth aligning — center it against the line. */}
      <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: tone.fg }} />
      <span className="font-heading text-[11px] font-semibold ">
        {scenario.title || "Untitled"}
      </span>
      {scenario.subtitle && <span className="text-[11px] opacity-75">{scenario.subtitle}</span>}
    </span>
  );
}
