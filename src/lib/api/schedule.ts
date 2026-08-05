/**
 * The season's **schedule**: when a match happens, who plays it, and the codes it is played on.
 *
 * The league admin's surface, and the counterpart to `./season`. The split upstream is deliberate and
 * it is the reason these are two modules rather than one: `/phases` is *structure* — phases, groups,
 * scenarios, bracket wiring, and which match days exist — and is site-admin only. Everything here
 * needs only the `schedule` scope on the conference, because running a league is not the same job as
 * reshaping its season.
 *
 * So the shapes differ where the permissions do. There is no whole-document save here: one match is
 * one `PATCH`, an absent key is left alone, and a key that belongs to structure is a `400` rather
 * than being quietly dropped. A screen built on this cannot delete a match, move it to another day,
 * or rewire a bracket, which is exactly the intent.
 */

import { credentialedRequest } from "./credentialed";
import { ApiError, getOne, type RequestOpts } from "./http";
import type { BestOf, MatchKind, PhaseKind, PropagationUpdate, SlotSide } from "./season";
import type { RiotMatch } from "./types";

// ---------------------------------------------------------------- the schedule

/** A team as the schedule names one. Codes, not ids — this payload is also the public read. */
export interface ScheduleTeam {
  code: string;
  name: string;
  logo: string | null;
}

export interface ScheduleResult {
  winsA: number;
  winsB: number;
  /** The winning team's **code**, or null while the series is undecided. */
  winner: string | null;
  hasForfeit: boolean;
}

/**
 * One match on the schedule.
 *
 * **`bestOf` and `scheduledAt` are resolved here** — the phase default is already applied, so no
 * client recomputes the seven-day step. That makes this the right shape to *render* and the wrong one
 * to *edit* from: it cannot distinguish an inherited value from a set one. `matchDetail` is the read
 * for editing.
 */
export interface ScheduleMatch {
  id: number;
  kind: MatchKind;
  bestOf: BestOf | null;
  /** ISO 8601, resolved. Null only when the phase has no anchor and the match has no override. */
  scheduledAt: string | null;
  streamUrl: string | null;
  teamA: ScheduleTeam | null;
  /** Null for a bye, and for a bracket slot nobody has reached yet. */
  teamB: ScheduleTeam | null;
  /** Null until games exist. */
  result: ScheduleResult | null;
}

export interface ScheduleDay {
  seasonDay: number;
  /** The same day counted from the start of its own phase. */
  matchDay: number;
  /**
   * The phase this day belongs to.
   *
   * The only route that needs it is `propagate`, which is phase-scoped and which a league admin may
   * call — and `GET /:conf/phases`, the other place ids come from, is site-admin. So it travels on the
   * schedule instead.
   */
  phaseId: number;
  phase: string;
  phaseKind: PhaseKind;
  matches: ScheduleMatch[];
}

// ------------------------------------------------------------------ one match

/** The raw row, as `PATCH` sees it: a null means "inherit", not "unknown". */
export interface MatchRow {
  id: number;
  phaseId: number;
  matchDay: number;
  ordinal: number;
  kind: MatchKind;
  teamAId: number | null;
  teamBId: number | null;
  scheduledAt: string | null;
  bestOf: BestOf | null;
  streamUrl: string | null;
}

export interface MatchDetail {
  match: MatchRow;
  phase: {
    id: number;
    conf: string;
    kind: PhaseKind;
    name: string;
    matchDays: number;
    defaultBestOf: BestOf;
    defaultStartAt: string | null;
  };
  seasonDay: number;
  /** What this match's nulls resolve to. Lets a picker label its empty option honestly. */
  inherited: { bestOf: BestOf; scheduledAt: string | null };
  /**
   * Slots fed by another bracket node, so **propagation owns the team and `PATCH` refuses to set
   * it.** Empty for every group match and every bracket entry slot. Disable those pickers rather than
   * offering an edit that always fails.
   */
  derivedSides: SlotSide[];
}

/**
 * A change to one match. **PATCH semantics**: an absent key is left alone, an explicit `null` clears
 * it.
 *
 * Only these five are accepted. Anything else — `matchDay`, `ordinal`, `kind`, `phaseId` — is a `400`
 * rather than a silent no-op, so a screen cannot look like it saved something it did not.
 */
export interface MatchEdit {
  scheduledAt?: string | null;
  streamUrl?: string | null;
  /** Null to go back to inheriting the phase default. */
  bestOf?: BestOf | null;
  teamAId?: number | null;
  teamBId?: number | null;
}

// ------------------------------------------------------------------- forfeits
//
// A walkover is a **result**, not a schedule change — but it is recorded from the same screen, by the
// same people, under the same `schedule` scope, because confirming a tournament code already writes a
// real result under that grant.
//
// Nothing upstream stores a match result: `series` is `matchlist ∪ forfeits`, and standings,
// `hasForfeit` and bracket propagation all read it. So writing forfeit rows *is* recording the result,
// and **one `POST` clinches the series** — the server reads what has been played and writes only the
// games the other side still needs. A caller never counts games.

/**
 * The series as the `series` view reports it.
 *
 * **`teamA`/`teamB` are the two codes sorted, and are not home and away.** The view keys on
 * `LEAST`/`GREATEST` so that every game of a series groups under one row whichever side won; they are
 * here to say which half of `winsA`/`winsB` is which, and for nothing else.
 *
 * Deliberately not `ScheduleResult`, which the schedule read serves for the same series: that one is
 * already oriented to the *match's* `teamA` and carries a resolved `winner` instead of `games`.
 * Collapsing the two would mean inventing a `winner` this payload doesn't send, or re-orienting a
 * pair whose order upstream is arbitrary.
 */
export interface SeriesSnapshot {
  teamA: string;
  teamB: string;
  winsA: number;
  winsB: number;
  /** Games in the series, forfeited ones included. */
  games: number;
  hasForfeit: boolean;
}

/**
 * A recorded walkover.
 *
 * `gamesRecorded` is which game numbers it took to clinch — `ceil(bestOf / 2)` less what the winner
 * had already won, so a team that showed up for game one and not the rest loses 2-1 rather than 2-0.
 * Worth reporting back: it is the difference between the two, and the only place the count appears.
 *
 * `winner`/`loser` are team **codes**, because that is what `forfeits` and the `series` view store —
 * while the request names the loser by **id**.
 */
export interface ForfeitRecorded {
  scheduleMatchId: number;
  conf: string;
  seasonDay: number;
  /** The side that did *not* forfeit. */
  winner: string;
  loser: string;
  bestOf: BestOf;
  /** The `game` numbers written, in order. */
  gamesRecorded: number[];
  result: SeriesSnapshot;
  /**
   * `group` or `bracket`, **so an empty `propagated` is not ambiguous** between "group phase, nothing
   * to propagate" and "bracket, and nothing moved".
   */
  phaseKind: PhaseKind;
  /** The bracket slots this walkover advanced. Always empty on a group phase. */
  propagated: PropagationUpdate[];
}

/**
 * A cleared walkover.
 *
 * **Played games are untouched.** This undoes the forfeit, not the series, so a 2-1 that was one real
 * game plus two forfeits comes back as 0-1. It clears *every* forfeited game on the match — both
 * orderings of the pair — and re-derives the bracket, which can empty a slot two rounds downstream.
 */
export interface ForfeitCleared {
  scheduleMatchId: number;
  conf: string;
  seasonDay: number;
  /** Forfeit rows deleted. Never `0`: upstream `404`s rather than answering a no-op as success. */
  deleted: number;
  result: SeriesSnapshot;
  phaseKind: PhaseKind;
  propagated: PropagationUpdate[];
}

// ---------------------------------------------------------------------- codes
//
// Registering a code is **two calls**: `checkCode` attaches it as pending and reports what Riot says
// was played, then `confirmCode` ingests. The single call that did both is gone from the API — it
// attached and ingested together, so a code pasted against the wrong match was already in the
// standings before anyone could look at it.

/**
 * Who won one **recorded** game — team codes, straight off the `matchlist` row.
 *
 * Deliberately not `ReportedTeams`, which has the same two fields and a different promise: that one is
 * Riot's report of a game *not yet recorded*, resolved from puuids at check time and shown so an admin
 * can decide whether to confirm. This one is the row that is already written. Sharing a type would let
 * a preview stand in for a result.
 */
export interface GameResult {
  winner: string;
  loser: string;
}

export interface MatchCode {
  /** The Riot tournament code, always 44 characters. */
  code: string;
  scheduleMatchId: number;
  /** The code's slot in the series, 1..bestOf. **Not** read back from `matchlist`. */
  game: number;
  /**
   * False only between a `check` and its `confirm`.
   *
   * Codes we minted ourselves are confirmed by definition — the column defaults to true — which is
   * what lets the day-wide re-check recover a game whose Riot callback never arrived.
   */
  confirmed: boolean;
  /**
   * The game ingested on this code, or `null`.
   *
   * Resolved upstream by joining `matchlist."shortCode"` rather than cached on the code row, so it
   * cannot disagree with the column the stats views actually read. A code can hold a game while
   * still being *pending*: the Riot callback links a played game to whatever code it finds without
   * checking `confirmed`.
   */
  matchId: string | null;
  /**
   * The recorded result, or `null`.
   *
   * Off the same joined `matchlist` row as `matchId`, so it costs nothing to have and is the whole
   * reason a result-only game — one with no payload for the match viewer to render — is readable at
   * all. It is also what catches a code registered against the wrong match, without opening the game.
   *
   * **`matchId` is what tells the two kinds of `null` apart, so read it first.** Upstream sends
   * `winner`/`loser` as a flat pair and nulls both for "no game on this code" *and* for "a game whose
   * `matchlist` row carries no result", which a game attached by the legacy linking path can be. Those
   * are collapsed into one nullable object here — the correlation between the two fields is not
   * something a caller should have to hold — but the distinction survives:
   *
   *  - `matchId === null` — no game. Nothing has been recorded on this code.
   *  - `matchId !== null && result === null` — a game, with an unknown result.
   */
  result: GameResult | null;
  createdAt: string | null;
}

export interface MintedCodes {
  seasonDay: number;
  /** Matches that had codes minted for them now. */
  minted: number;
  /** Matches skipped because they already held a full set — generation is idempotent per match. */
  skipped: number;
  codes: MatchCode[];
}

/**
 * One game Riot reported for a registered code.
 *
 * `duplicate` is the ordinary case for a code from Discord: the game is already in `matchlist` and was
 * linked rather than re-inserted. Only `ingested` rows are wholly new results.
 *
 * **`partial` is a success, not a soft failure.** The `matchlist` row and the match payload are
 * written, so the standings, the series and the match viewer are all correct — only `playerstats` and
 * `championstats` omit the game, because Riot no longer had its timeline or it was too short to
 * derive minute-14 stats from. Reporting it as a failure would have an admin chasing a game that
 * counted.
 *
 * **`result-only` is one step below that, and also a success.** The game was genuinely played on the
 * code, but `match-v5` denies the match id exists, so there is no payload to store: the `matchlist`
 * row is written from the winner and loser puuids Riot reported instead. Standings, series,
 * head-to-head and bracket propagation are all correct — `series` reads `matchlist` alone — but
 * `GET /m/:matchId` 404s and the match viewer has nothing to render. Kept distinct from `partial`
 * because a `partial` game is *viewable* and this one is not, and the two need different repairs;
 * re-checking the code once Riot's index recovers fetches the payload and upgrades it.
 *
 * **`forfeited` is a skip, not an error.** The series was decided by walkover, and `series` counts
 * rows — so letting a real game land on a series forfeited 2-0 would read 2-2, undecided, and retract
 * whoever the walkover advanced. Recording a forfeit does not invalidate an outstanding code, so this
 * is the ordinary outcome of a game played after one; clearing the forfeit and re-checking ingests it.
 */
export interface IngestedGame {
  status: "ingested" | "partial" | "result-only" | "duplicate" | "forfeited" | "failed";
  matchId: string;
  /** Why, for anything other than a clean `ingested`. Written to be read to an admin. */
  reason?: string;
  seasonDay?: number;
  /** The winning team's **code**. Present on `result-only`, where it is the whole result. */
  winner?: string;
  /** The losing team's **code**. */
  loser?: string;
  game?: number;
}

/**
 * A tournament code's own metadata, as Riot stored it when the code was cut.
 *
 * Two shapes reach here and both are normalized into this one: `{ conf, scheduleMatchId, seasonDay }`
 * from a code this app minted, and the older `{ week, conf }` from one the `/code` Discord command
 * cut. Every field is nullable because a legacy code carries half of them.
 *
 * **Reported, not enforced** — upstream will attach a code whose metadata names another conference,
 * because recovering a legacy day is the whole point of registering codes by hand. It is here so the
 * editor can warn before that happens.
 */
export interface CodeMeta {
  conf: string | null;
  /** The match the code was minted against. Null for a `/code`-minted one. */
  scheduleMatchId: number | null;
  /** A hint only: the season may have been reshaped since the code was cut. */
  seasonDay: number | null;
  /** The older shape's week number, where `seasonDay` is absent. */
  week: number | null;
}

/** Why one game's preview couldn't be shown. */
export interface PreviewError {
  matchId: string;
  error: string;
}

/**
 * Which two teams Riot's own report of a game names — **team codes**, not ids or puuids.
 *
 * Resolved upstream from the winner and loser puuids `games/by-code` returned, through the same
 * roster vote ingest itself runs, so **this is what confirming will record**. That makes it worth
 * comparing against the scheduled match's own two teams before confirming: a disagreement is the
 * "pasted against the wrong match" mistake, caught by the result rather than by the metadata.
 */
export interface ReportedTeams {
  /** The winning team's code. */
  winner: string;
  /** The losing team's code. */
  loser: string;
}

/**
 * What `check` found — **step one**, which writes nothing but the pending code row.
 *
 * Reading the outcome needs both flags, and they come from **two different Riot calls**: `codeValid`
 * is whether the code is real (`codes/{code}`, the only endpoint that can answer it), `exists` is
 * whether anything has been played on it (`games/by-code`, which 404s for an unknown code and a real
 * unplayed one alike and so cannot tell a typo from an unstarted lobby). Any other Riot failure is a
 * `502`, not one of these — an expired API key used to be indistinguishable from an unplayed code.
 */
export interface CodeCheck {
  code: string;
  scheduleMatchId: number;
  /**
   * The slot the code was attached to — the next free one when the caller didn't name it.
   *
   * **`null` when `codeValid` is false**, because an unknown code is deliberately *not* attached:
   * there would be no game for a later re-check to find, so staging a typo would park a permanently
   * dead row in a game slot. Nothing to confirm, and nothing to delete.
   */
  game: number | null;
  /** Always false here. `confirm` is what sets it. */
  confirmed: boolean;
  /** False when Riot has no such code. Nothing will ever be ingested on it. */
  codeValid: boolean;
  /** Whether the code's `providerId` is ours — false for a legacy or third-party code. */
  mintedByUs: boolean;
  /** The code's own metadata, or `null` when it wasn't readable JSON. */
  codeMeta: CodeMeta | null;
  /** Whether any game has been played on the code yet. */
  exists: boolean;
  matchIds: string[];
  /**
   * The raw match-v5 payload per id, **index-aligned with `matchIds`** — the shape `GET /m/:matchId`
   * serves, so the match viewer renders it unchanged. **Nothing is stored**: an unstored game is
   * fetched from Riot for the preview and thrown away.
   *
   * An entry is `null` only when the preview genuinely couldn't be had, and `previewErrors` then
   * carries the reason. Upstream degrades rather than failing the check, since the code lookup has
   * already proved the game exists.
   */
  matchData: (RiotMatch | null)[];
  previewErrors: PreviewError[];
  /**
   * Who Riot says played each game, **index-aligned with `matchIds`** — and the *only* thing here that
   * says so when `matchData` is `null`.
   *
   * A payload answers the question implicitly, by carrying its participants; a game `match-v5` denies
   * exists carries nothing, and those are exactly the ones worth a second look. So the reported
   * winner and loser are resolved to team codes and returned outright.
   *
   * An entry is `null` when Riot named no teams or the rosters don't cover them — both are just
   * "unknown", which is why there is no error list for it. There is no `null`-padding upstream either,
   * so read it as `reportedTeams[i] ?? null` and treat a short array as unknown rather than as a
   * shifted one.
   */
  reportedTeams: (ReportedTeams | null)[];
}

/** What `confirm` ingested — **step two**, and the only one that writes a result. */
export interface ConfirmedCode {
  code: string;
  scheduleMatchId: number;
  game: number;
  /** Always true here. */
  confirmed: boolean;
  /** One entry per game Riot knew about — empty when the code has not been played on. */
  ingested: IngestedGame[];
}

/**
 * A re-check sweep, over one match or a whole season day.
 *
 * `errors` is why this is worth reading rather than firing and forgetting: a Riot failure on one
 * code is collected so the rest of the night still recovers, but it is **reported**, not swallowed.
 */
export interface CodeSweep {
  /** Only on the day-wide sweep. */
  seasonDay?: number;
  /** Codes looked at — the confirmed, uningested ones. Pending codes are skipped by design. */
  checked: number;
  ingested: IngestedGame[];
  errors: { code: string; error: string }[];
}

/** What a `409` from `check` says about the code that is in the way. */
export interface CodeConflict {
  /** The match already holding the code, or the one whose slot is taken. */
  scheduleMatchId: number | null;
  game: number | null;
  /** Whether the code already registered is confirmed. Absent on the slot-taken shape. */
  confirmed?: boolean;
  /** The confirmed code already holding the target slot. Absent on the already-registered shape. */
  heldBy?: string;
}

export interface DeletedCode {
  deleted: string;
  scheduleMatchId: number;
  /** The game removed with it, or `null` when the code never produced one. */
  ingestRemoved: string | null;
}

// --------------------------------------------------------------------- linking

/**
 * A played game with no scheduled match, from the `unscheduled_games` view.
 *
 * The one audit view allowed to be non-empty: every season predating the schedule lists here forever,
 * so this is a worklist rather than an alarm.
 */
export interface UnscheduledGame {
  matchId: string;
  conf: string;
  /** The day the result was **recorded** on. Legacy numbers predate the phases. */
  seasonDay: number;
  startTime: string | null;
  shortCode: string | null;
  winner: string | null;
  loser: string | null;
  game: number;
}

export interface GameCandidates {
  scheduleMatchId: number;
  seasonDay: number;
  /**
   * Unlinked games whose team pair matches, **closest season day first**.
   *
   * Ranked by the day rather than filtered on it: a legacy day number is exactly the thing that may
   * not line up, so it orders the answers instead of discarding them.
   */
  candidates: UnscheduledGame[];
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

const BEST_OFS: readonly unknown[] = [1, 3, 5];
const bestOfOrNull = (v: unknown): BestOf | null => (BEST_OFS.includes(v) ? (v as BestOf) : null);
const bestOf = (v: unknown): BestOf => bestOfOrNull(v) ?? 3;
const matchKind = (v: unknown): MatchKind => (v === "bye" ? "bye" : "match");
const phaseKind = (v: unknown): PhaseKind => (v === "bracket" ? "bracket" : "group");

function mapTeam(raw: unknown): ScheduleTeam | null {
  if (raw == null) return null;
  const t = asRaw(raw);
  const code = str(t.code);
  if (code === "") return null;
  return { code, name: str(t.name, code), logo: strOrNull(t.logo) };
}

function mapResult(raw: unknown): ScheduleResult | null {
  if (raw == null) return null;
  const r = asRaw(raw);
  return {
    winsA: int(r.winsA),
    winsB: int(r.winsB),
    winner: strOrNull(r.winner),
    hasForfeit: r.hasForfeit === true,
  };
}

function mapScheduleMatch(raw: unknown): ScheduleMatch {
  const m = asRaw(raw);
  return {
    id: int(m.id),
    kind: matchKind(m.kind),
    bestOf: bestOfOrNull(m.bestOf),
    scheduledAt: strOrNull(m.scheduledAt),
    streamUrl: strOrNull(m.streamUrl),
    teamA: mapTeam(m.teamA),
    teamB: mapTeam(m.teamB),
    result: mapResult(m.result),
  };
}

function mapDay(raw: unknown): ScheduleDay {
  const d = asRaw(raw);
  return {
    seasonDay: int(d.seasonDay, 1),
    matchDay: int(d.matchDay, 1),
    // 0 for an API too old to send it, which `ScheduleSection` reads as "no resync available" rather
    // than posting to `/phases/0/propagate` and getting a 400.
    phaseId: int(d.phaseId),
    phase: str(d.phase),
    phaseKind: phaseKind(d.phaseKind),
    matches: arr(d.matches).map(mapScheduleMatch),
  };
}

function mapRow(raw: unknown): MatchRow {
  const m = asRaw(raw);
  return {
    id: int(m.id),
    phaseId: int(m.phaseId),
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

/**
 * `ownerId` is the match the codes were asked for.
 *
 * `GET /schedule/:id/codes` does **not** send `scheduleMatchId` — it describes the codes of one
 * match, so the id is the one in the URL. The mint response does send it, because it spans a whole
 * day. Falling back to the requested id keeps the field honest on both instead of reading `0` on
 * one of them.
 */
function mapCode(raw: unknown, ownerId: number): MatchCode {
  const c = asRaw(raw);
  return {
    code: str(c.code),
    scheduleMatchId: int(c.scheduleMatchId, ownerId),
    game: int(c.game, 1),
    // Absent means minted, and a minted code is confirmed by definition.
    confirmed: c.confirmed !== false,
    matchId: strOrNull(c.matchId),
    result: mapGameResult(c.winner, c.loser),
    createdAt: strOrNull(c.createdAt ?? c.created_at),
  };
}

/**
 * The flat `winner`/`loser` pair as one nullable object.
 *
 * **Both codes or neither.** Upstream nulls the pair together, and a half-result would name a winner
 * with no opponent — which reads as a bye rather than as "unknown". Whether the `null` means "no game"
 * or "a game with no result" is answered by `matchId`, not here; see `MatchCode.result`.
 */
function mapGameResult(rawWinner: unknown, rawLoser: unknown): GameResult | null {
  const winner = strOrNull(rawWinner);
  const loser = strOrNull(rawLoser);

  return winner === null || loser === null ? null : { winner, loser };
}

function mapGame(raw: unknown): UnscheduledGame {
  const g = asRaw(raw);
  return {
    matchId: str(g.matchId),
    conf: str(g.conf),
    seasonDay: int(g.seasonDay),
    startTime: strOrNull(g.startTime),
    shortCode: strOrNull(g.shortCode)?.trim() ?? null,
    winner: strOrNull(g.winner),
    loser: strOrNull(g.loser),
    game: int(g.game, 1),
  };
}

// ------------------------------------------------------------------- requests

const forConf = (conf: string): string => `/tournaments/${encodeURIComponent(conf)}`;
const forMatch = (id: number): string => `/tournaments/schedule/${id}`;

/**
 * The whole schedule, or one season day of it, grouped by day.
 *
 * Uncredentialed — this is the public read, and it goes through `./http` so a not-yet-deployed route
 * degrades to an empty list rather than throwing. The consequence to know: **unpublished phases are
 * omitted** unless the session can edit the conference, and upstream decides that with the `admin`
 * scope, so a `schedule`-only grant sees published phases only. A section that has to show
 * unpublished days needs the structure read instead.
 */
export async function schedule(
  conf: string,
  day?: number,
  opts?: RequestOpts,
): Promise<ScheduleDay[]> {
  const path = day === undefined ? `${forConf(conf)}/schedule` : `${forConf(conf)}/schedule/${day}`;
  const body = await getOne<unknown>(path, opts);
  return arr(asRaw(body).days).map(mapDay);
}

/** One match, raw, with what its nulls inherit and which sides propagation owns. */
export function matchDetail(id: number, opts?: RequestOpts): Promise<MatchDetail | null> {
  return credentialedRequest(forMatch(id), {}, opts).then(raw => {
    const body = asRaw(raw);
    if (body.match === undefined) return null;

    const phase = asRaw(body.phase);
    const inherited = asRaw(body.inherited);
    const match = mapRow(body.match);

    return {
      match,
      phase: {
        id: int(phase.id),
        conf: str(phase.conf),
        kind: phaseKind(phase.kind),
        name: str(phase.name),
        matchDays: Math.max(1, int(phase.matchDays, 1)),
        defaultBestOf: bestOf(phase.defaultBestOf),
        defaultStartAt: strOrNull(phase.defaultStartAt),
      },
      seasonDay: int(body.seasonDay, match.matchDay),
      inherited: {
        bestOf: bestOf(inherited.bestOf),
        scheduledAt: strOrNull(inherited.scheduledAt),
      },
      derivedSides: arr(body.derivedSides).flatMap(s =>
        s === "top" || s === "bottom" ? [s as SlotSide] : [],
      ),
    };
  });
}

/**
 * Changes one match. Send only what moved.
 *
 * Rejects with `SaveRejected` on a `422` — a team booked twice on one season day, or a team set on a
 * slot propagation owns — and with `ApiError` on a `400`, which here means a key that is not one of
 * the five editable ones.
 */
export function editMatch(
  id: number,
  changes: MatchEdit,
  opts?: RequestOpts,
): Promise<MatchRow> {
  return credentialedRequest(forMatch(id), { method: "PATCH", body: changes }, opts).then(raw =>
    mapRow(asRaw(raw).match),
  );
}

/**
 * Awards the series against one team. **One call clinches it.**
 *
 * `loserTeamId` is a **team id**, matching `teamAId`/`teamBId` on the match — not a code, which is
 * what comes back. The server reads what has already been played and writes only the games the winner
 * still needs, so a caller must not compute a scoreline and send it: a team that played game one and
 * no-showed the rest ends 2-1, and `gamesRecorded` reports which games that took.
 *
 * Two consequences that surface elsewhere, both worth knowing before offering this as a button:
 *
 *  - **It freezes the phase's season-day range.** `seasonFacts` counts a forfeit day as played and a
 *    phase with a result in it cannot be moved or resized, so the refusal arrives later, from the
 *    structure editor. `clearForfeit` lifts it only if nothing else remains in the range.
 *  - **A game played on a forfeited match will not ingest.** An outstanding tournament code is not
 *    invalidated by the walkover, and `series` counts rows, so ingest refuses and reports `forfeited`
 *    rather than letting a 2-0 forfeit read 2-2 and retract whoever it advanced. Clearing the forfeit
 *    and re-checking the code ingests it.
 *
 * Rejects with `ApiError` `409` when the series is already decided — the message distinguishes
 * decided-by-play, which nothing here fixes, from decided-by-forfeit, which `clearForfeit` does — and
 * when either team is booked twice on the season day; and with `SaveRejected` `422` for a team that is
 * not playing this match, a match with an empty side, a bye, or a team in another conference.
 */
export function forfeitMatch(
  id: number,
  loserTeamId: number,
  opts?: RequestOpts,
): Promise<ForfeitRecorded> {
  return credentialedRequest(
    `${forMatch(id)}/forfeit`,
    { method: "POST", body: { loserTeamId } },
    opts,
  ).then(raw => {
    const body = asRaw(raw);
    return {
      scheduleMatchId: int(body.scheduleMatchId, id),
      conf: str(body.conf),
      seasonDay: int(body.seasonDay),
      winner: str(body.winner),
      loser: str(body.loser),
      bestOf: bestOf(body.bestOf),
      gamesRecorded: arr(body.gamesRecorded).map(g => int(g)),
      result: mapSeries(body.result),
      phaseKind: phaseKind(body.phaseKind),
      propagated: arr(body.propagated).map(mapPropagated),
    };
  });
}

/**
 * Takes the walkover back. **Played games are untouched.**
 *
 * Clears every forfeited game on the match and re-derives the bracket, which can empty a slot two
 * rounds downstream — so `propagated` is worth reading rather than discarding.
 *
 * Rejects with `ApiError` `404` when there is no forfeit to clear, which is upstream refusing to
 * answer `200` with `deleted: 0` for a screen that is simply out of date about there being one.
 */
export function clearForfeit(id: number, opts?: RequestOpts): Promise<ForfeitCleared> {
  // No body: `DELETE` is exempt from the content-type gate upstream, and sending one would add a
  // header the route does not ask for.
  return credentialedRequest(`${forMatch(id)}/forfeit`, { method: "DELETE" }, opts).then(raw => {
    const body = asRaw(raw);
    return {
      scheduleMatchId: int(body.scheduleMatchId, id),
      conf: str(body.conf),
      seasonDay: int(body.seasonDay),
      deleted: int(body.deleted),
      result: mapSeries(body.result),
      phaseKind: phaseKind(body.phaseKind),
      propagated: arr(body.propagated).map(mapPropagated),
    };
  });
}

/** The `series` view's own row: the pair sorted by code, with the counts that go with it. */
function mapSeries(raw: unknown): SeriesSnapshot {
  const r = asRaw(raw);
  return {
    teamA: str(r.teamA),
    teamB: str(r.teamB),
    winsA: int(r.winsA),
    winsB: int(r.winsB),
    games: int(r.games),
    hasForfeit: r.hasForfeit === true,
  };
}

/** One slot a clinch or a retraction rewrote. `teamId` is null where a slot was emptied. */
function mapPropagated(raw: unknown): PropagationUpdate {
  const u = asRaw(raw);
  return {
    scheduleMatchId: int(u.scheduleMatchId),
    side: u.side === "bottom" ? "bottom" : "top",
    teamId: intOrNull(u.teamId),
  };
}

/**
 * Mints codes for every match on a season day, one Riot call per match.
 *
 * **Idempotent per match**: a match already holding its full set is skipped rather than given a
 * second batch, because duplicate codes are lobby confusion nobody can clean up afterwards. Not
 * gated on `published`, and minted for matches with no teams yet — codes are cheap and never expire,
 * so preparing an unannounced day is normal.
 */
export function mintCodes(
  conf: string,
  seasonDay: number,
  opts?: RequestOpts,
): Promise<MintedCodes> {
  return credentialedRequest(
    `${forConf(conf)}/schedule/${seasonDay}/codes`,
    { method: "POST", body: {} },
    opts,
  ).then(raw => {
    const body = asRaw(raw);
    return {
      seasonDay: int(body.seasonDay, seasonDay),
      minted: int(body.minted),
      skipped: int(body.skipped),
      // Minted codes span the day, so each row names its own match; 0 is the fallback nothing hits.
      codes: arr(body.codes).map(c => mapCode(c, 0)),
    };
  });
}

/** The codes one match already holds, each with its confirmation and ingest state. */
export function matchCodes(id: number, opts?: RequestOpts): Promise<MatchCode[]> {
  return credentialedRequest(`${forMatch(id)}/codes`, {}, opts).then(raw =>
    arr(asRaw(raw).codes).map(c => mapCode(c, id)),
  );
}

/**
 * **Step one.** Attaches a code minted elsewhere — a `/code` Discord command, most likely — to a
 * scheduled match as *pending*, and reports what Riot says was played on it.
 *
 * **Ingests nothing.** The single call that attached and ingested together is gone: a code pasted
 * against the wrong match was in the standings before anyone could look at it, and this step is the
 * chance to look. `confirmCode` is what commits.
 *
 * The pending row is written rather than held in memory on purpose, so a code with no game yet
 * survives the request — it stays attached and a later re-check picks the game up. **An unknown code
 * is the exception and is not attached at all**, which is why `game` comes back `null` for one:
 * there is no game for a re-check to find, so staging a typo would park a dead row in a game slot.
 * A caller must not then try to delete it — there is nothing there.
 *
 * Omit `game` to take the next free slot. Rejects with `ApiError` `409` when the code is registered
 * elsewhere or a confirmed code already holds the slot (see `codeConflict`), and `502` when Riot
 * itself failed — which is deliberately *not* reported as "nothing played".
 */
export function checkCode(
  id: number,
  code: string,
  game?: number,
  opts?: RequestOpts,
): Promise<CodeCheck> {
  return credentialedRequest(
    `${forMatch(id)}/codes/check`,
    { method: "POST", body: game === undefined ? { code } : { code, game } },
    opts,
  ).then(raw => {
    const body = asRaw(raw);
    return {
      code: str(body.code, code),
      scheduleMatchId: int(body.scheduleMatchId, id),
      // Null is meaningful here — an unknown code is not attached — so no fallback.
      game: intOrNull(body.game),
      confirmed: body.confirmed === true,
      codeValid: body.codeValid === true,
      mintedByUs: body.mintedByUs === true,
      codeMeta: mapCodeMeta(body.codeMeta),
      exists: body.exists === true,
      matchIds: arr(body.matchIds).map(v => str(v)),
      // Passed through unnormalized: this is the payload the match viewer already reads.
      matchData: arr(body.matchData).map(m => (m && typeof m === "object" ? (m as RiotMatch) : null)),
      previewErrors: arr(body.previewErrors).flatMap(e => {
        const row = asRaw(e);
        const matchId = str(row.matchId);
        return matchId === "" ? [] : [{ matchId, error: str(row.error, "unknown failure") }];
      }),
      // Mapped one-for-one, never filtered: the index *is* the link back to `matchIds`, so a pair
      // upstream couldn't resolve has to stay in place as a null rather than shifting its neighbours.
      reportedTeams: arr(body.reportedTeams).map(mapReportedTeams),
    };
  });
}

/**
 * One game's reported teams, or `null`.
 *
 * Both codes or neither. A pair missing a side names no result — nothing to show and nothing to
 * compare the scheduled match against — and reporting half of one as a winner with no opponent would
 * read as a bye.
 */
function mapReportedTeams(raw: unknown): ReportedTeams | null {
  if (raw == null || typeof raw !== "object") return null;
  const t = asRaw(raw);
  const winner = strOrNull(t.winner);
  const loser = strOrNull(t.loser);

  return winner === null || loser === null ? null : { winner, loser };
}

/**
 * The code's metadata, flattened.
 *
 * Both shapes go through here — `{ conf, scheduleMatchId, seasonDay }` from a code we minted and
 * `{ week, conf }` from a `/code` one — so a caller reads one type and tests fields rather than
 * sniffing which shape arrived. `null` in, `null` out: upstream sends that for metadata it couldn't
 * parse, and an object of four nulls would read as "we know, and it's empty".
 */
function mapCodeMeta(raw: unknown): CodeMeta | null {
  if (raw == null || typeof raw !== "object") return null;
  const m = asRaw(raw);

  return {
    conf: strOrNull(m.conf),
    scheduleMatchId: intOrNull(m.scheduleMatchId),
    seasonDay: intOrNull(m.seasonDay),
    week: intOrNull(m.week),
  };
}

/**
 * **Step two.** Confirms a checked code and ingests the game.
 *
 * Asks Riot again rather than trusting the check — the check may have been minutes ago, and a game
 * finished since then should land. Idempotent: confirming a confirmed code re-runs ingest, which is
 * how a code confirmed *before* its game was played eventually picks it up. So confirming a code
 * with nothing on it yet is a reasonable thing to do, not a mistake.
 */
export function confirmCode(id: number, code: string, opts?: RequestOpts): Promise<ConfirmedCode> {
  return credentialedRequest(
    `${forMatch(id)}/codes/${encodeURIComponent(code)}/confirm`,
    { method: "POST", body: {} },
    opts,
  ).then(raw => {
    const body = asRaw(raw);
    return {
      code: str(body.code, code),
      scheduleMatchId: int(body.scheduleMatchId, id),
      game: int(body.game, 1),
      confirmed: body.confirmed !== false,
      ingested: arr(body.ingested).map(mapIngested),
    };
  });
}

/**
 * Removes a code, and the game ingested on it.
 *
 * **The permission depends on what would be destroyed**, so this can answer `403` after the session
 * has already been accepted: a *pending* code holding no game needs only the league `schedule`
 * scope — it is the caller abandoning their own check — while anything else is site-admin, because
 * removing it cascades `matchdata`, `performance` and `teamperformance` away.
 *
 * Note the second case is gated on **having an ingested game**, not on `confirmed`: the Riot
 * callback links a played game to whatever code it finds without checking `confirmed`, so a merely
 * staged code can have stats behind it. A `409` means the code was confirmed between the read and
 * the delete, which fails closed rather than deleting a confirmed code.
 */
export function deleteCode(id: number, code: string, opts?: RequestOpts): Promise<DeletedCode> {
  return credentialedRequest(
    `${forMatch(id)}/codes/${encodeURIComponent(code)}`,
    { method: "DELETE" },
    opts,
  ).then(raw => {
    const body = asRaw(raw);
    return {
      deleted: str(body.deleted, code),
      scheduleMatchId: int(body.scheduleMatchId, id),
      ingestRemoved: strOrNull(body.ingestRemoved),
    };
  });
}

/**
 * Re-checks one match's confirmed codes, ingesting anything now played.
 *
 * The recovery path for a Riot callback that never arrived. **Pending codes are skipped** —
 * ingesting one would make the decision `confirmCode` exists to ask.
 */
export function recheckMatchCodes(id: number, opts?: RequestOpts): Promise<CodeSweep> {
  return credentialedRequest(`${forMatch(id)}/codes/recheck`, { method: "POST", body: {} }, opts).then(
    mapSweep,
  );
}

/**
 * The same sweep across a whole season day — what recovers a night in one call.
 *
 * Codes we minted are confirmed by definition, so this reaches every game played on one whose
 * callback was missed.
 */
export function recheckDayCodes(
  conf: string,
  seasonDay: number,
  opts?: RequestOpts,
): Promise<CodeSweep> {
  return credentialedRequest(
    `${forConf(conf)}/schedule/${seasonDay}/codes/recheck`,
    { method: "POST", body: {} },
    opts,
  ).then(mapSweep);
}

function mapSweep(raw: unknown): CodeSweep {
  const body = asRaw(raw);
  return {
    ...(intOrNull(body.seasonDay) === null ? {} : { seasonDay: int(body.seasonDay) }),
    checked: int(body.checked),
    ingested: arr(body.ingested).map(mapIngested),
    errors: arr(body.errors).flatMap(e => {
      const row = asRaw(e);
      const code = str(row.code);
      return code === "" ? [] : [{ code, error: str(row.error, "unknown failure") }];
    }),
  };
}

/**
 * What a `409` from `checkCode` says about the code in the way, or `null` for any other failure.
 *
 * The message alone ("that code is already registered") does not say *where*, and the mistake this
 * whole flow exists to catch is a code pasted against the wrong match — so the match and game that
 * hold it are the useful part of the answer.
 */
export function codeConflict(e: unknown): CodeConflict | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const body = asRaw(e.body);
  const heldBy = strOrNull(body.heldBy);

  return {
    scheduleMatchId: intOrNull(body.scheduleMatchId),
    game: intOrNull(body.game),
    ...(typeof body.confirmed === "boolean" ? { confirmed: body.confirmed } : {}),
    ...(heldBy === null ? {} : { heldBy }),
  };
}

const INGEST_STATUSES: readonly unknown[] = [
  "ingested",
  "partial",
  "result-only",
  "forfeited",
  "failed",
];

function mapIngested(raw: unknown): IngestedGame {
  const g = asRaw(raw);
  const reason = strOrNull(g.reason);

  return {
    // `duplicate` is the fallback because it is the outcome that changes nothing: reading an
    // unrecognised status as `ingested` would report a new result that isn't there.
    status: INGEST_STATUSES.includes(g.status) ? (g.status as IngestedGame["status"]) : "duplicate",
    matchId: str(g.matchId),
    ...(reason === null ? {} : { reason }),
    ...(intOrNull(g.seasonDay) === null ? {} : { seasonDay: int(g.seasonDay) }),
    ...(strOrNull(g.winner) === null ? {} : { winner: str(g.winner) }),
    ...(strOrNull(g.loser) === null ? {} : { loser: str(g.loser) }),
    ...(intOrNull(g.game) === null ? {} : { game: int(g.game) }),
  };
}

/** Played games in this conference with no scheduled match. A worklist. */
export function unscheduledGames(
  conf: string,
  opts?: RequestOpts,
): Promise<UnscheduledGame[]> {
  return credentialedRequest(`${forConf(conf)}/unscheduled-games`, {}, opts).then(raw =>
    arr(asRaw(raw).games).map(mapGame),
  );
}

/** Likely games for one scheduled match, best first. Empty when the match has no teams yet. */
export function gameCandidates(id: number, opts?: RequestOpts): Promise<GameCandidates> {
  return credentialedRequest(`${forMatch(id)}/game-candidates`, {}, opts).then(raw => {
    const body = asRaw(raw);
    return {
      scheduleMatchId: int(body.scheduleMatchId, id),
      seasonDay: int(body.seasonDay),
      candidates: arr(body.candidates).map(mapGame),
    };
  });
}

/**
 * Links or unlinks one played game.
 *
 * **Never rewrites the game's `seasonDay`.** That number is what `series` grouped on and what
 * standings were computed from, so changing it retroactively would move a result between series. The
 * link is metadata about a historical game, not a correction to it.
 */
export function linkGame(
  id: number,
  matchId: string,
  linked: boolean,
  opts?: RequestOpts,
): Promise<{ matchId: string; scheduleMatchId: number | null }> {
  return credentialedRequest(
    `${forMatch(id)}/games/${encodeURIComponent(matchId)}`,
    { method: "PATCH", body: { linked } },
    opts,
  ).then(raw => {
    const body = asRaw(raw);
    return {
      matchId: str(body.matchId, matchId),
      scheduleMatchId: intOrNull(body.scheduleMatchId),
    };
  });
}

export const scheduleApi = {
  schedule,
  matchDetail,
  editMatch,
  forfeitMatch,
  clearForfeit,
  mintCodes,
  matchCodes,
  checkCode,
  confirmCode,
  deleteCode,
  recheckMatchCodes,
  recheckDayCodes,
  unscheduledGames,
  gameCandidates,
  linkGame,
};
