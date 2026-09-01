/**
 * The season as a page **renders** it — the read behind the Standings tab.
 *
 * The counterpart to `./season`, and the two must not be confused. That module is the season's
 * *structure* (phases, groups, scenarios, bracket wiring), it is site-admin only, and its values are
 * **unresolved**: a null `bestOf` there means "inherit". This module is `GET /:conf/season`, it is
 * **public**, and everything arrives resolved — `bestOf` and `scheduledAt` already have the phase
 * default applied. That is exactly why an editor must never load from here: echoing a resolved value
 * back pins it as a per-match override.
 *
 * Three properties of the payload shape everything below.
 *
 * **A phase is a discriminated union on `kind`.** A group phase carries `scenarios` and `groups`; a
 * bracket phase carries `terminalNodes` and `rounds`. Narrow on `kind` rather than probing for a
 * field, so the compiler catches a view that reads the wrong half.
 *
 * **Order is the contract.** Phases arrive in `ordinal` order, groups in theirs, and group rows come
 * ranked with ties already resolved by a cascade — series record, then game win percentage, then
 * head-to-head — that cannot be reconstructed from anything on this page. Nothing here sorts, and
 * nothing downstream should either.
 *
 * **The payload is clock-dependent.** `activePhaseId` is a function of `generatedAt`, which is why
 * the server sends both: a cached copy is otherwise indistinguishable from a fresh one.
 */

import { getOne, type RequestOpts } from "./http";
import { colorSecondaryOf, hexFromInt, httpsUrl, numOrNull } from "./normalize";
import type { BestOf, SlotOutput, SlotSide } from "./season";

// ---------------------------------------------------------------- vocabulary

/**
 * A team as this payload names one.
 *
 * `color` is the raw integer column and `colorHex` is it rendered, carried together for the same
 * reason `TeamRecord` does: 0 and null both mean "unset", and only the mapper should have to know
 * that. See `hexFromInt`.
 */
export interface SeasonTeam {
  code: string;
  name: string;
  /** Already upgraded to https — see `httpsUrl`. Absent rather than null, to suit an `<img src>`. */
  logo?: string;
  color: number | null;
  colorHex: string;
  /** Secondary branding color. Absent until upstream serves it on this read — see `TeamRecord`. */
  colorSecondary?: number | null;
}

/**
 * One outcome a group phase can hand a team.
 *
 * `level` is 1–10 and is **only** a color index — nothing upstream reads it. `lib/scenarioTones.ts`
 * owns the palette it names.
 */
export interface SeasonScenario {
  level: number;
  title: string;
  subtitle: string;
}

/** A phase's whole library, keyed by the stable string key the admin editor writes. */
export type SeasonScenarioLibrary = Record<string, SeasonScenario>;

export type SeasonMatchStatus = "played" | "scheduled" | "pending";

// ------------------------------------------------------------------- a group

export interface SeasonGroupRow {
  /**
   * 1-based **display row**, and not `rank`.
   *
   * A genuine tie for 2nd puts two teams at rank 2 in rows 2 and 3, and the scenario is looked up by
   * row — so those two rows carry *different* scenarios while both are `tied`. This is what lines a
   * row up against the legend.
   */
  position: number;
  /** The finishing position. Shared on a tie; the next rank skips the rows the tie covered. */
  rank: number;
  /** `rank` rendered: `"1"`, or `"T-2"` when shared. */
  place: string;
  tied: boolean;
  code: string;
  name: string;
  logo?: string;
  color: number | null;
  colorHex: string;
  /** Secondary branding color. Absent until upstream serves it on this read — see `TeamRecord`. */
  colorSecondary?: number | null;
  seriesWins: number;
  seriesLosses: number;
  gameWins: number;
  gameLosses: number;
  /** The first tiebreaker, exposed so a table can show why two teams split. Null when no games. */
  gameWinPct: number | null;
  /** Resolved inline — a `scenarioKey` never appears on a read path. Null when the row has none. */
  scenario: SeasonScenario | null;
}

export interface SeasonGroup {
  name: string;
  ordinal: number;
  /**
   * Ranked, ties resolved, **in the order to render**.
   *
   * Never re-sorted and never renumbered by row index: head-to-head cannot be recomputed from
   * anything this page loads, and teams level on every tiebreaker legitimately *share* a rank.
   * `place` carries the tie marker.
   */
  standings: SeasonGroupRow[];
}

// ----------------------------------------------------------------- a bracket

/**
 * One side of a bracket match — a slot, and whatever has reached it.
 *
 * Four states, and each one draws differently:
 *
 *     from  team  meaning
 *     null  set   an entry seed, placed by hand
 *     null  null  TBD — nothing wired and nobody placed
 *     set   null  "Winner of node N", still waiting
 *     set   set   propagated from that node's result
 */
export interface SeasonBracketSide {
  /** A free-form label, not a number: `"1"`, or `"1A"` for the first seed out of group A. */
  seed: string | null;
  /** The node whose winner or loser lands here. Null for an entry slot. */
  from: { node: number; output: SlotOutput } | null;
  team: SeasonTeam | null;
}

/**
 * A series result, **oriented to the slots rather than the alphabet**: `winsTop` belongs to
 * `top.team`.
 *
 * `winner` is null while the series is level — a best-of-2 can split, and one in progress is level
 * until somebody clinches. `bestOf` is how those two are told apart. `winnerCode` is the same answer
 * as a team code and is a convenience echo; never derive `winner` from it.
 */
export interface SeasonBracketResult {
  winsTop: number;
  winsBottom: number;
  winner: SlotSide | null;
  winnerCode: string | null;
  hasForfeit: boolean;
}

/**
 * One bracket node as the page draws it.
 *
 * **There is no `kind`.** A bye is a group-phase concept; a bracket expresses one by placing the team
 * straight into its next slot, and a node whose match is a bye is refused upstream at save time.
 */
export interface SeasonBracketMatch {
  /** The bracket node id — what `from.node` on another match points at. */
  node: number;
  /** The underlying `schedule_match` id, and the join key against `GET /:conf/schedule`. */
  matchId: number;
  /** Free text, the admin's own. Nothing keys off it; there is no `"QF1"` and no `"GF"`. */
  label: string | null;
  bestOf: BestOf;
  scheduledAt: string | null;
  streamUrl: string | null;
  /**
   * Which of three cards to draw, decided upstream so no client invents its own precedence:
   * `played` (a series exists, possibly mid-series) beats `scheduled` (both teams, no games) beats
   * `pending` (a slot unresolved, or no kickoff to show).
   */
  status: SeasonMatchStatus;
  top: SeasonBracketSide;
  bottom: SeasonBracketSide;
  /** Null until at least one game exists for this pairing. */
  result: SeasonBracketResult | null;
}

/** One match day's matches, and the column a bracket draws — see `lib/bracketLayout.ts`. */
export interface SeasonRound {
  /** The day within the phase, 1-based. What a round is called on screen. */
  matchDay: number;
  /**
   * The same day counted from the start of the *season*.
   *
   * A join key, not a label: it is what `series` groups on and what a tournament code is minted
   * against. **Never render it on a public surface** — see `CLAUDE.md`. Show the kickoff date.
   */
  seasonDay: number;
  matches: SeasonBracketMatch[];
}

// ------------------------------------------------------------------- a phase

interface SeasonPhaseCommon {
  id: number;
  name: string;
  ordinal: number;
  matchDays: number;
  days: { from: number; to: number };
  defaultBestOf: BestOf;
  published: boolean;
  /** Earliest resolved kickoff. Null when the phase has no dated day. */
  startsAt: string | null;
  /**
   * Latest resolved kickoff — **not an end**.
   *
   * Nothing in the schema records when a phase finishes, and a best-of-5 that starts at 01:00 is
   * still being played hours later. Render it as the start of the final match day; never compare it
   * to the clock to decide a phase is over.
   */
  endsAt: string | null;
}

export interface SeasonGroupPhase extends SeasonPhaseCommon {
  kind: "group";
  /**
   * The phase's **whole** library, so a legend can show every outcome and not only the ones still
   * reachable. Rows carry their own `scenario` resolved inline; this is as well as that, not instead.
   */
  scenarios: SeasonScenarioLibrary;
  groups: SeasonGroup[];
}

export interface SeasonBracketPhase extends SeasonPhaseCommon {
  kind: "bracket";
  /**
   * Nodes whose result nothing consumes.
   *
   * There may be several — a third-place match is one — and **the server never names a final or a
   * champion.** Emphasis, not placement: a third-place match is terminal and legitimately sits a
   * column short of the final, so forcing terminals rightmost would misdraw the bracket.
   */
  terminalNodes: number[];
  rounds: SeasonRound[];
}

export type SeasonPhase = SeasonGroupPhase | SeasonBracketPhase;

export interface SeasonPayload {
  conf: string;
  name: string;
  /** The instant the answer was computed against; `activePhaseId` is a function of it. */
  generatedAt: string | null;
  /**
   * The tab to open, and **the rule is the server's** — do not reimplement it.
   *
   * It is the last phase, in ordinal order, whose `startsAt` is at or before `generatedAt`. In
   * particular it is *not* "the last phase" and *not* "the one containing now": before the season it
   * is the first phase, after the last one starts it stays there, and in the gap between two phases
   * it holds the earlier one. Null only when there are no visible phases.
   */
  activePhaseId: number | null;
  /** In `ordinal` order. Unpublished phases are omitted entirely for a reader who can't edit. */
  phases: SeasonPhase[];
}

// ----------------------------------------------------------------- narrowing

export function isGroupPhase(p: SeasonPhase): p is SeasonGroupPhase {
  return p.kind === "group";
}

export function isBracketPhase(p: SeasonPhase): p is SeasonBracketPhase {
  return p.kind === "bracket";
}

/**
 * The group phase whose table is worth showing, or null when the season has none.
 *
 * The active phase when that is a group phase, otherwise the nearest group phase *before* it. During
 * playoffs a reader still wants the table that produced the seeding, and walking backwards is what
 * says that — jumping to the first group phase would show a reader last split's group in a season
 * with two.
 */
export function standingsPhase(payload: SeasonPayload | null): SeasonGroupPhase | null {
  if (!payload) return null;
  const groups = payload.phases.filter(isGroupPhase);
  if (groups.length === 0) return null;

  const active = payload.phases.find(p => p.id === payload.activePhaseId);
  if (active && isGroupPhase(active)) return active;

  // `phases` is in ordinal order, so the last one at or before the active phase is the nearest
  // earlier group. With no active phase to measure against, the first group is the only answer.
  if (!active) return groups[0];
  const earlier = groups.filter(g => g.ordinal <= active.ordinal);
  return earlier.length > 0 ? earlier[earlier.length - 1] : groups[0];
}

// --------------------------------------------------------------- normalizing

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

const BEST_OFS: readonly unknown[] = [1, 3, 5];
const bestOf = (v: unknown): BestOf => (BEST_OFS.includes(v) ? (v as BestOf) : 3);

const STATUSES: readonly unknown[] = ["played", "scheduled", "pending"];
/** Anything unrecognized falls to `pending`, which is the state that claims least. */
const status = (v: unknown): SeasonMatchStatus =>
  STATUSES.includes(v) ? (v as SeasonMatchStatus) : "pending";

function mapTeam(raw: unknown): SeasonTeam | null {
  if (raw == null) return null;
  const t = asRaw(raw);
  const code = str(t.code);
  // A team object with no code cannot be linked or badged, so it is no better than absence.
  if (code === "") return null;
  const color = numOrNull(t.color as number | null);
  return {
    code,
    name: str(t.name, code),
    logo: httpsUrl(strOrNull(t.logo)),
    color,
    colorHex: hexFromInt(color),
    ...colorSecondaryOf(t),
  };
}

function mapScenario(raw: unknown): SeasonScenario | null {
  if (raw == null) return null;
  const s = asRaw(raw);
  return {
    // Clamped to the palette's range on the way out as well as upstream: a scenario written by some
    // other client is worth a color rather than a broken badge. See `toneForLevel`.
    level: Math.min(10, Math.max(1, int(s.level, 1))),
    title: str(s.title),
    subtitle: str(s.subtitle),
  };
}

function mapScenarios(raw: unknown): SeasonScenarioLibrary {
  const out: SeasonScenarioLibrary = {};
  for (const [key, value] of Object.entries(asRaw(raw))) {
    const scenario = mapScenario(value);
    if (scenario) out[key] = scenario;
  }
  return out;
}

function mapGroupRow(raw: unknown, index: number): SeasonGroupRow {
  const r = asRaw(raw);
  const color = numOrNull(r.color as number | null);
  const position = int(r.position, index + 1);
  const rank = int(r.rank, position);
  return {
    position,
    rank,
    place: str(r.place, String(rank)),
    tied: r.tied === true,
    code: str(r.code),
    name: str(r.name, str(r.code)),
    logo: httpsUrl(strOrNull(r.logo)),
    color,
    colorHex: hexFromInt(color),
    ...colorSecondaryOf(r),
    seriesWins: int(r.seriesWins),
    seriesLosses: int(r.seriesLosses),
    gameWins: int(r.gameWins),
    gameLosses: int(r.gameLosses),
    // `numOrNull`, not `num`: 0% of games won is a real answer and "no games yet" is not zero.
    gameWinPct: numOrNull(r.gameWinPct as number | null),
    scenario: mapScenario(r.scenario),
  };
}

function mapGroup(raw: unknown, index: number): SeasonGroup {
  const g = asRaw(raw);
  return {
    name: str(g.name, `Group ${index + 1}`),
    ordinal: int(g.ordinal, index + 1),
    standings: arr(g.standings).map(mapGroupRow),
  };
}

function mapSide(raw: unknown): SeasonBracketSide {
  const s = asRaw(raw);
  const from = asRaw(s.from);
  const node = typeof from.node === "number" ? int(from.node) : null;
  return {
    // `""` is not a seed — upstream refuses it, because `null` already means "none".
    seed: strOrNull(s.seed),
    from: node === null ? null : { node, output: from.output === "loser" ? "loser" : "winner" },
    team: mapTeam(s.team),
  };
}

function mapResult(raw: unknown): SeasonBracketResult | null {
  if (raw == null) return null;
  const r = asRaw(raw);
  return {
    winsTop: int(r.winsTop),
    winsBottom: int(r.winsBottom),
    // Read straight off `winner`, never inferred from `winnerCode`: the payload is oriented to the
    // slots, and a team playing itself would make the code ambiguous where the side never is.
    winner: r.winner === "top" ? "top" : r.winner === "bottom" ? "bottom" : null,
    winnerCode: strOrNull(r.winnerCode),
    hasForfeit: r.hasForfeit === true,
  };
}

function mapBracketMatch(raw: unknown): SeasonBracketMatch {
  const m = asRaw(raw);
  return {
    node: int(m.node),
    matchId: int(m.matchId),
    label: strOrNull(m.label),
    bestOf: bestOf(m.bestOf),
    scheduledAt: strOrNull(m.scheduledAt),
    streamUrl: strOrNull(m.streamUrl),
    status: status(m.status),
    top: mapSide(m.top),
    bottom: mapSide(m.bottom),
    result: mapResult(m.result),
  };
}

function mapRound(raw: unknown, index: number): SeasonRound {
  const r = asRaw(raw);
  return {
    matchDay: int(r.matchDay, index + 1),
    seasonDay: int(r.seasonDay, index + 1),
    matches: arr(r.matches).map(mapBracketMatch),
  };
}

function mapPhase(raw: unknown, index: number): SeasonPhase {
  const p = asRaw(raw);
  const common = {
    id: int(p.id),
    name: str(p.name, `Phase ${index + 1}`),
    ordinal: int(p.ordinal, index + 1),
    matchDays: int(p.matchDays, 1),
    days: { from: int(asRaw(p.days).from, 1), to: int(asRaw(p.days).to, 1) },
    defaultBestOf: bestOf(p.defaultBestOf),
    published: p.published !== false,
    startsAt: strOrNull(p.startsAt),
    endsAt: strOrNull(p.endsAt),
  };

  // The discriminant decides, not the presence of a field. A phase of some kind this client has not
  // heard of renders as a group phase with no groups — an empty tab rather than a broken one.
  if (p.kind === "bracket") {
    return {
      ...common,
      kind: "bracket",
      terminalNodes: arr(p.terminalNodes).map(v => int(v)),
      rounds: arr(p.rounds).map(mapRound),
    };
  }

  return {
    ...common,
    kind: "group",
    scenarios: mapScenarios(p.scenarios),
    groups: arr(p.groups).map(mapGroup),
  };
}

export function mapSeason(conf: string, raw: unknown): SeasonPayload {
  const s = asRaw(raw);
  const phases = arr(s.phases).map(mapPhase);
  const activePhaseId = typeof s.activePhaseId === "number" ? int(s.activePhaseId) : null;

  return {
    conf: str(s.conf, conf),
    name: str(s.name, conf.toUpperCase()),
    generatedAt: strOrNull(s.generatedAt),
    // Validated against the phases actually present. The server picks it *after* the published
    // filter so it always names one of them, but a client that trusted it blindly would render a
    // blank tab if that ever stopped being true.
    activePhaseId: phases.some(p => p.id === activePhaseId) ? activePhaseId : null,
    phases,
  };
}

// ----------------------------------------------------------------- the read

/**
 * One conference's season.
 *
 * Public — `getOne`, never `credentialedRequest`. The consequence of that is worth stating: an admin
 * reading this page sees the *published* season, the same one a visitor does. Previewing unpublished
 * phases is the structure editor's job, and a page that quietly showed an editor a different season
 * from everyone else is how a phase ships half-drawn.
 *
 * `null` covers two absences that read the same to a viewer: an unknown conference, and an API old
 * enough not to serve this route at all (`getOne` folds a 404 route to null).
 */
export function season(conf: string, opts?: RequestOpts): Promise<SeasonPayload | null> {
  return getOne<Raw>(`/tournaments/${encodeURIComponent(conf)}/season`, opts).then(raw =>
    raw === null ? null : mapSeason(conf, raw),
  );
}
