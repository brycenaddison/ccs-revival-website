/**
 * Arranging a bracket phase into columns and rows, from the wiring alone.
 *
 * The server stores **no positions** — `phases_bracket` carried a `layout` jsonb for exactly one
 * release, it was always `{}`, and it is gone, because a stored coordinate is only what the client
 * last sent and goes stale the moment the graph is rewired. What it sends instead is enough: every
 * side of every match names the node whose winner or loser lands there, so a bracket is *walked*
 * rather than read.
 *
 * Two axes, and they are not the same axis:
 *
 *   - **`SeasonRound`** (`matchDay`) is chronology — *when* a match is played. Two rounds can share a
 *     Saturday and one round can straddle two days, and upstream explicitly permits a feeder and its
 *     consumer on the same match day.
 *   - **A column here** is the graph — *what feeds what*. That is what a bracket draws.
 *
 * So this ignores `rounds` for placement and uses it only to carry each match's day through for the
 * column headers. The mobile view goes the other way and lays out by round, which is right: when you
 * cannot see the graph, chronology is the useful axis.
 *
 * The depth rule is the same one `api/season.ts#bracketRounds` applies for the admin editor, and the
 * duplication is deliberate rather than a missed abstraction. That function takes the *save* shape
 * (`node.id`, `node.top.src`) and lives in a module whose header declares it site-admin structure;
 * this takes the *read* shape (`match.node`, `match.top.from`) and answers a bigger question — rows
 * and edges as well as columns. Generalising would mean a type parameter plus two accessor callbacks
 * wrapped around forty lines whose entire value is that they read plainly. If the depth rule ever
 * changes, it has to change in both places.
 */

import type {
  SeasonBracketMatch,
  SeasonBracketPhase,
  SlotOutput,
  SlotSide,
} from "./api";

const SIDES: readonly SlotSide[] = ["top", "bottom"];

export interface BracketNodeLayout {
  match: SeasonBracketMatch;
  node: number;
  /** 0-based, left to right. Entry matches are 0. */
  column: number;
  /** 0-based within the column, top to bottom. */
  row: number;
  matchDay: number;
  seasonDay: number;
  /** In the phase's `terminalNodes` — nothing consumes this result. Emphasis only, never placement. */
  terminal: boolean;
}

export interface BracketEdge {
  /** Source node — the match whose result travels. */
  from: number;
  /** Consuming node. */
  to: number;
  /** Which slot of `to` this fills. */
  side: SlotSide;
  output: SlotOutput;
  /**
   * The colour of the team that actually travelled this edge, or null while it is hypothetical.
   *
   * Lighting the realised path in the team's own colour is the one cue that lets a reader trace a
   * run through the bracket at a glance.
   */
  live: string | null;
}

export interface BracketLayout {
  /** Indexed by column, each already in row order. */
  columns: BracketNodeLayout[][];
  byNode: Map<number, BracketNodeLayout>;
  /** Only edges safe to draw — see the guard in `bracketLayout`. */
  edges: BracketEdge[];
  /** Nodes caught in a cycle. Upstream refuses to save one, so this should always be empty. */
  cyclic: number[];
  /** Sources named by a slot but absent from the phase. `ON DELETE SET NULL` makes these real. */
  dangling: number[];
}

/**
 * A human name for the match a slot draws from, for "Winner of …".
 *
 * The admin's own `label` when there is one. Otherwise a *position* — `Match 2·1`, meaning column 2,
 * row 1 — rather than the node id, which is a database serial that means nothing to a reader and
 * cannot be found anywhere on the page. Null feeder is the dangling case, and gets phrasing that
 * promises nothing.
 */
export function feederName(layout: BracketLayout, node: number): string | null {
  const feeder = layout.byNode.get(node);
  if (!feeder) return null;
  const label = feeder.match.label?.trim();
  return label ? label : `Match ${feeder.column + 1}·${feeder.row + 1}`;
}

/** "Winner of Semifinal 1", or "Winner of an earlier match" when the source is gone. */
export function sideProvenance(layout: BracketLayout, from: { node: number; output: SlotOutput }): string {
  const verb = from.output === "winner" ? "Winner of" : "Loser of";
  const who = feederName(layout, from.node);
  return who ? `${verb} ${who}` : `${verb} an earlier match`;
}

export function bracketLayout(phase: SeasonBracketPhase): BracketLayout {
  // Flattened in serve order — match day, then the ordinal the admin set within that day. The index
  // here is the tie-break for everything below, and it is the only ordering a human actually chose.
  const flat = phase.rounds.flatMap(round =>
    round.matches.map(match => ({ match, matchDay: round.matchDay, seasonDay: round.seasonDay })),
  );
  const byId = new Map(flat.map((entry, seq) => [entry.match.node, { ...entry, seq }]));
  const terminals = new Set(phase.terminalNodes);

  const column = new Map<number, number>();
  const cyclic = new Set<number>();
  const dangling = new Set<number>();

  // A stack rather than a set: meeting a node still on the path *is* the back edge, and the slice
  // from it upward is the cycle itself — which is what needs naming, not just the node the walk
  // happened to re-enter. Without it, `A → B → A` never bottoms out.
  const path: number[] = [];
  const onPath = new Set<number>();

  const depthOf = (node: number): number => {
    const known = column.get(node);
    if (known !== undefined) return known;

    if (onPath.has(node)) {
      for (const id of path.slice(path.indexOf(node))) cyclic.add(id);
      return 0;
    }

    const entry = byId.get(node);
    if (!entry) return 0;

    path.push(node);
    onPath.add(node);
    let depth = 0;
    for (const side of SIDES) {
      const from = entry.match[side].from;
      if (!from) continue;
      if (!byId.has(from.node)) {
        // A source that isn't in this phase is ignored rather than counted as depth 0: upstream
        // nulls `src_node_id` when a source is deleted, so a dangling edge really occurs, and
        // treating it as an entry would pull the node a column left of where its real feeders put it.
        dangling.add(from.node);
        continue;
      }
      depth = Math.max(depth, depthOf(from.node) + 1);
    }
    path.pop();
    onPath.delete(node);

    // A node in a cycle has no honest depth, and the one computed above counted a partial walk.
    // Memoising after the marking means a node can never be cached at a depth and found cyclic
    // later: a cycle through it would have been seen while it was still on the path.
    const answer = cyclic.has(node) ? 0 : depth;
    column.set(node, answer);
    return answer;
  };

  for (const { match } of flat) depthOf(match.node);

  const width = flat.length === 0 ? 0 : Math.max(...flat.map(e => column.get(e.match.node) ?? 0)) + 1;
  const buckets: number[][] = Array.from({ length: width }, () => []);
  for (const { match } of flat) buckets[column.get(match.node) ?? 0].push(match.node);

  /*
   * Row order: one left-to-right barycentre pass.
   *
   * Column 0 keeps the served order — the admin's own arrangement of the opening day, and the only
   * ordering here that a person chose. Every later column sorts by the mean row of the nodes feeding
   * it, so a match sits level with its inputs and the lines between columns stop crossing.
   *
   * One forward pass, then stop. Sugiyama layering alternates forward and backward sweeps, but a
   * backward sweep would reorder column 0 — throwing away that deliberate ordering — and make the
   * result depend on how many passes were run. Determinism beats a marginally tidier middle.
   *
   * The rows are then renumbered to integers rather than kept as the fractional barycentre, so each
   * column renders as an evenly-stacked flex list. CCS runs double-elimination plus a gauntlet, so
   * cross-column feeders — a lower-bracket match fed from column 1 and column 3 — are normal, and
   * positioning cards at a fractional centre degenerates into overlap exactly there. Ordering by the
   * barycentre keeps the readable part of that idea; positioning by it does not survive the format.
   */
  const row = new Map<number, number>();
  buckets[0]?.sort((a, b) => (byId.get(a)?.seq ?? 0) - (byId.get(b)?.seq ?? 0));
  buckets[0]?.forEach((node, i) => row.set(node, i));

  for (let c = 1; c < width; c += 1) {
    const key = new Map<number, number>();

    for (const node of buckets[c]) {
      const entry = byId.get(node);
      const feeders = SIDES.map(side => entry?.match[side].from)
        .filter((from): from is { node: number; output: SlotOutput } => !!from)
        // Only feeders strictly to the left have a row yet. That drops dangling sources and any back
        // edge left by a cycle, which is what keeps this pass total.
        .map(from => ({ from, col: column.get(from.node) }))
        .filter(f => f.col !== undefined && f.col < c)
        .map(f => row.get(f.from.node))
        .filter((r): r is number => r !== undefined);

      // Unreachable in a well-formed graph: depth is 1 + max(feeder depth), so anything in column
      // >= 1 has at least one resolvable feeder. Kept as the defence for a graph that isn't.
      key.set(node, feeders.length ? feeders.reduce((a, b) => a + b, 0) / feeders.length : Infinity);
    }

    buckets[c].sort(
      (a, b) => (key.get(a) ?? 0) - (key.get(b) ?? 0) || (byId.get(a)?.seq ?? 0) - (byId.get(b)?.seq ?? 0),
    );
    buckets[c].forEach((node, i) => row.set(node, i));
  }

  const byNode = new Map<number, BracketNodeLayout>();
  const columns: BracketNodeLayout[][] = buckets.map((bucket, c) =>
    bucket.map((node, i) => {
      const entry = byId.get(node)!;
      const placed: BracketNodeLayout = {
        match: entry.match,
        node,
        column: c,
        row: i,
        matchDay: entry.matchDay,
        seasonDay: entry.seasonDay,
        terminal: terminals.has(node),
      };
      byNode.set(node, placed);
      return placed;
    }),
  );

  /*
   * Edges, with one guard doing all the work.
   *
   * `column(from) < column(to)` is true of every honest edge and false of every pathological one —
   * a self-edge, a back edge inside a cycle, an edge into a node the cycle collapsed to column 0. So
   * the render needs no per-case branching, and a malformed bracket loses a line rather than
   * throwing. A dangling source fails the same test by not being in `column` at all.
   */
  const edges: BracketEdge[] = [];
  for (const placed of byNode.values()) {
    for (const side of SIDES) {
      const from = placed.match[side].from;
      if (!from) continue;
      const source = byNode.get(from.node);
      if (!source || source.column >= placed.column) continue;

      // Realised only when the feeder is actually decided *and* a team has landed in this slot.
      // A propagated team with no decision behind it would be a slot filled by hand, which is not
      // this edge's doing.
      const decided = source.match.result?.winner != null;
      const arrived = placed.match[side].team;
      edges.push({
        from: from.node,
        to: placed.node,
        side,
        output: from.output,
        live: decided && arrived ? arrived.colorHex : null,
      });
    }
  }

  return { columns, byNode, edges, cyclic: [...cyclic], dangling: [...dangling] };
}

/**
 * Whether a series is over, for telling "in progress" apart from a genuine split.
 *
 * `result.winner` is null in both cases — a best-of-2 can end level, and an unfinished series is
 * level until someone clinches — so the count against `bestOf` is the only thing that separates them.
 */
export function seriesComplete(match: SeasonBracketMatch): boolean {
  const r = match.result;
  if (!r) return false;
  if (r.winner !== null) return true;
  return (
    Math.max(r.winsTop, r.winsBottom) >= Math.ceil(match.bestOf / 2) ||
    r.winsTop + r.winsBottom >= match.bestOf
  );
}
