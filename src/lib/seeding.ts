/**
 * Words for standings tables and the seed slots that read them, shared by the public season page,
 * League Admin's bracket and Site Admin's bracket editor.
 *
 * A seed source's `place` is a served `position` (the row), never a `rank`, so every label here is
 * built from the position. Tables themselves show `place` ("T-3"), which is the table's business.
 */

import { SLOT_SEED_MAX, type HeldReason, type PropagationReport, type SeasonSeedFrom } from "./api";

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 102nd. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * N for "Seeds after round N": `matchDay`'s 1-based index among the match days that hold fixtures.
 *
 * `lockedThrough` is a phase-relative match day, and a round is a match day with fixtures, so the two
 * differ only when a day is left empty. Pass the season read's round days, or the phase document's
 * fixture days in an editor that has no rounds.
 */
export function roundIndex(fixtureDays: Iterable<number>, matchDay: number): number {
  return new Set([...fixtureDays].filter(day => day <= matchDay)).size;
}

/** The caption over a bracket's standings table on the public page. */
export function standingsCaption(table: { final: boolean; lockedThrough: number | null }, round: number): string {
  if (table.final) return "Final standings";
  return table.lockedThrough === null ? "Seeds before round 1" : `Seeds after round ${round}`;
}

/** The status chip on an earlier table in a bracket editor's reference panel. */
export function tableStatus(
  table: { kind: "group" | "bracket"; final: boolean; lockedThrough: number | null },
  round: number,
): string {
  if (table.final) return "Final";
  if (table.kind === "group") return "In progress";
  return table.lockedThrough === null ? "Not started" : `Seeds after round ${round}`;
}

/**
 * How an empty seed slot names where its team will come from.
 *
 * A slot reading its own phase's table (a Swiss round seeded from the rounds before it) is "Seed 1".
 * Another bracket table is "1st, Swiss Stage". A group is "Group A 2nd", naming the phase only when
 * the season has more than one group phase to tell apart.
 */
export function seedFromLabel(from: SeasonSeedFrom, namePhase: boolean, ownPhaseId: number): string {
  if (from.phase === ownPhaseId) return positionSeedLabel(from.place);
  if (from.group === null) return `${ordinal(from.place)}, ${from.phaseName}`;
  // Group names are letters ("A"), titled the way every other group heading on the site is.
  const group = from.groupName === null ? "A group" : `Group ${from.groupName}`;
  return namePhase ? `${from.phaseName} ${group} ${ordinal(from.place)}` : `${group} ${ordinal(from.place)}`;
}

/**
 * Why a seed slot is still empty, worded for the slot. `own` is a slot reading its own phase's table
 * over the earlier rounds, where the phase's name says nothing the slot doesn't.
 */
export function heldLabel(reason: HeldReason, place: number, phaseName: string, own = false): string {
  if (own) {
    switch (reason) {
      case "incomplete":
        return "Waiting for the earlier rounds to finish";
      case "no_team":
        return `No seed ${place} after the earlier rounds`;
      case "tied":
        return `Tied at seed ${place}`;
      case "frozen":
        return "Already being played; the table now names a different team";
    }
  }
  switch (reason) {
    case "incomplete":
      return `Waiting for ${phaseName} to finish`;
    case "no_team":
      return `${phaseName} has no ${ordinal(place)} place`;
    case "tied":
      return `Tied at ${ordinal(place)} in ${phaseName}`;
    case "frozen":
      return `Already being played; ${phaseName}'s table now names a different team`;
  }
}

/** What an admin can do about a held slot. Null when waiting is the answer. */
export function heldAction(reason: HeldReason): string | null {
  switch (reason) {
    case "incomplete":
      return null;
    case "no_team":
      return "Fix the source, or wait for teams to be added.";
    case "tied":
      return "Break the tie by hand: change the source to Entry and place a team.";
    case "frozen":
      return "Decide by hand. A team is never swapped out mid-series.";
  }
}

/**
 * The `seed` label a seed source suggests: `"1"` from a bracket table, `"A1"` from group A's 1st.
 *
 * Only a suggestion, since upstream never sets `seed`. A group name too long for the 8-character label
 * falls back to the bare place.
 */
export function seedLabel(place: number, groupName: string | null): string {
  const label = groupName === null ? String(place) : `${groupName}${place}`;
  return label.length <= SLOT_SEED_MAX ? label : String(place);
}

/** What a propagate call did, for the Resync buttons. */
export function propagationSummary({ updates, held }: PropagationReport): string {
  const changed =
    updates.length === 0
      ? "Nothing was stale: every derived team already matches the results."
      : `Re-derived ${updates.length} ${updates.length === 1 ? "team" : "teams"}.`;
  if (held.length === 0) return changed;
  return `${changed} ${held.length} seeded ${held.length === 1 ? "slot is" : "slots are"} held.`;
}

/**
 * How a position in a phase's own table reads in a sentence or a list: "Seed 3". Never a slot's `seed`
 * value, which is the bare number, because a seed label is already a seed.
 */
export function positionSeedLabel(position: number): string {
  return `Seed ${position}`;
}
