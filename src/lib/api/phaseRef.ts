/**
 * One game's place in the season structure, and its mapper.
 *
 * Shared by the profile read (every game, series and personal best carries one) and, once
 * `API-GAP-ANALYSIS.md` §21 lands, by the team matchlist. It lives in its own module because
 * `profiles.ts` imports `client.ts` for `mapTeamRecord`, and `client.ts` needing this back would have
 * been a cycle.
 *
 * `matchDay` is 1-based **within the phase** — season day 14 is playoffs day 2 — and is paired with
 * `matchDays` so a card can say "day 2 of 4" without a second read.
 *
 * `round` and `roundName` are bracket-only, and the distinction between them matters:
 *
 *  - `round` is depth in the bracket graph, and is **not** a match day. A best-of-five round can span
 *    two match days, and a bye feeds a later node from an earlier round.
 *  - `roundName` is the node's own label, verbatim — whatever an operator typed, `null` if nothing.
 *    Deliberately not derived from `round`, because naming rounds by depth is wrong for a third-place
 *    match and for every loser's bracket. So when it exists it is the *better* label, and when it
 *    doesn't there is nothing trustworthy to put in its place.
 *
 * Both are `null` for a group phase and for a bracket game with no fixture to identify its node.
 */

export interface PhaseRef {
  id: number;
  name: string;
  kind: "group" | "bracket";
  /** 1-based position in the season. */
  ordinal: number;
  /** How long the phase is, so a client can say "day 2 of 4". */
  matchDays: number;
  /** 1-based day within the phase. */
  matchDay: number;
  round: number | null;
  roundName: string | null;
}

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback);
const intOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);

/**
 * `null` for a real absence *and* for a deployment that doesn't serve the field yet — the two are the
 * same to every consumer, because both mean "this game cannot be placed in a structure". An
 * unrecognized `kind` reads as `group`, the kind that carries no round, so a skewed value degrades to
 * the less specific label rather than promising a bracket position that isn't there.
 *
 * A ref with no name is dropped rather than named "": every consumer reads this to *say* where a game
 * sits ("Playoffs · Semifinals"), and an empty phase name would render a leading separator in front of
 * nothing. `null` already means "cannot be placed", and the callers fall back to the season-day label.
 */
export function mapPhaseRef(value: unknown): PhaseRef | null {
  if (!value || typeof value !== "object") return null;
  const p = asRaw(value);
  const id = intOrNull(p.id);
  const name = strOrNull(p.name);
  if (id === null || name === null) return null;
  return {
    id,
    name,
    kind: p.kind === "bracket" ? "bracket" : "group",
    ordinal: int(p.ordinal, 1),
    matchDays: int(p.matchDays, 1),
    matchDay: int(p.matchDay, 1),
    round: intOrNull(p.round),
    roundName: strOrNull(p.roundName),
  };
}

/**
 * Where in the season a series sat, in one line.
 *
 * Prefers the **phase**, which is what a player actually says, over `seasonDay`, which is a join key
 * first (`CLAUDE.md`). Within a bracket the round number leads; the operator's `roundName` is the
 * fallback, never a name invented from depth. The week is the fallback for a legacy conference with
 * no phase at all, where the alternative is saying nothing.
 */
export function placementLabel(phase: PhaseRef | null | undefined, seasonDay: number): string | null {
  if (phase == null) return seasonDay > 0 ? `Week ${seasonDay}` : null;
  if (phase.round !== null) return `${phase.name} · Round ${phase.round}`;
  if (phase.roundName) return `${phase.name} · ${phase.roundName}`;
  if (phase.matchDays > 1) return `${phase.name} · Day ${phase.matchDay} of ${phase.matchDays}`;
  return phase.name;
}
