/**
 * Arranging a bracket phase into columns and rows.
 *
 * The server stores **no positions** — `phases_bracket` carried a `layout` jsonb for exactly one
 * release, it was always `{}`, and it is gone, because a stored coordinate is only what the client
 * last sent and goes stale the moment the graph is rewired. What it sends instead is enough: the
 * rounds say when each match is played, and every side of every match names the node whose winner or
 * loser lands there.
 *
 * The two axes come from those two facts, and they are answered separately:
 *
 *   - **A column is a match day.** `SeasonRound` is already the phase's own grouping, so column *is*
 *     the round's index. This used to be derived from graph depth instead, and the result was a
 *     bracket that argued with the schedule: a match played on day 4 whose feeders both happened to
 *     resolve early would be drawn a column left, sitting among the day-3 matches. Depth was right
 *     about the graph and wrong about the thing a reader is looking at.
 *   - **A row is the graph.** Where a card sits *within* its column comes from the wiring, so a match
 *     lands level with the midpoint of whatever feeds it.
 *
 * **Losers are wiring, not lines.** Rows are derived from winner edges alone, and only winner edges
 * are returned to be drawn. `UNIQUE(src_node_id, src_output)` means a node's winner lands in at most
 * one slot, so the winner-only graph is a **forest** — and a forest is what a bracket looks like.
 * Fold the drops back in and it is a DAG, where a lower-bracket match is pulled between an
 * upper-bracket feeder several columns back and its own previous round; every one of those edges is
 * long, diagonal, and crosses the ones beside it. Nothing is lost by leaving them out, because a slot
 * fed by a drop already reads "Loser of Semifinal 1" — see `sideProvenance`, which is why that
 * fallback carries its weight twice.
 *
 * One consequence of columns being days: upstream explicitly permits a feeder and its consumer on the
 * **same** match day. Such an edge fails the strictly-left guard used throughout below, so it is not
 * drawn and does not pull its consumer's row. The slot's own "Winner of Match 7" is what carries it.
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
  /** 0-based, left to right. The index of this match's day among the phase's rounds. */
  column: number;
  /** 0-based index within the column, top to bottom. Identity, not position — see `y`. */
  row: number;
  /**
   * Vertical position, in row units, where 1 unit is one card plus its gap.
   *
   * Fractional on purpose: a match centerd between two feeders three rows apart sits at 1.5, which is
   * the whole point. Multiply by a pitch to get pixels. Never overlaps a sibling in the same column —
   * the sweep at the end of `bracketLayout` guarantees a full unit between them.
   */
  y: number;
  /** The day within the phase, as the phase numbers them. 1-based, and what a column header shows. */
  matchDay: number;
  /** In the phase's `terminalNodes` — nothing consumes this result. Emphasis only, never placement. */
  terminal: boolean;
}

/**
 * A drawable connector: one match's **winner** travelling into a slot of the next.
 *
 * Loser edges are deliberately absent — see the note in the module header. There is no `output`
 * field because there is nothing left for it to distinguish.
 */
export interface BracketEdge {
  /** Source node — the match whose result travels. */
  from: number;
  /** Consuming node. */
  to: number;
  /** Which slot of `to` this fills. The line lands on that row of the card, not the card's middle. */
  side: SlotSide;
  /**
   * The color of the team that actually traveled this edge, or null while it is hypothetical.
   *
   * Lighting the realized path in the team's own color is the one cue that lets a reader trace a
   * run through the bracket at a glance.
   */
  live: string | null;
}

export interface BracketLayout {
  /** Indexed by column, each already in row order. One entry per round, so a column can be empty. */
  columns: BracketNodeLayout[][];
  byNode: Map<number, BracketNodeLayout>;
  /** How tall the whole thing is, in the same row units as `y`. Canvas height is this times a pitch. */
  rows: number;
  /** Winner edges only, and only ones safe to draw — see the guard in `bracketLayout`. */
  edges: BracketEdge[];
  /** Sources named by a slot but absent from the phase. `ON DELETE SET NULL` makes these real. */
  dangling: number[];
}

/**
 * A human name for the match a slot draws from, for "Winner of …".
 *
 * The admin's own `label` when there is one. Otherwise a *position* — `Match 2·1`, meaning the second
 * match day, first card — rather than the node id, which is a database serial that means nothing to a
 * reader and cannot be found anywhere on the page. Null feeder is the dangling case, and gets
 * phrasing that promises nothing.
 */
export function feederName(layout: BracketLayout, node: number): string | null {
  const feeder = layout.byNode.get(node);
  if (!feeder) return null;
  const label = feeder.match.label?.trim();
  return label ? label : `Match ${feeder.matchDay}·${feeder.row + 1}`;
}

/** "Winner of Semifinal 1", or "Winner of an earlier match" when the source is gone. */
export function sideProvenance(layout: BracketLayout, from: { node: number; output: SlotOutput }): string {
  const verb = from.output === "winner" ? "Winner of" : "Loser of";
  const who = feederName(layout, from.node);
  return who ? `${verb} ${who}` : `${verb} an earlier match`;
}

export function bracketLayout(phase: SeasonBracketPhase): BracketLayout {
  // Sorted rather than taken as served: serve order is right today, but this is the axis the whole
  // layout hangs off, and a column strip that reads 1, 3, 2 is not a thing to discover at render time.
  const rounds = [...phase.rounds].sort((a, b) => a.matchDay - b.matchDay);

  // The `seq` an entry gets here — day, then the ordinal the admin set within that day — is the
  // tie-break for everything below, and it is the only ordering a human actually chose.
  const flat = rounds.flatMap((round, column) =>
    round.matches.map(match => ({ match, matchDay: round.matchDay, column })),
  );
  const byId = new Map(flat.map((entry, seq) => [entry.match.node, { ...entry, seq }]));
  const terminals = new Set(phase.terminalNodes);

  const buckets: number[][] = rounds.map(() => []);
  for (const entry of flat) buckets[entry.column].push(entry.match.node);

  // Upstream nulls `src_node_id` when a source is deleted, so a slot naming a node that is not in
  // this phase really occurs. Collected for the dev warning; every walk below simply skips it.
  const dangling = new Set<number>();
  for (const { match } of flat) {
    for (const side of SIDES) {
      const from = match[side].from;
      if (from && !byId.has(from.node)) dangling.add(from.node);
    }
  }

  /**
   * The winner feeders of a node, in slot order, filtered to the ones that are real.
   *
   * Strictly-left is the same guard the edge list uses below, and it is doing the same job: it drops
   * a dangling source, a same-day feeder, and any back edge a malformed graph left behind — which is
   * what makes the walk that uses this terminate without a visited set of its own.
   */
  const winnerFeeders = (node: number): number[] => {
    const entry = byId.get(node);
    if (!entry) return [];
    const out: number[] = [];
    for (const side of SIDES) {
      const from = entry.match[side].from;
      if (!from || from.output !== "winner") continue;
      const source = byId.get(from.node);
      if (!source || source.column >= entry.column) continue;
      out.push(from.node);
    }
    return out;
  };

  /*
   * Vertical placement: a post-order walk of the winner forest.
   *
   * A node with no winner feeder takes the next free row; every other node centers on the mean of
   * its feeders. That is the entire rule, and on a single-elimination bracket it reproduces the shape
   * exactly — entry matches on 0, 1, 2, 3, their consumers on 0.5 and 2.5, the final on 1.5.
   *
   * Roots are the nodes whose winner nobody claims, latest column first. A superset of
   * `terminalNodes` — a match whose winner ends the bracket but whose loser drops again is still the
   * top of its own tree — and the column ordering is what makes the grand final lay out its whole
   * tree before a third-place match slots in underneath.
   *
   * In double elimination this separates the brackets with nothing labeled. The upper bracket hangs
   * off the last root and is walked first, so it takes rows 0..n. The lower bracket's opening round
   * is fed only by drops, so it has no winner feeder at all, falls through to the leaf branch, and
   * lands on fresh rows below everything the upper bracket claimed. Its later rounds then chain off
   * it and stay down there.
   */
  const y = new Map<number, number>();
  const seen = new Set<number>();
  let cursor = 0;

  const place = (node: number): void => {
    if (seen.has(node)) return;
    seen.add(node);

    const feeders = winnerFeeders(node);
    if (feeders.length === 0) {
      y.set(node, cursor);
      cursor += 1;
      return;
    }
    for (const feeder of feeders) place(feeder);
    // Every feeder is placed by the line above, so the mean is always total.
    y.set(node, feeders.reduce((sum, f) => sum + (y.get(f) ?? 0), 0) / feeders.length);
  };

  const claimed = new Set<number>();
  for (const { match } of flat) for (const feeder of winnerFeeders(match.node)) claimed.add(feeder);

  const roots = flat
    .map(entry => entry.match.node)
    .filter(node => !claimed.has(node))
    .sort(
      (a, b) =>
        (byId.get(b)?.column ?? 0) - (byId.get(a)?.column ?? 0) ||
        (byId.get(a)?.seq ?? 0) - (byId.get(b)?.seq ?? 0),
    );

  for (const node of roots) place(node);
  // Rootless only if every node in some group claims another, which takes a malformed graph.
  for (const { match } of flat) place(match.node);

  /*
   * Non-overlap, per column.
   *
   * Two nodes in one column can want the same row: a match centerd on feeders 0 and 2 sits at 1, and
   * so can a leaf that took row 1 on its own. Sort by the row each wants and push every one down to
   * at least a full unit below the last.
   *
   * Centring without this degenerates into cards drawn on top of each other exactly where a bracket
   * is busiest. With it, the degenerate case costs a crossing rather than a collision — and in a
   * well-formed bracket the means are already a unit apart, so it fires on nothing at all.
   */
  for (const bucket of buckets) {
    bucket.sort(
      (a, b) => (y.get(a) ?? 0) - (y.get(b) ?? 0) || (byId.get(a)?.seq ?? 0) - (byId.get(b)?.seq ?? 0),
    );
    let floor = -Infinity;
    for (const node of bucket) {
      const at = Math.max(y.get(node) ?? 0, floor);
      y.set(node, at);
      floor = at + 1;
    }
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
        y: y.get(node) ?? 0,
        matchDay: entry.matchDay,
        terminal: terminals.has(node),
      };
      byNode.set(node, placed);
      return placed;
    }),
  );

  // The lowest card still needs its own height below its top edge, hence the +1 rather than the max.
  const rows = flat.length === 0 ? 0 : Math.max(...[...y.values()]) + 1;

  /*
   * Edges, with two guards doing all the work.
   *
   * `output === "winner"` is the readability decision argued in the module header. `column(from) <
   * column(to)` is the correctness one: it is true of every honest edge and false of every edge that
   * cannot be drawn as a left-to-right line — a same-day feeder, a self-edge, a back edge. So the
   * render needs no per-case branching, and a malformed bracket loses a line rather than throwing. A
   * dangling source fails the same test by not being in `byNode` at all.
   */
  const edges: BracketEdge[] = [];
  for (const placed of byNode.values()) {
    for (const side of SIDES) {
      const from = placed.match[side].from;
      if (!from || from.output !== "winner") continue;
      const source = byNode.get(from.node);
      if (!source || source.column >= placed.column) continue;

      // Realized only when the feeder is actually decided *and* a team has landed in this slot.
      // A propagated team with no decision behind it would be a slot filled by hand, which is not
      // this edge's doing.
      const decided = source.match.result?.winner != null;
      const arrived = placed.match[side].team;
      edges.push({
        from: from.node,
        to: placed.node,
        side,
        live: decided && arrived ? arrived.colorHex : null,
      });
    }
  }

  return { columns, byNode, rows, edges, dangling: [...dangling] };
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
