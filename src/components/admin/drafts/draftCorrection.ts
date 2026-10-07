/**
 * The correction editor's form state and the checks that mirror the server's. The server refuses
 * anything these miss, so they are guidance that keeps Save from sending a known refusal.
 */
import {
  DRAFT_CORRECTION_REASON_MAX,
  DRAFT_ROLES,
  DRAFT_SIDE_SLOTS,
  DRAFT_SIDES,
  type DraftCorrectionInput,
  type DraftEditor,
  type DraftPlayedTeam,
  type DraftRole,
  type DraftRoleAssignment,
  type DraftSide,
  type DraftSideDifference,
  type Role,
} from "../../../lib/api";

export type Slots = (number | null)[];
export type RoleSlots = Record<DraftRole, number | null>;

export interface CorrectionForm {
  firstPick: DraftSide;
  picks: Record<DraftSide, Slots>;
  /** Null is a skipped ban. */
  bans: Record<DraftSide, Slots>;
  roles: Record<DraftSide, RoleSlots>;
}

const RIOT_ROLE: Record<Role, DraftRole> = { TOP: "top", JUNGLE: "jg", MIDDLE: "mid", BOTTOM: "bot", UTILITY: "sup" };

const padded = (values: readonly (number | null)[]): Slots =>
  Array.from({ length: DRAFT_SIDE_SLOTS }, (_, i) => values[i] ?? null);

const emptyRoles = (): RoleSlots =>
  Object.fromEntries(DRAFT_ROLES.map(role => [role, null])) as RoleSlots;

const bySide = <T>(make: (side: DraftSide) => T): Record<DraftSide, T> =>
  ({ blue: make("blue"), red: make("red") });

export function initialForm(editor: DraftEditor): CorrectionForm {
  const draft = editor.draft;
  const picks = bySide(side => padded(draft?.[side].picks ?? []));
  return {
    firstPick: draft?.firstPick ?? "blue",
    picks,
    bans: bySide(side => padded(draft?.[side].bans ?? [])),
    // Stored roles first; otherwise whatever the played game says about these champions.
    roles: bySide(side => draft?.[side].roles ?? playedRoles(editor.played?.teams ?? [], picks[side])),
  };
}

/** Riot's role for each of these picks, where the played game has exactly one champion in it. */
export function playedRoles(teams: readonly DraftPlayedTeam[], picks: Slots): RoleSlots {
  const roles = emptyRoles();
  const played = teams.flatMap(team => team.champions);
  for (const role of DRAFT_ROLES) {
    const holders = played.filter(c => c.role !== null && RIOT_ROLE[c.role] === role && c.championId !== null && picks.includes(c.championId));
    if (holders.length === 1) roles[role] = holders[0].championId;
  }
  return roles;
}

/** Puts a champion in one pick slot, carrying that slot's role assignment over to it. */
export function withPick(form: CorrectionForm, side: DraftSide, slot: number, championId: number | null): CorrectionForm {
  const previous = form.picks[side][slot];
  const picks = form.picks[side].map((id, i) => (i === slot ? championId : id));
  const roles = Object.fromEntries(
    DRAFT_ROLES.map(role => [role, previous !== null && form.roles[side][role] === previous ? championId : form.roles[side][role]]),
  ) as RoleSlots;
  return { ...form, picks: { ...form.picks, [side]: picks }, roles: { ...form.roles, [side]: roles } };
}

/**
 * The slots "Match the played game" would replace on one side: each current pick that was drafted
 * but not played, paired in order with a champion played but not drafted. The editor lets the admin
 * re-pair them when there is more than one, because pick order drives blind pick and turn stats.
 */
export interface SideSwap {
  side: DraftSide;
  /** Pick slots holding a drafted-only champion, in pick order, at most one per replacement. */
  slots: number[];
  /** Champions to place, initially paired with `slots` in order. */
  replacements: number[];
  /** The two counts differ, so some slots or champions are left for the admin to place by hand. */
  uneven: boolean;
}

export function swapsFor(form: CorrectionForm, difference: readonly DraftSideDifference[]): SideSwap[] {
  return difference.flatMap(d => {
    const slots = form.picks[d.side].flatMap((id, i) => (id !== null && d.draftOnly.includes(id) ? [i] : []));
    if (slots.length === 0 || d.playedOnly.length === 0) return [];
    return [{
      side: d.side,
      slots: slots.slice(0, d.playedOnly.length),
      replacements: d.playedOnly,
      uneven: slots.length !== d.playedOnly.length,
    }];
  });
}

/** For a game with no stored draft: each played team on a side in Riot's role order, roles filled in. */
export function formFromPlayed(form: CorrectionForm, teams: readonly DraftPlayedTeam[]): CorrectionForm {
  const next = { ...form, picks: { ...form.picks }, roles: { ...form.roles } };
  DRAFT_SIDES.forEach((side, i) => {
    const team = teams[i];
    if (!team) return;
    const ordered = DRAFT_ROLES.map(role => team.champions.find(c => c.role !== null && RIOT_ROLE[c.role] === role)?.championId ?? null);
    next.picks[side] = padded(ordered);
    next.roles[side] = Object.fromEntries(DRAFT_ROLES.map((role, slot) => [role, ordered[slot]])) as RoleSlots;
  });
  return next;
}

export function correctionProblems(form: CorrectionForm, editor: DraftEditor, reason: string): string[] {
  const problems: string[] = [];
  const picks = DRAFT_SIDES.flatMap(side => form.picks[side]);
  const chosen = picks.filter((id): id is number => id !== null);
  if (chosen.length < picks.length) problems.push("Choose all ten picks.");
  if (new Set(chosen).size !== chosen.length) problems.push("A champion is picked more than once.");

  const bans = DRAFT_SIDES.flatMap(side => form.bans[side]).filter((id): id is number => id !== null);
  if (new Set(bans).size !== bans.length) problems.push("A champion is banned more than once.");
  if (bans.some(id => chosen.includes(id))) problems.push("A banned champion is also picked.");

  for (const side of DRAFT_SIDES) {
    const assigned = DRAFT_ROLES.map(role => form.roles[side][role]);
    const sidePicks = form.picks[side];
    const label = side === "blue" ? "Blue draft" : "Red draft";
    if (assigned.some(id => id === null)) problems.push(`${label}: assign all five roles.`);
    else if (new Set(assigned).size !== assigned.length || assigned.some(id => !sidePicks.includes(id))) {
      problems.push(`${label}: each role must be a different one of this side's picks.`);
    }
  }

  if (form.firstPick === "red" && !editor.firstSelection) problems.push("This series does not allow red to pick first.");
  if (editor.draft && editor.draft.updatedAt === null) problems.push("The stored draft has no revision, so it cannot be corrected here.");
  const trimmed = reason.trim();
  if (trimmed === "") problems.push("Give a reason for the correction.");
  if (trimmed.length > DRAFT_CORRECTION_REASON_MAX) problems.push(`Keep the reason to ${DRAFT_CORRECTION_REASON_MAX} characters.`);
  return problems;
}

/** The request body, or null while `correctionProblems` reports anything. */
export function correctionInput(form: CorrectionForm, editor: DraftEditor, reason: string): DraftCorrectionInput | null {
  if (correctionProblems(form, editor, reason).length > 0) return null;
  const side = (s: DraftSide) => ({ picks: form.picks[s] as number[], bans: form.bans[s] });
  return {
    expectedUpdatedAt: editor.draft ? editor.draft.updatedAt : null,
    reason: reason.trim(),
    firstPick: form.firstPick,
    blue: side("blue"),
    red: side("red"),
    roles: bySide(s => form.roles[s] as DraftRoleAssignment),
  };
}
