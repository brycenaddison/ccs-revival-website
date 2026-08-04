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
import { getOne, type RequestOpts } from "./http";
import type { BestOf, MatchKind, PhaseKind, SlotSide } from "./season";

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

// ---------------------------------------------------------------------- codes

export interface MatchCode {
  /** The Riot tournament code, always 44 characters. */
  code: string;
  scheduleMatchId: number;
  /** 1..bestOf. */
  game: number;
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
 * linked rather than re-inserted. Only `ingested` rows are new results.
 */
export interface IngestedGame {
  status: "ingested" | "duplicate" | "failed";
  matchId: string;
  seasonDay?: number;
  winner?: string;
  loser?: string;
  game?: number;
}

export interface RegisteredCode {
  code: string;
  scheduleMatchId: number;
  game: number;
  /** One entry per game Riot knew about — empty when the code was never played on. */
  ingested: IngestedGame[];
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

function mapCode(raw: unknown): MatchCode {
  const c = asRaw(raw);
  return {
    code: str(c.code),
    scheduleMatchId: int(c.scheduleMatchId),
    game: int(c.game, 1),
    createdAt: strOrNull(c.createdAt ?? c.created_at),
  };
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
      codes: arr(body.codes).map(mapCode),
    };
  });
}

/** The codes one match already holds. */
export function matchCodes(id: number, opts?: RequestOpts): Promise<MatchCode[]> {
  return credentialedRequest(`${forMatch(id)}/codes`, {}, opts).then(raw =>
    arr(asRaw(raw).codes).map(mapCode),
  );
}

/**
 * Attaches a code minted elsewhere — a `/code` Discord command, most likely — to a scheduled match,
 * and ingests whatever was played on it.
 *
 * This is how a past day is recovered: open its schedule and paste in the codes that were posted at
 * the time. It is the bulk half of legacy linking, and the better tool whenever the codes are still
 * findable, because it numbers the games properly rather than just labelling them.
 */
export function registerCode(
  id: number,
  code: string,
  game: number,
  opts?: RequestOpts,
): Promise<RegisteredCode> {
  return credentialedRequest(
    `${forMatch(id)}/codes`,
    { method: "POST", body: { code, game } },
    opts,
  ).then(raw => {
    const body = asRaw(raw);
    return {
      code: str(body.code, code),
      scheduleMatchId: int(body.scheduleMatchId, id),
      game: int(body.game, game),
      ingested: arr(body.ingested).map(mapIngested),
    };
  });
}

function mapIngested(raw: unknown): IngestedGame {
  const g = asRaw(raw);
  const status = g.status;

  return {
    status: status === "ingested" || status === "failed" ? status : "duplicate",
    matchId: str(g.matchId),
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
  mintCodes,
  matchCodes,
  registerCode,
  unscheduledGames,
  gameCandidates,
  linkGame,
};
