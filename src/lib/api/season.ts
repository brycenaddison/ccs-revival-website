/**
 * The season's **structure**: phases, groups, scenarios and bracket wiring.
 *
 * Site-admin only, every route — the `admin` role on the profile, never a league grant. That is the
 * line upstream draws and it is worth restating here, because the neighbouring `./schedule` module
 * is the same season seen by a league admin and the two must not be confused: reshaping a season is
 * not the same job as running one.
 *
 * Three things about this surface shape everything below.
 *
 * **Both saves are whole-document.** The body is the desired final state, so a phase absent from the
 * list is a phase being deleted along with everything under it, and a child absent from a phase's
 * contents is deleted too. There is no PATCH. Hold the whole thing in state and send all of it.
 *
 * **New rows carry a negative id**, unique within the one request, and the response's `idMap` maps
 * each to the serial it became. Rewrite local ids from it before the next save, or the server reads
 * the stale negatives as *new* rows and duplicates everything.
 *
 * **The reads are unresolved and the display reads are not.** `GET /:conf/phases[/:id]` emit a null
 * `bestOf` or `scheduledAt` as null, meaning "inherit the phase default". `GET /:conf/season` — the
 * public rendering payload in `./client` — substitutes the resolved value instead, which is why an
 * editor must never load from it: echoing a resolved value back pins it as a per-match override, and
 * the phase default then moves nothing.
 */

import { credentialedRequest } from "./credentialed";
import type { RequestOpts } from "./http";

// ---------------------------------------------------------------- vocabulary

export const PHASE_KINDS = ["group", "bracket"] as const;
export type PhaseKind = (typeof PHASE_KINDS)[number];

/** Riot mints codes per game, so a series length is odd. 1, 3 or 5 — nothing else. */
export const BEST_OF_VALUES = [1, 3, 5] as const;
export type BestOf = (typeof BEST_OF_VALUES)[number];

export const MATCH_KINDS = ["match", "bye"] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

export const SLOT_SIDES = ["top", "bottom"] as const;
/** `top` is the match's `teamAId`, `bottom` is `teamBId`. */
export type SlotSide = (typeof SLOT_SIDES)[number];

export const SLOT_OUTPUTS = ["winner", "loser"] as const;
export type SlotOutput = (typeof SLOT_OUTPUTS)[number];

/** `defaultTimeFor` steps by a constant seven days; there is no per-phase step. */
export const DAY_STEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Column widths and ranges enforced upstream, mirrored so a field can cap its own input. */
export const PHASE_NAME_MAX = 64;
export const GROUP_NAME_MAX = 32;
export const NODE_LABEL_MAX = 48;
export const STREAM_URL_MAX = 256;
export const SCENARIO_KEY_MAX = 32;
/** `level` is 1–10 and exists only so the client can color a row. */
export const SCENARIO_LEVELS = 10;

/** A slot seed is 1–8 letters or digits. Upstream refuses anything else, `""` included. */
export const SLOT_SEED_MAX = 8;
const SEED_PATTERN = /^[A-Za-z0-9]{1,8}$/;

export function isBestOf(value: unknown): value is BestOf {
  return (BEST_OF_VALUES as readonly unknown[]).includes(value);
}

/**
 * Whether a seed is one upstream will accept.
 *
 * Letters and digits only, 1–8 of them. **`""` is not a seed** — `null` already means "none", and two
 * spellings of nothing is how an editor ends up rendering an empty box that is not empty. A field
 * should normalize its empty string to `null` rather than ask this about it.
 */
export function isSlotSeed(value: unknown): value is string {
  return typeof value === "string" && SEED_PATTERN.test(value);
}

// --------------------------------------------------------------------- phases

/**
 * A phase as the season page edits it.
 *
 * `ordinal` and `days` are read-only extras: the server assigns the ordinal from **array position**
 * and derives the range from the running sum of the lengths before it. They are here so the editor
 * can render without a second call, and because echoing the whole object back into the save is
 * simpler — and safer — than reconstructing a subset of it.
 */
export interface PhaseSummary {
  id: number;
  kind: PhaseKind;
  name: string;
  /** 1-based position. Derived from array order on save; never sent. */
  ordinal: number;
  /** The phase's length in match days. At least 1. */
  matchDays: number;
  /** An unpublished phase is omitted entirely from every public read. */
  published: boolean;
  /**
   * Default kickoff for this phase's **first** match day, ISO 8601, or null.
   *
   * Naive UTC upstream (`timestamp without time zone`) and stored that way, so render it in the
   * viewer's local time and send it back as an ISO string. Day *d* defaults to this plus seven days
   * times *d* − 1; because the anchor is per phase, nothing accumulates drift across a season.
   */
  defaultStartAt: string | null;
  defaultBestOf: BestOf;
  /** Resolved season-day range. Both ends always present — every phase has a length. */
  days: { from: number; to: number };
}

/** What `PUT /:conf/phases` reads off each entry. Everything else on a summary is ignored. */
export interface PhaseListEntry {
  /** Negative for a phase created client-side. */
  id: number;
  kind: PhaseKind;
  name: string;
  matchDays: number;
  published: boolean;
  defaultStartAt: string | null;
  defaultBestOf: BestOf;
}

export interface PhaseListSaved {
  /** The saved list, re-read, in order, with real ids. */
  phases: PhaseSummary[];
  /** Negative id to serial, for the phases this save created. */
  idMap: Record<string, number>;
}

// ------------------------------------------------------------------- contents

export interface Scenario {
  /**
   * 1–10. Client-side coloring only; nothing upstream reads it.
   *
   * Which means it is not a quantity but an index into `lib/scenarioTones.ts` — the ten hard-coded
   * schemes, best to worst. Store what that palette offers and nothing else.
   */
  level: number;
  title: string;
  subtitle: string;
}

/**
 * A group phase's scenario library, keyed by **stable strings, never array indices**.
 *
 * With indices, deleting or reordering one scenario silently renumbers every group's mapping — data
 * corruption with no error and no log. Deleting a key orphans any outcome pointing at it, which the
 * save refuses, so warn before allowing it.
 */
export type ScenarioLibrary = Record<string, Scenario>;

export interface GroupSave {
  id: number;
  name: string;
  ordinal: number;
  /** `teams.id`, not codes. No seed — seeding is the standings' job. */
  teams: number[];
  /** Finishing `position` (1-based) to a key in the phase's library. */
  outcomes: Array<{ position: number; scenarioKey: string }>;
}

/**
 * One fixture.
 *
 * **Both teams may be null, and that is not a draft state — it is how a season is written.** The shape
 * of a season settles before its field does: days, match counts, which slot is a bye and best-of are all
 * decided while teams are still applying. Upstream used to refuse a fixture missing a team, which meant
 * no structure could be saved until every slot had one; it no longer does. Filling them in later is
 * `PATCH /tournaments/schedule/:id` — a league admin's job, in `./schedule`.
 *
 * What is still refused is a **shape** error rather than an empty field: a `bye` with `teamBId` set is a
 * 422 whatever `teamAId` holds, because a bye occupies one side by construction and the other is not a
 * slot waiting to be filled. So a bye's `teamAId` may be null; its `teamBId` may not be anything else.
 */
export interface MatchSave {
  id: number;
  /** Phase-relative, 1-based. Not a season day. */
  matchDay: number;
  /** Display order within the day. */
  ordinal: number;
  kind: MatchKind;
  /** Null until someone is placed here. A bye's one team is this side. */
  teamAId: number | null;
  /** Null until someone is placed here, and **always** null on a bye. */
  teamBId: number | null;
  /** ISO 8601, or null to inherit the phase default for this match day. */
  scheduledAt: string | null;
  /** Null inherits `defaultBestOf`. */
  bestOf: BestOf | null;
  streamUrl: string | null;
}

/**
 * A match day whose kickoff is pinned rather than derived from the phase anchor.
 *
 * `matchDay` is phase-relative and **2 or more** — day 1 is the phase's own `defaultStartAt`, and a
 * row for it would give the same value two homes. Upstream answers 422 for one.
 *
 * **An entry pins the day it names and no other.** It does not cascade, and each tier answers for
 * itself, so there is nothing to walk:
 *
 *     day d = its own entry, if it has one
 *             otherwise defaultStartAt + 7 days × (d − 1)
 *
 * So "the season breaks for a week after day 4" is four entries — days 5, 6, 7, 8 — and **turning one
 * gesture into those four is this client's job.** Deliberately: the editor already has to compute the
 * same thing to preview an edit before saving it, so putting the rule upstream too would mean two
 * implementations, and the one living in the database could not be read back out of SQL. See
 * `shiftDayDefaults`.
 *
 * Clearing a day is omitting it from the array rather than sending a null, and a save with no
 * `dayDefaults` key at all clears every one of them. Applies to both phase kinds, because a match day
 * belongs to the phase rather than to its groups or its bracket.
 */
export interface DayDefault {
  matchDay: number;
  /** ISO 8601. Never null; an absent entry is how "this day inherits" is said. */
  startAt: string;
}

/** What both phase kinds carry, because a match day belongs to neither. */
export interface PhaseContentsCommon {
  /** Whole-document like everything else here: a day left out has no pinned time. */
  dayDefaults: DayDefault[];
}

export interface GroupPhaseContents extends PhaseContentsCommon {
  scenarios: ScenarioLibrary;
  groups: GroupSave[];
  matches: MatchSave[];
}

export interface SlotSave {
  /**
   * A **label**, not a number: `"1"`, or `"1A"` for the first seed out of group A.
   *
   * 1–8 letters or digits, `null` for no seed, and anything else is a 422 — no spaces, no punctuation,
   * and `""` is refused because `null` already says "none". It was a positive integer until this
   * release, so a client still sending `1` gets a 422 naming the field.
   *
   * **Nothing upstream resolves, compares or sorts it**, which is exactly what lets it be free-form: a
   * client that arranges by seed picks its own collation, and `"10"` sorting before `"2"` is that
   * client's business.
   */
  seed: string | null;
  /** Null for an entry slot — a human places the team. Set means propagation owns it. */
  src: { node: number; output: SlotOutput } | null;
}

export interface NodeSave {
  id: number;
  /** Free text. Nothing keys off it; there is no `"QF1"` and no `"GF"`. */
  label: string | null;
  /** A node always carries its match; creating one creates both. */
  match: MatchSave;
  top: SlotSave;
  bottom: SlotSave;
}

/**
 * A bracket, as the graph and nothing else.
 *
 * **There are no canvas coordinates.** `nodes` and their `src` wiring describe the bracket completely —
 * every node knows which node feeds each of its two sides — so a client arranges one by *walking* it:
 * entry nodes on the left, each node one column right of the furthest node feeding it, terminals on the
 * right. That walk is `bracketColumns`.
 *
 * `phases_bracket` carried a `layout` jsonb for exactly one release; it was always `{}` and it is gone.
 * Storing a position would only hand back what the client just sent, and it goes stale the moment the
 * graph is rewired.
 */
export interface BracketPhaseContents extends PhaseContentsCommon {
  nodes: NodeSave[];
}

export type PhaseContents = GroupPhaseContents | BracketPhaseContents;

export function isBracketContents(c: PhaseContents): c is BracketPhaseContents {
  return "nodes" in c;
}

export function isGroupContents(c: PhaseContents): c is GroupPhaseContents {
  return "groups" in c;
}

export interface PhaseDocument {
  phase: PhaseSummary;
  contents: PhaseContents;
  /**
   * Nodes whose result nothing consumes; absent for a group phase.
   *
   * There may be several — a third-place match is one — and **the server never names a final or a
   * champion.** For the last phase in a season, the winner of the one drawn rightmost is the
   * champion, and that label is the client's to apply.
   */
  terminalNodes?: number[];
}

export interface PhaseSaved {
  phase: { id: number };
  idMap: {
    matches: Record<string, number>;
    groups: Record<string, number>;
    nodes: Record<string, number>;
  };
}

// ------------------------------------------------------------------ candidates

/**
 * One team in an earlier group phase's live standings.
 *
 * `position` is 1-based **display row order**, and is what the scenario was looked up by — not
 * `rank`, which teams level on every tiebreaker share. `place` is the rank as displayed (`"T-2"`).
 */
export interface CandidateTeam {
  teamId: number;
  code: string;
  name: string;
  logo: string | null;
  rank: number;
  place: string;
  /**
   * True when this team shares its rank.
   *
   * The scenario is looked up by row, so a genuine tie for 2nd gives rows 2 and 3 *different*
   * scenarios while both are provisional. **Render a tied row's scenario as provisional**; this is
   * exactly why bracket slots are filled by hand.
   */
  tied: boolean;
  seriesWins: number;
  seriesLosses: number;
  gameWins: number;
  gameLosses: number;
  scenario: Scenario | null;
}

export interface CandidateGroup {
  group: { id: number; name: string; ordinal: number };
  teams: CandidateTeam[];
}

export interface CandidatePhase {
  phaseId: number;
  phaseName: string;
  groups: CandidateGroup[];
}

/** One `schedule_match` a propagate call rewrote. Empty when nothing was stale. */
export interface PropagationUpdate {
  scheduleMatchId: number;
  side: SlotSide;
  teamId: number | null;
}

// ----------------------------------------------------------------- normalizing

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const bool = (v: unknown): boolean => v === true;

/**
 * An unrecognized value falls back rather than being dropped.
 *
 * These vocabularies are coupled to CHECK constraints upstream, so a value this build doesn't know
 * is a deploy skew. A phase rendered as the wrong kind is visibly wrong and recoverable; a phase
 * silently missing from the list would be **deleted** by the next whole-document save.
 */
const kind = (v: unknown): PhaseKind => (v === "bracket" ? "bracket" : "group");
const matchKind = (v: unknown): MatchKind => (v === "bye" ? "bye" : "match");
const bestOf = (v: unknown, fallback: BestOf = 3): BestOf => (isBestOf(v) ? v : fallback);
const bestOfOrNull = (v: unknown): BestOf | null => (isBestOf(v) ? v : null);
const output = (v: unknown): SlotOutput => (v === "loser" ? "loser" : "winner");

function mapPhaseSummary(raw: unknown): PhaseSummary {
  const p = asRaw(raw);
  const days = asRaw(p.days);
  const matchDays = Math.max(1, int(p.matchDays, 1));

  return {
    id: int(p.id),
    kind: kind(p.kind),
    name: str(p.name),
    ordinal: int(p.ordinal, 1),
    matchDays,
    published: bool(p.published),
    defaultStartAt: strOrNull(p.defaultStartAt),
    defaultBestOf: bestOf(p.defaultBestOf),
    days: { from: int(days.from, 1), to: int(days.to, matchDays) },
  };
}

function mapMatch(raw: unknown): MatchSave {
  const m = asRaw(raw);
  return {
    id: int(m.id),
    matchDay: Math.max(1, int(m.matchDay, 1)),
    ordinal: int(m.ordinal, 1),
    kind: matchKind(m.kind),
    teamAId: intOrNull(m.teamAId),
    teamBId: intOrNull(m.teamBId),
    scheduledAt: strOrNull(m.scheduledAt),
    bestOf: bestOfOrNull(m.bestOf),
    streamUrl: strOrNull(m.streamUrl),
  };
}

function mapScenarios(raw: unknown): ScenarioLibrary {
  const out: ScenarioLibrary = {};
  for (const [key, value] of Object.entries(asRaw(raw))) {
    const s = asRaw(value);
    out[key] = {
      level: Math.min(SCENARIO_LEVELS, Math.max(1, int(s.level, 1))),
      title: str(s.title),
      subtitle: str(s.subtitle),
    };
  }
  return out;
}

function mapGroup(raw: unknown): GroupSave {
  const g = asRaw(raw);
  return {
    id: int(g.id),
    name: str(g.name),
    ordinal: int(g.ordinal, 1),
    teams: arr(g.teams).flatMap(t => {
      const id = intOrNull(t);
      return id === null ? [] : [id];
    }),
    outcomes: arr(g.outcomes).flatMap(o => {
      const row = asRaw(o);
      const position = intOrNull(row.position);
      const scenarioKey = strOrNull(row.scenarioKey);
      return position === null || scenarioKey === null ? [] : [{ position, scenarioKey }];
    }),
  };
}

function mapSlot(raw: unknown): SlotSave {
  const s = asRaw(raw);
  const src = asRaw(s.src);
  const node = intOrNull(src.node);

  return {
    // A seed this build can't send back is dropped rather than coerced. Upstream refuses a number now,
    // and `String(1)` would turn a phase written by the old client into a silent data change nobody
    // asked for — an empty box is the honest rendering of a value that has to be re-entered.
    seed: isSlotSeed(s.seed) ? s.seed : null,
    // `src.node` is the whole test for "derived". An output with no node is
    // meaningless, and upstream leaves one behind when a source is deleted.
    src: s.src === null || node === null ? null : { node, output: output(src.output) },
  };
}

function mapNode(raw: unknown): NodeSave {
  const n = asRaw(raw);
  return {
    id: int(n.id),
    label: strOrNull(n.label),
    match: mapMatch(n.match),
    top: mapSlot(n.top),
    bottom: mapSlot(n.bottom),
  };
}

/**
 * Pinned days, dropping anything unusable rather than repairing it.
 *
 * A day below 2, a missing timestamp, or a second entry for a day upstream already answered for cannot
 * be sent back — it refuses all three — so keeping one would give the editor a draft that can never
 * save. Sorted ascending, which is how upstream emits it and the order a list of days is read in.
 *
 * **A day past the end of the phase is kept**, and is the one case that is not repaired here: upstream
 * can shrink `matchDays` over a pinned day and leaves the row where it is, so `GET` returns an entry
 * `PUT` will then reject. Dropping it silently would make the editor's first save delete a time nobody
 * chose to delete. `strandedDayDefaults` is how a screen surfaces it instead.
 */
function mapDayDefaults(raw: unknown): DayDefault[] {
  const seen = new Set<number>();

  return arr(raw)
    .flatMap(d => {
      const row = asRaw(d);
      const matchDay = intOrNull(row.matchDay);
      const startAt = strOrNull(row.startAt);
      if (matchDay === null || matchDay < 2 || startAt === null || seen.has(matchDay)) return [];
      seen.add(matchDay);
      return [{ matchDay, startAt }];
    })
    .sort((a, b) => a.matchDay - b.matchDay);
}

function mapContents(kindOf: PhaseKind, raw: unknown): PhaseContents {
  const c = asRaw(raw);
  const dayDefaults = mapDayDefaults(c.dayDefaults);

  if (kindOf === "bracket") {
    return { nodes: arr(c.nodes).map(mapNode), dayDefaults };
  }

  return {
    scenarios: mapScenarios(c.scenarios),
    groups: arr(c.groups).map(mapGroup),
    matches: arr(c.matches).map(mapMatch),
    dayDefaults,
  };
}

function mapCandidateTeam(raw: unknown): CandidateTeam {
  const t = asRaw(raw);
  const scenario = asRaw(t.scenario);

  return {
    teamId: int(t.teamId),
    code: str(t.code),
    name: str(t.name),
    logo: strOrNull(t.logo),
    rank: int(t.rank, 1),
    place: str(t.place, String(int(t.rank, 1))),
    tied: bool(t.tied),
    seriesWins: int(t.seriesWins),
    seriesLosses: int(t.seriesLosses),
    gameWins: int(t.gameWins),
    gameLosses: int(t.gameLosses),
    scenario:
      t.scenario == null
        ? null
        : {
            level: Math.min(SCENARIO_LEVELS, Math.max(1, int(scenario.level, 1))),
            title: str(scenario.title),
            subtitle: str(scenario.subtitle),
          },
  };
}

// ------------------------------------------------------------------- requests

const base = (conf: string): string => `/tournaments/${encodeURIComponent(conf)}/phases`;

/** The season page's list, published or not, with every anchor intact. */
export function phaseList(conf: string, opts?: RequestOpts): Promise<PhaseSummary[]> {
  return credentialedRequest(base(conf), {}, opts).then(raw =>
    arr(asRaw(raw).phases).map(mapPhaseSummary),
  );
}

/**
 * One phase's whole document, or `null` when the phase is not in this conference.
 *
 * Upstream answers `404` for a phase belonging to another league rather than `403`, so a stale id
 * reads as absent instead of as someone else's phase. That is folded to `null` here, matching how
 * `./http` treats absence everywhere else.
 */
export function phaseDocument(
  conf: string,
  phaseId: number,
  opts?: RequestOpts,
): Promise<PhaseDocument | null> {
  return credentialedRequest(`${base(conf)}/${phaseId}`, {}, opts).then(raw => {
    const doc = asRaw(raw);
    if (doc.phase === undefined) return null;

    const phase = mapPhaseSummary(doc.phase);
    return {
      phase,
      contents: mapContents(phase.kind, doc.contents),
      ...(Array.isArray(doc.terminalNodes)
        ? {
            terminalNodes: doc.terminalNodes.flatMap(n => {
              const id = intOrNull(n);
              return id === null ? [] : [id];
            }),
          }
        : {}),
    };
  });
}

/**
 * Saves the whole phase list. **Array order is the new ordering**, and a phase absent from it is
 * deleted along with its groups, matches, bracket and codes.
 *
 * Rejects with `SaveRejected` when refused — most often because the save would move the season-day
 * range of a phase that already has games recorded in it, which would silently re-home every result.
 * Adding a phase at the end is always allowed, whatever has been played.
 */
export function savePhaseList(
  conf: string,
  phases: readonly PhaseListEntry[],
  opts?: RequestOpts,
): Promise<PhaseListSaved> {
  return credentialedRequest(base(conf), { method: "PUT", body: { phases } }, opts).then(raw => {
    const body = asRaw(raw);
    return {
      phases: arr(body.phases).map(mapPhaseSummary),
      idMap: mapIdMap(body.idMap),
    };
  });
}

/** Saves one phase's contents, whole. A child absent from `contents` is deleted. */
export function savePhaseContents(
  conf: string,
  phaseId: number,
  contents: PhaseContents,
  opts?: RequestOpts,
): Promise<PhaseSaved> {
  return credentialedRequest(
    `${base(conf)}/${phaseId}`,
    { method: "PUT", body: contents },
    opts,
  ).then(raw => {
    const body = asRaw(raw);
    const idMap = asRaw(body.idMap);
    return {
      phase: { id: int(asRaw(body.phase).id, phaseId) },
      idMap: {
        matches: mapIdMap(idMap.matches),
        groups: mapIdMap(idMap.groups),
        nodes: mapIdMap(idMap.nodes),
      },
    };
  });
}

function mapIdMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(asRaw(raw))) {
    const id = intOrNull(value);
    if (id !== null) out[key] = id;
  }
  return out;
}

/**
 * The bracket editor's side panel: every **earlier** group phase's live standings.
 *
 * Nothing is ever auto-filled from it, in either direction. The endpoint puts the information next
 * to the decision; it does not make the decision — see `tied` on `CandidateTeam` for why.
 */
export function phaseCandidates(
  conf: string,
  phaseId: number,
  opts?: RequestOpts,
): Promise<CandidatePhase[]> {
  return credentialedRequest(`${base(conf)}/${phaseId}/candidates`, {}, opts).then(raw =>
    arr(asRaw(raw).phases).map(entry => {
      const p = asRaw(entry);
      return {
        phaseId: int(p.phaseId),
        phaseName: str(p.phaseName),
        groups: arr(p.groups).map(table => {
          const t = asRaw(table);
          const g = asRaw(t.group);
          return {
            group: { id: int(g.id), name: str(g.name), ordinal: int(g.ordinal, 1) },
            teams: arr(t.teams).map(mapCandidateTeam),
          };
        }),
      };
    }),
  );
}

/**
 * Re-derives every downstream team from the results that exist now.
 *
 * Idempotent and cheap, so this is a safe button: it returns only what it actually rewrote, which is
 * an empty list when nothing was stale. It clears as well as sets — a corrected upstream result
 * sends the downstream team back to null to be re-derived.
 */
export function propagatePhase(
  conf: string,
  phaseId: number,
  opts?: RequestOpts,
): Promise<PropagationUpdate[]> {
  return credentialedRequest(
    `${base(conf)}/${phaseId}/propagate`,
    // No body, but a POST still needs the JSON content type to clear the preflight.
    { method: "POST", body: {} },
    opts,
  ).then(raw =>
    arr(asRaw(raw).updates).map(entry => {
      const u = asRaw(entry);
      return {
        scheduleMatchId: int(u.scheduleMatchId),
        side: u.side === "bottom" ? ("bottom" as const) : ("top" as const),
        teamId: intOrNull(u.teamId),
      };
    }),
  );
}

// ------------------------------------------------------------------- helpers

/**
 * The season day a phase-relative match day falls on.
 *
 * The one derivation the client is allowed to do itself, because `days.from` already came from the
 * server's own running sum — this is an addition, not a second implementation of it.
 */
export function seasonDayOf(phase: PhaseSummary, matchDay: number): number {
  return phase.days.from + matchDay - 1;
}

// ------------------------------------------------------------ bracket rounds

export interface BracketRounds {
  /**
   * Each node's round, 0-based, keyed by node id. Every node in the input has an entry.
   *
   * A **derivation, not a position.** Grouping by it is one line for a consumer that wants a column per
   * round; a consumer laying a bracket out some other way — by match day, say — uses it to order and
   * label instead, which is what the phase editor does.
   */
  depths: Map<number, number>;
  /**
   * Nodes on a cycle, if any. Their round is undefined — that is what a cycle means — so they are
   * reported as round 0 and named here for a screen to warn about.
   *
   * A bracket editor's dropdowns can exclude the three one-step mistakes (a slot drawing from its own
   * node, a node's two slots sharing a source, a second slot taking an output already consumed), but
   * `A → B → A` takes two individually-legal edits and only the save refuses it. Detecting it here means
   * the warning arrives before the 422 rather than after.
   */
  cyclic: number[];
}

/**
 * Every node's round, walked from the wiring alone — the derivation that replaces the deleted `layout`.
 *
 * **Depth is the whole rule**: a node with no source on either slot is an entry and sits at round 0, and
 * every other node sits one round past the furthest node feeding it. Terminal nodes fall out at the far
 * end without being asked for, because nothing consumes them; a third-place match lands wherever its own
 * inputs put it, which is why the server names no final.
 *
 * This is what `nodes` and their `src` wiring already say — every node knows which node feeds each of its
 * two sides — so nothing needs storing. `phases_bracket` carried a `layout` jsonb for exactly one
 * release; it was always `{}` and it is gone, because a stored position is only what the client last sent
 * and goes stale the moment the graph is rewired.
 *
 * A round is not a match day. A day is *when* a match is played and says nothing about what feeds what:
 * two rounds can share a Saturday, and one round can straddle two days. Both are real and they answer
 * different questions, so this returns the round and leaves the arrangement to the caller.
 */
export function bracketRounds(nodes: readonly NodeSave[]): BracketRounds {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const depths = new Map<number, number>();
  const cyclic = new Set<number>();
  // The path currently being resolved, as a stack rather than a set: meeting a node that is still on it
  // *is* the back edge, and the slice from that node upward is the cycle itself — which is what needs
  // naming, not just the one node the walk happened to re-enter. Without it the recursion never bottoms
  // out on `A → B → A`.
  const path: number[] = [];
  const onPath = new Set<number>();

  const depthOf = (node: NodeSave): number => {
    const known = depths.get(node.id);
    if (known !== undefined) return known;

    if (onPath.has(node.id)) {
      for (const id of path.slice(path.indexOf(node.id))) cyclic.add(id);
      return 0;
    }

    path.push(node.id);
    onPath.add(node.id);
    let depth = 0;
    for (const side of SLOT_SIDES) {
      const src = node[side].src;
      if (!src) continue;
      // A source that isn't in the list is ignored rather than treated as depth 0 — upstream nulls
      // `src_node_id` when a source is deleted, so a dangling edge is a state that really occurs.
      const from = byId.get(src.node);
      if (from) depth = Math.max(depth, depthOf(from) + 1);
    }
    path.pop();
    onPath.delete(node.id);

    // A node caught in a cycle has no honest depth, and the one computed above counted a partial walk.
    // Column 0 puts it where its lack of resolved inputs says it belongs, and `cyclic` explains it.
    // Memoizing happens after the marking, so a node can never be cached at a depth and cyclic later:
    // a cycle through it would have been found while it was still on the path.
    const answer = cyclic.has(node.id) ? 0 : depth;
    depths.set(node.id, answer);
    return answer;
  };

  for (const node of nodes) depthOf(node);

  return { depths, cyclic: [...cyclic] };
}

/**
 * Every match day's default kickoff, in order, so `[matchDay - 1]` is that day's.
 *
 *     day 1 = the phase anchor
 *     day d = its own pinned entry, otherwise the anchor plus seven days × (d − 1)
 *
 * **Each day answers for itself.** A pinned day moves that day and nothing else, and it does not become
 * the base the days after it count from — so a phase with no anchor still resolves the days it has
 * pinned, and returns null for the rest. This is `defaultTimeFor` upstream, one line per day, and the
 * one rule this client implements rather than reads.
 *
 * It has to implement it: the editor takes `dayDefaults` from its unsaved draft, so a time typed into
 * day 5 has to appear on screen before anything is saved, and no server answer can say that yet. When
 * the draft is clean the two agree, which is the invariant to check if a day ever looks wrong.
 *
 * Anywhere that is *rendering* a schedule rather than editing one already receives a resolved
 * `scheduledAt` — and the schedule editor gets `inherited` from `GET /schedule/:id`. Prefer those;
 * this is for the structure editor, which holds the whole phase.
 */
export function dayKickoffs(
  phase: PhaseSummary,
  dayDefaults: readonly DayDefault[],
): Array<Date | null> {
  const pinned = new Map<number, Date>();
  for (const d of dayDefaults) {
    const at = new Date(d.startAt);
    // Day 1 is the anchor's, and upstream refuses a row for it — it reads day 1 off the anchor even if a
    // row reaches the table some other way. Skipping it here previews exactly that.
    if (d.matchDay >= 2 && !Number.isNaN(at.getTime())) pinned.set(d.matchDay, at);
  }

  const parsed = phase.defaultStartAt ? new Date(phase.defaultStartAt) : null;
  const anchor = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  return Array.from({ length: phase.matchDays }, (_, i) => {
    const day = i + 1;
    return pinned.get(day) ?? (anchor ? new Date(anchor.getTime() + DAY_STEP_MS * i) : null);
  });
}

/**
 * The days pinned past the end of the phase, which `PUT` will reject.
 *
 * Upstream refuses a shrink over a scheduled *match* but not over a pinned day, and leaves the row where
 * it is — so `GET /:conf/phases/:id` can hand back an entry the save then rejects with `matchDay N is
 * past the end of this phase`, and echoing the document back unchanged fails until the client drops it.
 * **Guarding that is the editor's job.** The stranded row is otherwise harmless, because each day answers
 * only for itself and this one answers for no day at all.
 */
export function strandedDayDefaults(
  phase: PhaseSummary,
  dayDefaults: readonly DayDefault[],
): DayDefault[] {
  return dayDefaults.filter(d => d.matchDay > phase.matchDays);
}

/**
 * Pins every day from `fromDay` onward, moved by the same offset — the "season breaks for a week" edit.
 *
 * An entry pins one day, so a break is one entry per remaining day and **this is what turns the single
 * gesture into them.** Deliberately the client's rule: the editor already computes it to preview an
 * unsaved edit, so a second implementation upstream would be one that could not be read back out of SQL.
 *
 * Each day is pinned to *its own current resolved time* plus the offset rather than to a running total,
 * so a day that was already pinned to something irregular keeps its irregularity and simply moves. Days
 * that resolve to nothing — no anchor and no pin — are skipped: there is nothing to add a week to, and
 * inventing a base would pin a time nobody chose.
 */
export function shiftDayDefaults(
  phase: PhaseSummary,
  dayDefaults: readonly DayDefault[],
  fromDay: number,
  offsetMs: number,
): DayDefault[] {
  const resolved = dayKickoffs(phase, dayDefaults);
  const next = new Map(dayDefaults.map(d => [d.matchDay, d.startAt]));

  // Never day 1: it is the anchor, and pinning it is a 422. Shifting the whole phase is the anchor's own
  // field on the season page.
  for (let day = Math.max(2, fromDay); day <= phase.matchDays; day += 1) {
    const at = resolved[day - 1];
    if (at) next.set(day, new Date(at.getTime() + offsetMs).toISOString());
  }

  return [...next]
    .map(([matchDay, startAt]) => ({ matchDay, startAt }))
    .sort((a, b) => a.matchDay - b.matchDay);
}

/**
 * The pinned days that sit after `matchDay`, in day order — what makes the shift a *one-time* gesture.
 *
 * A shift pins every remaining day, so once it has been applied this is non-empty and the editor stops
 * offering it. That matters because the offer is computed from day `matchDay`'s own pin, which the shift
 * does not touch: an offer that stayed put would still read "3 days earlier" afterwards and move the
 * rest of the phase three days earlier *again* on every click, with each click compounding on the last.
 *
 * Days past the end of the phase are not counted. Those are stranded rows with their own notice, and a
 * shift already ignores them.
 */
export function pinnedDaysAfter(
  phase: PhaseSummary,
  dayDefaults: readonly DayDefault[],
  matchDay: number,
): number[] {
  return dayDefaults
    .filter(d => d.matchDay > matchDay && d.matchDay <= phase.matchDays)
    .map(d => d.matchDay)
    .sort((a, b) => a - b);
}

/**
 * Drops every pin after `matchDay`, putting those days back on the phase anchor — the way out of a shift.
 *
 * Not an undo: it restores *inheritance*, not whatever each day held before. Under the only state the
 * shift is offered from — no later day pinned — those are the same thing, and after any other edit the
 * button says what it does rather than pretending to remember. Stranded rows are left alone for the same
 * reason `strandedDayDefaults` does not repair them silently.
 */
export function clearDayDefaultsAfter(
  phase: PhaseSummary,
  dayDefaults: readonly DayDefault[],
  matchDay: number,
): DayDefault[] {
  return dayDefaults.filter(d => d.matchDay <= matchDay || d.matchDay > phase.matchDays);
}

/** The list entry a summary saves as. Drops `ordinal` and `days`, which the server derives. */
export function toListEntry(p: PhaseSummary): PhaseListEntry {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    matchDays: p.matchDays,
    published: p.published,
    defaultStartAt: p.defaultStartAt,
    defaultBestOf: p.defaultBestOf,
  };
}

/** Namespaced for call sites that want the surface in one object, like `api` and `adminApi`. */
export const seasonApi = {
  phaseList,
  phaseDocument,
  savePhaseList,
  savePhaseContents,
  phaseCandidates,
  propagatePhase,
};

// `layout` is deliberately absent from this module: `phases_bracket` carried one for a single release, it
// was always `{}`, and it is gone. `Tournament.layout` in `./types` is an unrelated column — the league's
// per-week best-of structure — and still very much there.
