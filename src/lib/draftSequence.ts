/**
 * A game draft's bans and picks in the order they happened.
 *
 * The API numbers bans 1–10 and picks 1–10 separately, both global across the two sides. A draft runs
 * bans 1–6, picks 1–6, bans 7–10, picks 7–10, so the sequence is those four phases with each in turn
 * order. The turns are the API's; nothing here recomputes them from slot order.
 */
import type { DraftSide, GameDraft, GameDraftBan, GameDraftPick } from "./api";

/** The last turn of the first ban phase and of the first pick phase. */
const PHASE_ONE_LAST_TURN = 6;

export type DraftStep =
  | { kind: "ban"; side: DraftSide; phase: 1 | 2; entry: GameDraftBan }
  | { kind: "pick"; side: DraftSide; phase: 1 | 2; entry: GameDraftPick };

const phaseOf = (turn: number): 1 | 2 => (turn <= PHASE_ONE_LAST_TURN ? 1 : 2);

export function draftSequence(draft: GameDraft): DraftStep[] {
  const bans: DraftStep[] = draft.sides.flatMap(s =>
    s.bans.map(entry => ({ kind: "ban" as const, side: s.side, phase: phaseOf(entry.turn), entry })),
  );
  const picks: DraftStep[] = draft.sides.flatMap(s =>
    s.picks.map(entry => ({ kind: "pick" as const, side: s.side, phase: phaseOf(entry.turn), entry })),
  );
  const rank = (step: DraftStep) => (step.phase - 1) * 2 + (step.kind === "ban" ? 0 : 1);
  return [...bans, ...picks].sort((a, b) => rank(a) - rank(b) || a.entry.turn - b.entry.turn);
}
