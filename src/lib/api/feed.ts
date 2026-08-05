/**
 * The two **reader-facing** fixture reads: every league's schedule in one list, and one best-of in
 * full.
 *
 * The counterpart to `./schedule`, and the split is the same one `./seasonView` makes against
 * `./season`. That module is the league admin's surface — `/tournaments/:conf/schedule`, one
 * conference grouped by season day, credentialed, and paired with the writes that edit it. These two
 * are what a viewer sees: cross-conference, flat, resolved, ordered by kickoff, and anonymous.
 *
 * -   `GET /schedule` is the read behind the ticker, `/scores` and `/schedule`. **All three are this
 *     endpoint with a different window**, which is why there is one of it and not three: the status
 *     rules are the interesting part and a second copy of them would drift.
 * -   `GET /tournaments/schedule/:id/result` is the read behind `/match/:scheduleMatchId`. It is keyed
 *     on the **fixture**, which is the whole point of it — the `series` view groups on
 *     `(conf, season_day, teamA, teamB)` and cannot separate a double-header, and this can. Where the
 *     two disagree, this one is right.
 *
 * Both go through `getOne`, uncredentialed, like `./seasonView`. The consequence worth knowing:
 * upstream hides an unpublished phase's fixtures from anyone who cannot edit that conference, and an
 * anonymous request can never be that person. Correct for a public page; a surface that must show
 * unpublished days wants `./schedule` or `./season` instead.
 */

import { getOne, type RequestOpts } from "./http";
import { hexFromInt, httpsUrl, normalizeRole, num, numOrNull, type Numeric, type Role } from "./normalize";
import type { MatchKind, PhaseKind } from "./season";
import type { TeamRecord } from "./types";
import { mapTeamRecord } from "./client";

// ---------------------------------------------------------------- vocabulary

/**
 * How a fixture stands relative to the clock, **derived server-side** so no client invents its own.
 *
 *  - `completed` — clinched; or every game played; or games recorded but quiet for over 8 hours.
 *  - `live` — a game arrived in the last 8 hours, or the kickoff passed that recently.
 *  - `upcoming` — kickoff in the future, both teams known.
 *  - `pending` — no result and not now: no kickoff, a side still TBD, or a kickoff nobody turned up for.
 *
 * A clinch wins outright: a best-of-three going 2-0 reads `completed` the instant its second game is
 * ingested, whatever the clock says.
 *
 * **Not the same vocabulary as `SeasonMatchStatus`** (`played | scheduled | pending`), which the
 * bracket cards carry. That one is older and shipped, and upstream keeps both rather than changing it
 * under existing clients — so the two coexist and neither maps onto the other.
 */
export type MatchStatus = "completed" | "live" | "upcoming" | "pending";

export const MATCH_STATUSES: readonly MatchStatus[] = ["completed", "live", "upcoming", "pending"];

/**
 * A team as these payloads name one on the *list* read.
 *
 * `color` is the raw integer column and `colorHex` is it rendered, carried together for the reason
 * `SeasonTeam` and `TeamRecord` do: 0 and null both mean "unset", and only the mapper should have to
 * know that. Shaped so `toBadge` in `lib/leagueAdapters.ts` takes it unchanged.
 */
export interface FeedTeam {
  code: string;
  name: string;
  logo?: string;
  color: number | null;
  colorHex: string;
}

/**
 * A best-of's scoreline, **oriented to the fixture's own `teamA`/`teamB`**.
 *
 * Shared by both reads below, because it is the same five fields either way — but on `/schedule` it
 * comes from the `series` view and inherits its blind spot (two fixtures between one pair on one
 * conference day report the same merged row), while on the result read it is counted from the games
 * attached to *that* fixture. Same shape, different confidence; only the result read gets a
 * double-header right.
 *
 * Deliberately neither of the two neighbours it resembles. `ScheduleResult` (`./schedule`) carries no
 * `games`, and `SeriesSnapshot` is the `series` view's own row, whose pair is sorted by code rather
 * than oriented to a fixture.
 */
export interface MatchOutcome {
  winsA: number;
  winsB: number;
  /** Games in the series, forfeited ones included. */
  games: number;
  /** The winning team's **code**, or null while the series is level — mid-series, or a genuine split. */
  winner: string | null;
  hasForfeit: boolean;
}

// ------------------------------------------------------- the cross-league feed

/**
 * One fixture on the public feed.
 *
 * `bestOf` and `scheduledAt` are **resolved** — the phase default is already applied — which makes
 * this the right shape to render and the wrong one to edit from. `MatchDetail` in `./schedule` is the
 * read for editing.
 *
 * `seasonDay` is here because the payload carries it, and it is a **join key, not a label**: never
 * render it. See `CLAUDE.md`. `matchDay` is the day within its own phase, which is what a bracket
 * round is called on screen.
 */
export interface FeedMatch {
  scheduleMatchId: number;
  conf: string;
  /** `tournaments.name`, so a mixed list can say which league a row belongs to. */
  league: string;
  /** The league's abbreviation, for where the full name won't fit. Null when none is set. */
  shortname: string | null;
  phaseId: number;
  phase: string;
  phaseKind: PhaseKind;
  seasonDay: number;
  /** Phase-relative, 1-based. */
  matchDay: number;
  kind: MatchKind;
  bestOf: number;
  /** ISO 8601, resolved. Null when nothing dates the fixture. */
  scheduledAt: string | null;
  streamUrl: string | null;
  status: MatchStatus;
  /** Null for a bye, and for a bracket slot nobody has reached yet. */
  teamA: FeedTeam | null;
  teamB: FeedTeam | null;
  /** Null until at least one game exists. */
  result: MatchOutcome | null;
}

/**
 * A page of the feed.
 *
 * `generatedAt` is kept rather than discarded: it is the clock every `status` above was computed
 * against, and it is the only thing that tells a cached copy from a fresh one.
 */
export interface FeedPage {
  generatedAt: string | null;
  matches: FeedMatch[];
}

/**
 * The window to ask for. Every field is optional and an absent one is **not sent**.
 *
 * That matters more than it usually would: upstream answers a `400` for a query parameter it does not
 * know, deliberately, so that a page shipping `?week=3` in the belief that it filters is told it does
 * not. Sending `to=` as an empty string would be one of those.
 *
 * Two behaviours to plan a window around:
 *
 *  - **An undated fixture is excluded as soon as `from` or `to` is set.** It cannot be shown to fall
 *    inside a window. With neither bound it is included, which is how a `pending` bracket slot is
 *    found at all — and undated fixtures sort *last* in both directions.
 *  - **`confs` empty means every *active* league**, which is what keeps last year's seasons off a
 *    ticker. Naming one overrides that, so an archived season can still be asked for.
 */
export interface FeedQuery {
  /** Inclusive lower bound on the resolved kickoff, ISO 8601. */
  from?: string | null;
  /** Inclusive upper bound. */
  to?: string | null;
  confs?: readonly string[];
  statuses?: readonly MatchStatus[];
  /** 1–200. Over 200 is a `400` upstream, not a clamp. Defaults to 50 there. */
  limit?: number;
  /** By resolved kickoff. `desc` is what a scores page wants. */
  order?: "asc" | "desc";
}

// -------------------------------------------------------- one best-of in full

/** How the games on a fixture were found. */
export type Linkage = "exact" | "inferred";

/** One champion banned in one game. */
export interface SeriesBan {
  championId: number;
  /** The champion's display name, or null when upstream couldn't resolve the id. */
  champion: string | null;
}

/**
 * One player's line in one game.
 *
 * `profileId` is the key that joins to `/stats/players/:conf` and `/stats/scout/:conf/:profileId`.
 * `null` when the puuid behind the line is not linked to a profile, which is the one case with no
 * key at all.
 *
 * `csPerMin`, `damageShare` and `killParticipation` are computed upstream. **`damageShare` divides
 * across that side, not the game.**
 */
export interface SeriesPlayer {
  role: Role | null;
  profileId: number | null;
  name: string | null;
  championId: number | null;
  /** Display name, for the fallback label when the champion lookup hasn't loaded. */
  champion: string | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  csPerMin: number;
  gold: number;
  damage: number;
  /** 0–1, of this **side's** damage. */
  damageShare: number;
  /** 0–1: kills plus assists over the side's kills. */
  killParticipation: number;
  visionScore: number;
  goldDiff8: number | null;
  goldDiff14: number | null;
  soloKills: number | null;
  multiKills: { double: number; triple: number; quadra: number; penta: number };
}

/** One side of one game: who they were, what they took, and the five lines. */
export interface SeriesSide {
  /** Team code. */
  team: string;
  win: boolean;
  /**
   * Which side of the map this was, when it is known.
   *
   * **`null` means the `blue`/`red` keys are a guess.** `teamperformance.blueside` is nullable on
   * older rows, and rather than drop a legacy game's whole box score upstream falls back to putting
   * the fixture's `teamA` in `blue`. Anything that styles or labels by side must check this first.
   */
  blueside: boolean | null;
  bans: SeriesBan[];
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  towers: number;
  dragons: number;
  barons: number;
  heralds: number;
  grubs: number;
  /** Ordered by lane. */
  players: SeriesPlayer[];
}

/**
 * One game of the best-of.
 *
 * **Every game is here, remakes and all.** Unlike records and scouting there is no duration floor on
 * this read: a match page states what happened.
 *
 * Three absences, each meaning something different:
 *
 *  - `matchId: null` with `forfeit: true` — a walkover. No Riot game exists, so no duration and no
 *    sides. `startTime` is null on purpose: `forfeits.created_at` is when it was *recorded*, and
 *    reporting that as a kickoff would both fabricate a time and wrongly renew the live window.
 *  - `blue` and `red` both null — a forfeit, a `result-only` game Riot never served, or one whose
 *    timeline aged out. The result still counts; only the box score is missing.
 *  - `duration: null` — no performance rows to measure it from.
 */
export interface SeriesGame {
  /** 1-based within the series. */
  game: number;
  matchId: string | null;
  forfeit: boolean;
  startTime: string | null;
  /** Seconds. */
  duration: number | null;
  /** Team code. */
  winner: string | null;
  blue: SeriesSide | null;
  red: SeriesSide | null;
}

/**
 * A whole best-of: the fixture, both teams, and a game-by-game box score.
 *
 * `teamA`/`teamB` are the **fixture's** sides and are the same rows `/teams/:conf` serves — rosters
 * and season record included — so a match page needs no second call. Either is null while a bracket
 * slot is TBD.
 */
export interface SeriesDetail {
  scheduleMatchId: number;
  conf: string;
  /** `tournaments.name`. */
  league: string;
  phase: { id: number; name: string; kind: PhaseKind; matchDay: number };
  /** A join key, not a label. Never render it — see `CLAUDE.md`. */
  seasonDay: number;
  kind: MatchKind;
  bestOf: number;
  scheduledAt: string | null;
  streamUrl: string | null;
  status: MatchStatus;
  /**
   * How `games` were matched to this fixture, and worth surfacing.
   *
   *  - `exact` — on `matchlist.schedule_match_id`. Also what an empty `games` reports, since nothing
   *    was inferred.
   *  - `inferred` — nothing was attached, so games were matched on the conference day and the team
   *    pair instead. **That is the `series` grouping key, so it can be wrong**: a double-header
   *    between one pair on one day shows the merged set on both fixtures. It exists because every
   *    season predating the phases model has a null `schedule_match_id` on every row, and without it
   *    those match pages are permanently empty. Render it with a caveat, or not at all.
   */
  linkage: Linkage;
  teamA: TeamRecord | null;
  teamB: TeamRecord | null;
  /**
   * Null until at least one game exists.
   *
   * **Counted from the games attached to this fixture, not read from the `series` view** — that is
   * the point of this endpoint. Expect it to disagree with `/schedule` and `/matches/:conf` on a
   * double-header, and trust this one.
   */
  result: MatchOutcome | null;
  games: SeriesGame[];
}

// ----------------------------------------------------------------- normalizing

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown, fallback = 0): number => Math.trunc(num(v as Numeric, fallback));
const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v as Numeric);
  return n === null ? null : Math.trunc(n);
};
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

const matchKind = (v: unknown): MatchKind => (v === "bye" ? "bye" : "match");
const phaseKind = (v: unknown): PhaseKind => (v === "bracket" ? "bracket" : "group");

/**
 * A status, or `pending` for one this client doesn't recognise.
 *
 * `pending` is the safe fallback because it is the status that shows least: an unknown value read as
 * `live` would put a fixture on the ticker with a pulsing dot, and read as `completed` would put it in
 * `/scores` claiming a result nobody reported.
 */
const matchStatus = (v: unknown): MatchStatus =>
  MATCH_STATUSES.includes(v as MatchStatus) ? (v as MatchStatus) : "pending";

function mapFeedTeam(raw: unknown): FeedTeam | null {
  if (raw == null) return null;
  const t = asRaw(raw);
  const code = str(t.code);
  if (code === "") return null;
  const color = intOrNull(t.color);
  return {
    code,
    name: str(t.name, code),
    logo: httpsUrl(t.logo as string),
    color,
    colorHex: hexFromInt(color),
  };
}

function mapOutcome(raw: unknown): MatchOutcome | null {
  if (raw == null) return null;
  const r = asRaw(raw);
  return {
    winsA: int(r.winsA),
    winsB: int(r.winsB),
    games: int(r.games),
    winner: strOrNull(r.winner),
    hasForfeit: r.hasForfeit === true,
  };
}

function mapFeedMatch(raw: unknown): FeedMatch {
  const m = asRaw(raw);
  return {
    scheduleMatchId: int(m.scheduleMatchId),
    conf: str(m.conf),
    league: str(m.league),
    shortname: strOrNull(m.shortname),
    phaseId: int(m.phaseId),
    phase: str(m.phase),
    phaseKind: phaseKind(m.phaseKind),
    seasonDay: int(m.seasonDay, 1),
    matchDay: Math.max(1, int(m.matchDay, 1)),
    kind: matchKind(m.kind),
    bestOf: Math.max(1, int(m.bestOf, 1)),
    scheduledAt: strOrNull(m.scheduledAt),
    streamUrl: strOrNull(m.streamUrl),
    status: matchStatus(m.status),
    teamA: mapFeedTeam(m.teamA),
    teamB: mapFeedTeam(m.teamB),
    result: mapOutcome(m.result),
  };
}

/**
 * One ban.
 *
 * The served `icon` is dropped. Every champion surface on this site resolves artwork through
 * `useChampions` (Community Dragon, cached for the session), and taking the icon from here on one
 * card and from the lookup everywhere else is how two of them come to disagree across a patch
 * boundary. `championId` is what `ChampionIcon` wants, and `champion` is its fallback label.
 */
function mapBan(raw: unknown): SeriesBan | null {
  const b = asRaw(raw);
  const championId = intOrNull(b.championId);
  if (championId === null) return null;
  return { championId, champion: strOrNull(b.champion) };
}

const MULTI_KEYS = ["double", "triple", "quadra", "penta"] as const;

function mapMultiKills(raw: unknown): SeriesPlayer["multiKills"] {
  const m = asRaw(raw);
  const out = {} as SeriesPlayer["multiKills"];
  for (const k of MULTI_KEYS) out[k] = int(m[k]);
  return out;
}

function mapPlayer(raw: unknown): SeriesPlayer {
  const p = asRaw(raw);
  return {
    role: normalizeRole(strOrNull(p.role)),
    profileId: intOrNull(p.profileId),
    name: strOrNull(p.name),
    championId: intOrNull(p.championId),
    champion: strOrNull(p.champion),
    kills: int(p.kills),
    deaths: int(p.deaths),
    assists: int(p.assists),
    cs: int(p.cs),
    csPerMin: num(p.csPerMin as Numeric),
    gold: int(p.gold),
    damage: int(p.damage),
    damageShare: num(p.damageShare as Numeric),
    killParticipation: num(p.killParticipation as Numeric),
    visionScore: int(p.visionScore),
    goldDiff8: intOrNull(p.goldDiff8),
    goldDiff14: intOrNull(p.goldDiff14),
    soloKills: intOrNull(p.soloKills),
    multiKills: mapMultiKills(p.multiKills),
  };
}

const OBJECTIVES = ["kills", "deaths", "assists", "gold", "towers", "dragons", "barons", "heralds", "grubs"] as const;

function mapSide(raw: unknown): SeriesSide | null {
  if (raw == null) return null;
  const s = asRaw(raw);
  const counts = {} as Record<(typeof OBJECTIVES)[number], number>;
  for (const k of OBJECTIVES) counts[k] = int(s[k]);

  return {
    team: str(s.team),
    win: s.win === true,
    // Three-valued on purpose: `null` means the side label is a guess, and coercing it to false
    // would silently promote that guess to a fact.
    blueside: typeof s.blueside === "boolean" ? s.blueside : null,
    bans: arr(s.bans).flatMap(b => {
      const ban = mapBan(b);
      return ban === null ? [] : [ban];
    }),
    ...counts,
    players: arr(s.players).map(mapPlayer),
  };
}

function mapGame(raw: unknown): SeriesGame {
  const g = asRaw(raw);
  return {
    game: int(g.game, 1),
    matchId: strOrNull(g.matchId),
    forfeit: g.forfeit === true,
    startTime: strOrNull(g.startTime),
    duration: intOrNull(g.duration),
    winner: strOrNull(g.winner),
    blue: mapSide(g.blue),
    red: mapSide(g.red),
  };
}

function mapDetail(raw: unknown): SeriesDetail | null {
  const body = asRaw(raw);
  const scheduleMatchId = intOrNull(body.scheduleMatchId);
  // No id means this is not the payload — an older API answering something else on the path, or the
  // `null` body `getOne` produces for a route that isn't deployed yet.
  if (scheduleMatchId === null) return null;

  const phase = asRaw(body.phase);

  return {
    scheduleMatchId,
    conf: str(body.conf),
    league: str(body.league),
    phase: {
      id: int(phase.id),
      name: str(phase.name),
      kind: phaseKind(phase.kind),
      matchDay: Math.max(1, int(phase.matchDay, 1)),
    },
    seasonDay: int(body.seasonDay, 1),
    kind: matchKind(body.kind),
    bestOf: Math.max(1, int(body.bestOf, 1)),
    scheduledAt: strOrNull(body.scheduledAt),
    streamUrl: strOrNull(body.streamUrl),
    status: matchStatus(body.status),
    // `exact` is the fallback because it is what an empty `games` reports: claiming `inferred` would
    // print a caveat about games that were never inferred.
    linkage: body.linkage === "inferred" ? "inferred" : "exact",
    teamA: body.teamA == null ? null : mapTeamRecord(asRaw(body.teamA)),
    teamB: body.teamB == null ? null : mapTeamRecord(asRaw(body.teamB)),
    result: mapOutcome(body.result),
    games: arr(body.games).map(mapGame),
  };
}

// ------------------------------------------------------------------- requests

/** The query string, with absent keys left out entirely rather than sent empty. */
function feedPath(q: FeedQuery): string {
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.confs && q.confs.length > 0) params.set("conf", q.confs.join(","));
  if (q.statuses && q.statuses.length > 0) params.set("status", q.statuses.join(","));
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  if (q.order !== undefined) params.set("order", q.order);

  const search = params.toString();
  return search === "" ? "/schedule" : `/schedule?${search}`;
}

/**
 * Every league's fixtures in one flat list, ordered by resolved kickoff.
 *
 * Absence degrades to an empty page rather than throwing, the same way the rest of the read layer
 * does — a route that isn't deployed yet leaves a ticker empty instead of breaking the page it sits
 * on. A `400` still throws: a window this client asked for wrongly is a bug to see, not to swallow.
 */
export async function scheduleFeed(q: FeedQuery = {}, opts?: RequestOpts): Promise<FeedPage> {
  const body = await getOne<unknown>(feedPath(q), opts);
  const page = asRaw(body);
  return {
    generatedAt: strOrNull(page.generatedAt),
    matches: arr(page.matches).map(mapFeedMatch),
  };
}

/**
 * One best-of in full, or `null` when there is no such fixture.
 *
 * `null` covers three upstream answers and they are one thing to a reader: no such fixture, a fixture
 * whose phase is gone, and a fixture in an unpublished phase this caller may not see. A `400` for an
 * id that is not a positive integer still throws — but callers should not reach it, since the route
 * param is theirs to check first.
 */
export function matchResult(id: number, opts?: RequestOpts): Promise<SeriesDetail | null> {
  return getOne<unknown>(`/tournaments/schedule/${id}/result`, opts).then(raw =>
    raw === null ? null : mapDetail(raw),
  );
}

export const feedApi = { scheduleFeed, matchResult };
