/**
 * The palette a scenario's `level` names.
 *
 * A group phase's scenarios carry a `level` of 1–10 that nothing upstream reads — the API's own note
 * calls it "client-side coloring only". So the number is not a value anyone means; it is an index into
 * a palette this file owns. Editing it as a number asked an admin to know that gold is 1, which is a
 * fact about this file rather than about their league.
 *
 * Ordered best to worst, so the ramp reads down a standings table: gold for a top seed, green and teal
 * for qualification, sky through purple for the play-in band, gray and slate for nothing at stake, red
 * for elimination. Only a convention — nothing sorts by level — but it means a season laid out in level
 * order looks like the table it is going to color.
 *
 * The hues live in `index.css` as `--scenario-1` … `--scenario-10`, defined once per theme, which is
 * what makes them shift with light and dark mode: the same `level` picks a bright gold on the near-black
 * page and a darker one that can be read on white. `bg` and `line` are mixed from that one hue rather
 * than listed separately, so a theme only ever states ten colors and two strengths.
 */

/** One level's colors. Every field is a CSS value, so these go in `style`, not a class. */
export interface ScenarioTone {
  /** The value stored on the scenario. 1 is the best outcome, 10 the worst. */
  level: number;
  /**
   * What the editor calls it.
   *
   * A color name, not an outcome: what a tone *means* is the title an admin types next to it, and one
   * league's gold is a bye while another's is a trophy.
   */
  name: string;
  /** Text, and the dot on a pill. */
  fg: string;
  /** Fill behind a pill, or a standings row. */
  bg: string;
  /** Border, or the rule down the left of a row. */
  line: string;
}

const tone = (level: number, name: string): ScenarioTone => ({
  level,
  name,
  fg: `var(--scenario-${level})`,
  bg: `color-mix(in srgb, var(--scenario-${level}) var(--scenario-fill), transparent)`,
  line: `color-mix(in srgb, var(--scenario-${level}) var(--scenario-edge), transparent)`,
});

/**
 * Every level, in order. Exactly as long as `SCENARIO_LEVELS`, the clamp the API applies.
 *
 * Gray and slate are the one nearly-matched pair, and deliberately: they are the two "no stake" rows,
 * and a league that uses both wants them to read as one band.
 */
export const SCENARIO_TONES: readonly ScenarioTone[] = [
  tone(1, "Gold"),
  tone(2, "Green"),
  tone(3, "Teal"),
  tone(4, "Sky"),
  tone(5, "Blue"),
  tone(6, "Purple"),
  tone(7, "Orange"),
  tone(8, "Gray"),
  tone(9, "Slate"),
  tone(10, "Red"),
];

/**
 * The tone for a stored level.
 *
 * Clamps rather than answering null. A level outside the range should not be reachable — the API clamps
 * on the way in and this palette is what writes it on the way out — but a scenario saved by some other
 * client is worth showing in *some* color rather than dropping the badge and leaving the row looking
 * broken.
 */
export function toneForLevel(level: number): ScenarioTone {
  const index = Math.min(SCENARIO_TONES.length, Math.max(1, Math.round(level) || 1)) - 1;
  return SCENARIO_TONES[index];
}
