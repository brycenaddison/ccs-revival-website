/**
 * A bracket phase's contents — `PUT /tournaments/:conf/phases/:id`.
 *
 * The graph, precisely: a **node** is one match, and it always has one — creating a node creates its
 * match. A node has exactly **two slots**, `top` and `bottom`, which are the match's `teamAId` and
 * `teamBId`. A slot is one of two things and the difference is the whole editor:
 *
 *  - **entry** — `src: null`. A human places the team, and it lives on the match. `seed` may carry a
 *    display label.
 *  - **derived** — `src: { node, output }`. Propagation owns the team, so the picker is disabled;
 *    anything sent there is overwritten by the next result anyway.
 *
 * **A column is a match day, and the round each card belongs to is derived from the wiring.** Those are
 * two different things and the editor needs both: the day is what a match is *scheduled* on and what the
 * kickoff tiers hang off, while the round is what feeds what. One round can straddle two days and one day
 * can hold two rounds, so neither substitutes for the other.
 *
 * Nothing stores the round. `phases_bracket` carried a `layout` jsonb for exactly one release; it was
 * always `{}` and it is gone, because a stored position is only what the client last sent and goes stale
 * the moment the graph is rewired. So the round is walked instead — an unwired node is an entry at round
 * 0, every other node sits one past the furthest node feeding it — by `bracketRounds` in
 * `lib/api/season`. It **labels** each card with the round it belongs to, which is the part a column of
 * days cannot show by itself.
 *
 * **It does not order them. `ordinal` does, and a human sets it.** Ordering by the derived round was the
 * obvious idea and it made the editor unusable: wiring a slot changes that node's round, so the card
 * jumped to a different position in its column the instant the source dropdown was used — the control
 * moved out from under the cursor as a direct result of using it. A position that reshuffles itself is
 * also just wrong for a bracket, where two matches in the same round have a real running order that
 * nothing in the graph knows. So the arrows below move a card within its day and renumber `ordinal`, and
 * the round is a label that changes while the card stays put.
 *
 * Edges are a dropdown per slot, which is why this needs no graph library — and a dropdown can *disable*
 * the invalid choices, which beats letting someone draw a cycle and reading about it in a 422. The three
 * one-step mistakes the server refuses are excluded up front: a slot drawing from its own node, both of a
 * node's slots drawing from the same source, and a second slot consuming an output already taken. `A → B →
 * A` takes two individually-legal edits, so it is caught by the walk instead and warned about here.
 * Reachability is still the server's call.
 *
 * **`seed` is a free-form label and nothing resolves it.** A string now, not a number: `"1"`, or `"1A"`
 * for the first seed out of group A. A slot with seed `4` and no team renders `(4) TBD`, and no code path
 * looks a team up by it. It is offered on **entry slots only** — a derived slot holds whoever won the
 * match feeding it, so there is nobody to label — and switching a slot to derived clears it rather than
 * hiding a value the save would still write. Byes fall out for free: a seven-team bracket needs no bye
 * node, because the team with the bye is placed directly into its second-round slot as an entry.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Flag, Plus, Trash2 } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ACTION, ACTION_PRIMARY, ACTION_SM, ACTION_SM_DANGER, ErrorLine, Pill } from "../adminUi";
import { IssueList, fieldError } from "./issues";
import { DayKickoffField, StrandedDaysNotice, withDayDefault } from "./DayKickoff";
import { queries, queryRoots } from "../../../lib/queries";
import { fromLocalInput, toLocalInput } from "../../../lib/utils";
import {
  BEST_OF_VALUES,
  NODE_LABEL_MAX,
  SLOT_SEED_MAX,
  STREAM_URL_MAX,
  SaveRejected,
  bracketRounds,
  clearDayDefaultsAfter,
  dayKickoffs,
  errorMessage,
  isBestOf,
  isSlotSeed,
  pinnedDaysAfter,
  savePhaseContents,
  seasonDayOf,
  shiftDayDefaults,
  strandedDayDefaults,
  type BestOf,
  type BracketPhaseContents,
  type CandidatePhase,
  type NodeSave,
  type PhaseSummary,
  type SlotOutput,
  type SlotSave,
  type SlotSide,
  type TeamRecord,
  type ValidationIssue,
} from "../../../lib/api";

interface Props {
  conf: string;
  phase: PhaseSummary;
  contents: BracketPhaseContents;
  /** Nodes nothing consumes, as the server derived them. Recomputed locally while editing. */
  terminalNodes: readonly number[];
  teams: readonly TeamRecord[];
  onSaved: (message: string) => void;
}

const nextId = (ids: readonly number[]): number => Math.min(0, ...ids) - 1;

/** What a node is called in a dropdown. `label` is free text and may be null. */
function nameOf(node: NodeSave, fallbackIndex: number): string {
  return node.label?.trim() || `Match ${fallbackIndex + 1} (day ${node.match.matchDay})`;
}

/** A label that is a plain match number and nothing else — `"Match 7"`. */
const NUMBERED_MATCH = /^match\s+(\d+)$/i;

/**
 * What a new card is called before anybody renames it: `"Match 1"`, then one past the highest so far.
 *
 * Off the **greatest number already in use**, not the card count. Numbers are what the slot dropdowns
 * and the round pills read, so a number that comes back after its card is gone would point two edits at
 * the same name; counting cards does exactly that the moment one is removed. Running past the count
 * instead means a bracket may skip a number, which is the harmless half of the trade.
 *
 * Only labels of exactly that shape count. A card renamed `"Quarterfinal 1"` is out of the numbering
 * altogether — it has been given a real name, and the next add should not answer to it.
 *
 * Per phase, which is this whole document: the numbering is a way to tell one card from another while
 * wiring, and cards from another phase are never in the same dropdown.
 */
function nextMatchLabel(nodes: readonly NodeSave[]): string {
  const highest = nodes.reduce((max, node) => {
    const match = NUMBERED_MATCH.exec(node.label?.trim() ?? "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `Match ${highest + 1}`;
}

/** `"12:winner"` — the key `UNIQUE (src_node_id, src_output)` is on. */
const outputKey = (node: number, output: SlotOutput): string => `${node}:${output}`;

/** Round 0 is the nodes nothing feeds; after that it is just the number. */
const roundName = (depth: number): string => (depth === 0 ? "Entry round" : `Round ${depth + 1}`);

export function BracketPhaseEditor({
  conf,
  phase,
  contents,
  terminalNodes,
  teams,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<BracketPhaseContents>(contents);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const candidates = useQuery(queries.phaseCandidates(conf, phase.id));

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(contents), [draft, contents]);

  /**
   * Every `(node, output)` a slot already draws from, and which slot took it.
   *
   * `UNIQUE (src_node_id, src_output)` upstream means a node's winner can feed at most one slot, and so
   * can its loser. Knowing who holds each one is what lets the dropdowns disable it rather than offer a
   * choice that fails.
   */
  const consumed = useMemo(() => {
    const map = new Map<string, string>();
    draft.nodes.forEach((node, index) => {
      for (const side of ["top", "bottom"] as const) {
        const src = node[side].src;
        if (src) map.set(outputKey(src.node, src.output), `${nameOf(node, index)} · ${side}`);
      }
    });
    return map;
  }, [draft.nodes]);

  /** Terminal while editing: nothing in the current draft consumes either output. */
  const terminalNow = useMemo(
    () =>
      new Set(
        draft.nodes
          .filter(
            n =>
              !consumed.has(outputKey(n.id, "winner")) && !consumed.has(outputKey(n.id, "loser")),
          )
          .map(n => n.id),
      ),
    [draft.nodes, consumed],
  );

  /** Rounds, off the draft — rewiring a slot relabels and reorders its card as the edge is drawn. */
  const { depths, cyclic } = useMemo(() => bracketRounds(draft.nodes), [draft.nodes]);

  const save = useMutation({
    mutationFn: () => savePhaseContents(conf, phase.id, draft),
    onSuccess: async result => {
      setIssues([]);
      setDraft(applyIdMap(draft, result.idMap));
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.season }),
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      ]);
      onSaved(`Saved ${phase.name}.`);
    },
    onError: (e: unknown) => setIssues(e instanceof SaveRejected ? e.issues : []),
  });

  const setNodes = (nodes: NodeSave[]): void => setDraft(d => ({ ...d, nodes }));

  const update = (id: number, changes: Partial<NodeSave>): void =>
    setNodes(draft.nodes.map(n => (n.id === id ? { ...n, ...changes } : n)));

  /**
   * A new node on a given day, unwired.
   *
   * It arrives at round 0 whatever day it is added to, because nothing feeds it yet — that is what an
   * entry is. Wiring a slot moves it to its real round, which reorders the card within its column and
   * relabels it; the day it was added to does not change.
   *
   * The label starts numbered rather than empty. An unnamed card is only ever `"Match 3 (day 1)"` in a
   * dropdown anyway — a name the document does not hold and a save cannot round-trip, because it counts
   * position in the array — so a bracket wired before anybody names anything was wired against labels
   * that move. Writing the number down at the point of adding makes it the card's own, and clearing the
   * field still puts the card back to unnamed.
   */
  const addNode = (matchDay: number): void => {
    const id = nextId(draft.nodes.map(n => n.id));
    // The match gets its own client id, distinct from the node's — they are two rows and the server
    // maps them separately.
    const matchId = nextId([...draft.nodes.map(n => n.match.id), id]);
    const onDay = draft.nodes.filter(n => n.match.matchDay === matchDay);

    setNodes([
      ...draft.nodes,
      {
        id,
        label: nextMatchLabel(draft.nodes),
        match: {
          id: matchId,
          matchDay,
          ordinal: onDay.length + 1,
          kind: "match",
          teamAId: null,
          teamBId: null,
          scheduledAt: null,
          bestOf: null,
          streamUrl: null,
        },
        top: { seed: null, src: null },
        bottom: { seed: null, src: null },
      },
    ]);
  };

  /** The nodes on one day in the order they are drawn: `ordinal`, and nothing derived. */
  const nodesOnDay = (nodes: readonly NodeSave[], matchDay: number): NodeSave[] =>
    // `filter` keeps document order and `sort` is stable, so nodes sharing an ordinal — two new cards, or
    // whatever the server happened to store — keep a fixed relative position rather than swapping about.
    nodes.filter(n => n.match.matchDay === matchDay).sort((a, b) => a.match.ordinal - b.match.ordinal);

  /**
   * Moves a card one place within its own day.
   *
   * Ordinals are **renumbered densely** across the day afterwards rather than the two values being
   * swapped. Whatever arrives from the server can be sparse or duplicated, and swapping sparse values
   * leaves the next move unpredictable — one press appearing to do nothing is exactly the complaint this
   * is fixing.
   */
  const moveNode = (id: number, by: -1 | 1): void => {
    const node = draft.nodes.find(n => n.id === id);
    if (!node) return;

    const onDay = nodesOnDay(draft.nodes, node.match.matchDay);
    const from = onDay.findIndex(n => n.id === id);
    const to = from + by;
    if (to < 0 || to >= onDay.length) return;

    const reordered = [...onDay];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    const ordinals = new Map(reordered.map((n, i) => [n.id, i + 1]));

    setNodes(
      draft.nodes.map(n => {
        const ordinal = ordinals.get(n.id);
        return ordinal === undefined ? n : { ...n, match: { ...n.match, ordinal } };
      }),
    );
  };

  /**
   * Moves a card to another day, landing it at the bottom of that column.
   *
   * Keeping the old ordinal would drop it into the middle of the target day — or on top of a card already
   * holding that number — so where it appears would depend on what the other day happens to contain.
   * Appending is the one answer that is the same every time.
   */
  const setNodeDay = (id: number, matchDay: number): void => {
    const node = draft.nodes.find(n => n.id === id);
    if (!node || node.match.matchDay === matchDay) return;

    const ordinal = draft.nodes.filter(n => n.id !== id && n.match.matchDay === matchDay).length + 1;
    setNodes(
      draft.nodes.map(n => (n.id === id ? { ...n, match: { ...n.match, matchDay, ordinal } } : n)),
    );
  };

  /**
   * Removing a node also unbinds whatever it fed.
   *
   * The database does this by itself — `src_node_id` is `ON DELETE SET NULL` — but leaving the draft
   * pointing at a node that is gone would show an edge to nothing and send a source the validator
   * rejects. Doing it here keeps the local document a legal one at all times.
   */
  const removeNode = (id: number): void =>
    setNodes(
      draft.nodes
        .filter(n => n.id !== id)
        .map(n => ({
          ...n,
          top: n.top.src?.node === id ? { ...n.top, src: null } : n.top,
          bottom: n.bottom.src?.node === id ? { ...n.bottom, src: null } : n.bottom,
        })),
    );

  const setDayDefault = (matchDay: number, startAt: string | null): void =>
    setDraft(d => ({ ...d, dayDefaults: withDayDefault(d.dayDefaults, matchDay, startAt) }));

  const shiftLater = (matchDay: number, offsetMs: number): void =>
    setDraft(d => ({
      ...d,
      dayDefaults: shiftDayDefaults(phase, d.dayDefaults, matchDay + 1, offsetMs),
    }));

  /** The way back out of a shift, and what lets it be offered a second time. */
  const clearLater = (matchDay: number): void =>
    setDraft(d => ({ ...d, dayDefaults: clearDayDefaultsAfter(phase, d.dayDefaults, matchDay) }));

  const stranded = strandedDayDefaults(phase, draft.dayDefaults);
  const strandedNodes = draft.nodes.filter(n => n.match.matchDay > phase.matchDays);

  // Off the draft, so a time typed into day 3 shows on day 3 before any save.
  const kickoffs = dayKickoffs(phase, draft.dayDefaults);
  // The same phase with nothing pinned — what each day falls back to, and what a pin is measured against.
  const unpinned = dayKickoffs(phase, []);
  const pinnedFor = (matchDay: number): string | null =>
    draft.dayDefaults.find(d => d.matchDay === matchDay)?.startAt ?? null;

  const days = Array.from({ length: phase.matchDays }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-text-secondary text-sm max-w-2xl">
        Each card is one match. Wire a slot to the winner or loser of an earlier match, or leave it as an
        entry and place the team by hand — which is what a tie the standings will not break requires.
        Saving fills in every team the results already imply.
      </p>
      <p className="text-text-secondary text-sm max-w-2xl">
        A column is a match <em>day</em>, and the arrows on a card set its order within that day. The{" "}
        <span className="text-text">round</span> is read off the wiring instead of being stored, so it
        relabels itself as slots are wired — the card stays where you put it.
      </p>

      {/*
        One column per match day, in a strip that scrolls sideways.

        Not a wrapping grid. A bracket reads left to right — day 1 feeds day 2 — and wrapping day 3 onto
        a second row breaks the one spatial cue the layout has. Fixed-width columns that overflow keep
        that order at any number of days, and scrolling is the honest answer to a season longer than the
        screen.

        `-mx-5 px-5` cancels `SectionFrame`'s padding so the strip's scroll edge sits flush with the
        card rather than clipping a column mid-padding, and the first and last columns still align with
        everything above them.
      */}
      <div className="-mx-5 px-5 overflow-x-auto">
        <div className="flex gap-4 pb-2 w-max">
          {days.map(matchDay => {
            // By `ordinal` alone. Never by the derived round — see the note at the top of the file: that
            // moved a card the moment its own source dropdown was touched.
            const onDay = nodesOnDay(draft.nodes, matchDay);

            return (
              <div
                key={matchDay}
                // `shrink-0` is what makes the strip overflow rather than squeezing every column thinner
                // as days are added — which is the whole failure this replaced.
                className="w-[22rem] shrink-0 bg-bg3 border border-border rounded-md p-3.5"
              >
                <div className="mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base text-text-bright tracking-widest">
                      DAY {matchDay}
                    </span>
                    <Pill muted>Season day {seasonDayOf(phase, matchDay)}</Pill>
                    {/* Same reason as the group editor: a column of cards puts the button below the
                        fold, so adding several means scrolling back after each one. */}
                    <div className="ml-auto">
                      <button type="button" onClick={() => addNode(matchDay)} className={ACTION_SM}>
                        <Plus size={13} aria-hidden="true" />
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <DayKickoffField
                      matchDay={matchDay}
                      matchDays={phase.matchDays}
                      pinned={pinnedFor(matchDay)}
                      resolved={kickoffs[matchDay - 1] ?? null}
                      inherited={unpinned[matchDay - 1] ?? null}
                      onChange={startAt => setDayDefault(matchDay, startAt)}
                      onShiftLater={offsetMs => shiftLater(matchDay, offsetMs)}
                      laterPinned={pinnedDaysAfter(phase, draft.dayDefaults, matchDay)}
                      onClearLater={() => clearLater(matchDay)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  {onDay.map((node, position) => (
                    <NodeCard
                      key={node.id}
                      node={node}
                      index={draft.nodes.findIndex(n => n.id === node.id)}
                      nodes={draft.nodes}
                      phase={phase}
                      teams={teams}
                      issues={issues}
                      consumed={consumed}
                      round={depths.get(node.id) ?? 0}
                      isFirst={position === 0}
                      isLast={position === onDay.length - 1}
                      isTerminal={terminalNow.has(node.id)}
                      wasTerminal={terminalNodes.includes(node.id)}
                      isCyclic={cyclic.includes(node.id)}
                      onChange={changes => update(node.id, changes)}
                      onMove={by => moveNode(node.id, by)}
                      onSetDay={day => setNodeDay(node.id, day)}
                      onRemove={() => removeNode(node.id)}
                    />
                  ))}

                  {onDay.length === 0 && (
                    <p className="text-text-dim text-xs">No matches on this day.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <StrandedDaysNotice
        phase={phase}
        stranded={stranded}
        onClear={() =>
          setDraft(d => ({
            ...d,
            dayDefaults: d.dayDefaults.filter(x => x.matchDay <= phase.matchDays),
          }))
        }
      />

      {/* A cycle has no round — that is what a cycle means — so those cards sort as round 0 and are named
          here. The save refuses it, so this is a blocker rather than a warning. */}
      {cyclic.length > 0 && (
        <p className="text-ccs-red text-sm">
          {cyclic.length} {cyclic.length === 1 ? "match feeds" : "matches feed"} itself around a loop, so
          {cyclic.length === 1 ? " it has" : " they have"} no round. Follow the wiring back and break it —
          the save refuses a bracket that cannot be played in an order.
        </p>
      )}

      {strandedNodes.length > 0 && (
        <p className="text-ccs-red text-sm">
          {strandedNodes.length} match(es) sit past day {phase.matchDays} and are not shown. Lengthen the
          phase on the season page, or they can&apos;t be saved.
        </p>
      )}

      <CandidatesPanel
        loading={candidates.isPending}
        error={candidates.isError ? errorMessage(candidates.error) : null}
        phases={candidates.data ?? []}
      />

      <IssueList issues={issues} />

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || stranded.length > 0 || cyclic.length > 0 || save.isPending}
          className={ACTION_PRIMARY}
        >
          <Check size={15} aria-hidden="true" />
          {save.isPending ? "Saving…" : "Save bracket"}
        </button>
        {dirty ? (
          <button
            type="button"
            onClick={() => {
              setDraft(contents);
              setIssues([]);
            }}
            disabled={save.isPending}
            className={ACTION}
          >
            Discard changes
          </button>
        ) : (
          <span className="text-text-dim text-xs">No changes to save.</span>
        )}
      </div>

      <ErrorLine
        message={save.isError && !(save.error instanceof SaveRejected) ? errorMessage(save.error) : null}
      />
    </div>
  );
}

function applyIdMap(
  draft: BracketPhaseContents,
  idMap: { matches: Record<string, number>; nodes: Record<string, number> },
): BracketPhaseContents {
  const nodeId = (id: number): number => idMap.nodes[String(id)] ?? id;

  return {
    ...draft,
    nodes: draft.nodes.map(n => ({
      ...n,
      id: nodeId(n.id),
      match: { ...n.match, id: idMap.matches[String(n.match.id)] ?? n.match.id },
      // Edges have to be remapped too: a brand-new semifinal drawing from a brand-new quarterfinal
      // holds the quarterfinal's negative id until this runs.
      top: n.top.src ? { ...n.top, src: { ...n.top.src, node: nodeId(n.top.src.node) } } : n.top,
      bottom: n.bottom.src
        ? { ...n.bottom, src: { ...n.bottom.src, node: nodeId(n.bottom.src.node) } }
        : n.bottom,
    })),
  };
}

// -------------------------------------------------------------------- a node

function NodeCard({
  node,
  index,
  nodes,
  phase,
  teams,
  issues,
  consumed,
  round,
  isFirst,
  isLast,
  isTerminal,
  wasTerminal,
  isCyclic,
  onChange,
  onMove,
  onSetDay,
  onRemove,
}: {
  node: NodeSave;
  index: number;
  nodes: readonly NodeSave[];
  phase: PhaseSummary;
  teams: readonly TeamRecord[];
  issues: readonly ValidationIssue[];
  consumed: ReadonlyMap<string, string>;
  /**
   * 0-based depth from `bracketRounds`. Derived from the wiring: a label, not a position.
   *
   * It changes as slots are rewired and the card does **not** move when it does — that is the whole point
   * of ordering on `ordinal` instead.
   */
  round: number;
  /** First and last within this day, to cap the arrows. Position is `ordinal`, not the round. */
  isFirst: boolean;
  isLast: boolean;
  isTerminal: boolean;
  wasTerminal: boolean;
  isCyclic: boolean;
  onChange: (changes: Partial<NodeSave>) => void;
  onMove: (by: -1 | 1) => void;
  /** Day changes go through the parent: it renumbers the ordinal against the target day. */
  onSetDay: (matchDay: number) => void;
  onRemove: () => void;
}) {
  const path = `nodes.${index}`;
  const bad =
    isCyclic ||
    issues.some(i => i.path === path || i.path.startsWith(`${path}.`)) ||
    issues.some(i => i.subjects?.includes(node.id));

  return (
    <div className={`border rounded-md p-3 bg-bg2 ${bad ? "border-ccs-red/50" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <input
          value={node.label ?? ""}
          onChange={e => onChange({ label: e.target.value === "" ? null : e.target.value })}
          maxLength={NODE_LABEL_MAX}
          placeholder="Quarterfinal 1"
          aria-label="Match label"
          className={`${CONTROL_CLASS} ${fieldError(issues, `${path}.label`)}`}
        />
        <button type="button" onClick={onRemove} aria-label="Remove this match" className={ACTION_SM_DANGER}>
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </div>

      {/* The round, which the column cannot say because the column is a day. Read-only by construction:
          it is the wiring's answer, so the way to change it is to rewire a slot below. The arrows next to
          it move the card, which is a separate thing — position is `ordinal` and this is a label. */}
      <div className="flex items-center gap-2 mb-2.5">
        <Pill muted>{isCyclic ? "No round — looped" : roundName(round)}</Pill>
        <span className="text-text-dim text-xs">#{node.match.ordinal} on day {node.match.matchDay}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label="Move this match earlier in the day"
            className={ACTION_SM}
          >
            <ArrowUp size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label="Move this match later in the day"
            className={ACTION_SM}
          >
            <ArrowDown size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isCyclic && (
        <p className="text-ccs-red text-xs mb-2.5">
          On a loop — this match ends up feeding itself. Clear one of its sources.
        </p>
      )}

      {isTerminal && !isCyclic && (
        <p className="flex items-center gap-1.5 text-text-dim text-xs mb-2.5">
          <Flag size={12} aria-hidden="true" />
          Nothing consumes this result{wasTerminal ? "" : " yet"} — an end of the bracket.
        </p>
      )}

      {/* A slot and its team are two different rows — the slot holds the wiring, the match holds the
          team — so one change can touch both. `undefined` from the editor means "team unchanged". */}
      <SlotEditor
        side="top"
        slot={node.top}
        node={node}
        nodes={nodes}
        teams={teams}
        issues={issues}
        path={path}
        consumed={consumed}
        onChange={(slot, teamId) => {
          const changes: Partial<NodeSave> = { top: slot };
          if (teamId !== undefined) changes.match = { ...node.match, teamAId: teamId };
          onChange(changes);
        }}
      />
      <SlotEditor
        side="bottom"
        slot={node.bottom}
        node={node}
        nodes={nodes}
        teams={teams}
        issues={issues}
        path={path}
        consumed={consumed}
        onChange={(slot, teamId) => {
          const changes: Partial<NodeSave> = { bottom: slot };
          if (teamId !== undefined) changes.match = { ...node.match, teamBId: teamId };
          onChange(changes);
        }}
      />

      {/*
        Two-up for the short fields, full width for the long ones, and no `sm:` anywhere in this card.
        A breakpoint keys off the *viewport*, which knows nothing about the fixed-width column this sits
        in — so `sm:grid-cols-12` cheerfully cut a team picker into a sixth of 350px on a wide screen.
        Inside a column, the layout has to be unconditional.
      */}
      <div className="mt-2.5 pt-2.5 border-t border-border flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL_CLASS}>Day</label>
            {/* Moves the card to another column, landing it at the bottom — the parent renumbers the
                ordinal, because keeping this one would drop it wherever the target day had a gap. */}
            <select
              value={node.match.matchDay}
              aria-label="Match day"
              onChange={e => onSetDay(Number(e.target.value))}
              className={`${CONTROL_CLASS} ${fieldError(issues, `${path}.match.matchDay`)}`}
            >
              {Array.from({ length: phase.matchDays }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>
                  Day {d} · season day {seasonDayOf(phase, d)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Best of</label>
            <select
              value={node.match.bestOf ?? ""}
              aria-label="Best of"
              onChange={e => {
                const value = Number(e.target.value);
                onChange({
                  match: { ...node.match, bestOf: isBestOf(value) ? (value as BestOf) : null },
                });
              }}
              className={CONTROL_CLASS}
            >
              <option value="">Inherit — Bo{phase.defaultBestOf}</option>
              {BEST_OF_VALUES.map(n => (
                <option key={n} value={n}>
                  Bo{n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Kickoff override</label>
          <input
            type="datetime-local"
            value={toLocalInput(node.match.scheduledAt)}
            aria-label="Kickoff override"
            onChange={e =>
              onChange({ match: { ...node.match, scheduledAt: fromLocalInput(e.target.value) } })
            }
            className={CONTROL_CLASS}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Stream</label>
          <input
            value={node.match.streamUrl ?? ""}
            maxLength={STREAM_URL_MAX}
            placeholder="https://twitch.tv/…"
            aria-label="Stream URL"
            onChange={e =>
              onChange({
                match: { ...node.match, streamUrl: e.target.value === "" ? null : e.target.value },
              })
            }
            className={CONTROL_CLASS}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One slot: where its team comes from, and — for an entry — which team.
 *
 * `onChange` takes the team id separately because it does not live on the slot: `top` is the match's
 * `teamAId` and `bottom` is its `teamBId`. `undefined` means "leave the team alone".
 */
function SlotEditor({
  side,
  slot,
  node,
  nodes,
  teams,
  issues,
  path,
  consumed,
  onChange,
}: {
  side: SlotSide;
  slot: SlotSave;
  node: NodeSave;
  nodes: readonly NodeSave[];
  teams: readonly TeamRecord[];
  issues: readonly ValidationIssue[];
  path: string;
  consumed: ReadonlyMap<string, string>;
  onChange: (slot: SlotSave, teamId?: number | null) => void;
}) {
  const teamId = side === "top" ? node.match.teamAId : node.match.teamBId;
  const other = side === "top" ? node.bottom : node.top;
  const derived = slot.src !== null;
  const value = slot.src ? `${slot.src.node}:${slot.src.output}` : "";
  // A stored seed is always valid — the normaliser drops what isn't — so this can only fire mid-typing.
  const badSeed = slot.seed !== null && !isSlotSeed(slot.seed);

  return (
    // One slot is a labelled block of two rows, not one row of three fields. In a fixed-width column
    // there is no honest way to fit a seed box, a source picker and a team picker side by side — the
    // previous 2/5/5 split left the seed about 30px wide.
    <div className="mb-2.5">
      <p className="font-heading text-[10px] tracking-wider uppercase text-text-secondary mb-1">
        {side === "top" ? "Top" : "Bottom"}
      </p>

      {/*
        Sized by wrappers rather than by overriding `CONTROL_CLASS`'s `w-full` on the controls. Two
        Tailwind width utilities on one element are resolved by their order in the generated stylesheet,
        not by the class attribute, so `w-20` next to `w-full` is a coin toss. `min-w-0` on the source
        picker is load-bearing too: a select's min-content width comes from its longest option, and
        "Winner of Quarterfinal 1 (day 1)" would otherwise push the row wider than the column.
      */}
      <div className="flex gap-2">
        {/*
          Seed is an **entry-slot field only**.

          A seed names who is *placed* here — `"1A"` is the first seed out of group A — and a derived slot
          holds whoever won the match feeding it. So there is nobody to label: the answer is "the winner of
          Quarterfinal 1", which the source picker already says, and a seed sitting next to it would be a
          second, staler claim about the same slot. Hidden rather than disabled, because a disabled box
          still reads as a field this slot has.
        */}
        {!derived && (
          <div className="w-20 shrink-0">
            {/* Text, not a number input. 1–8 letters or digits is the whole rule. An empty field is
                `null`: `""` is refused upstream because `null` already means "none", and two spellings of
                nothing is how an editor ends up rendering an empty box that is not empty. */}
            <input
              type="text"
              inputMode="text"
              maxLength={SLOT_SEED_MAX}
              value={slot.seed ?? ""}
              placeholder="Seed"
              aria-label={`${side} seed`}
              aria-invalid={badSeed || undefined}
              title="1–8 letters or digits, like 1 or 1A"
              onChange={e => onChange({ ...slot, seed: e.target.value === "" ? null : e.target.value })}
              className={`${CONTROL_CLASS} ${badSeed ? "border-ccs-red/50" : ""} ${fieldError(issues, `${path}.${side}.seed`)}`}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <select
            value={value}
            aria-label={`Where the ${side} team comes from`}
            onChange={e => {
              if (e.target.value === "") {
                onChange({ ...slot, src: null });
                return;
              }
              const [id, output] = e.target.value.split(":");
              // Both the team and the seed go. The team is propagation's, so clearing it stops a stale
              // hand-placed one sitting there until the next ingest overwrites it — and the seed is about
              // to be hidden, so keeping it would leave a value in the document that no screen shows and
              // the next save would write anyway.
              onChange(
                { ...slot, seed: null, src: { node: Number(id), output: output as SlotOutput } },
                null,
              );
            }}
            className={`${CONTROL_CLASS} ${fieldError(issues, `${path}.${side}.src`)}`}
          >
            <option value="">Entry — placed by hand</option>
            {nodes.flatMap((source, sourceIndex) => {
              // A slot may not draw from its own node, and a node's two slots may not draw from the
              // same source — that would be the winner and loser of one match, one team twice.
              if (source.id === node.id) return [];
              if (other.src?.node === source.id) return [];

              return (["winner", "loser"] as const).map(output => {
                const key = outputKey(source.id, output);
                const holder = consumed.get(key);
                const mine = value === key;

                return (
                  <option key={key} value={key} disabled={holder !== undefined && !mine}>
                    {output === "winner" ? "Winner" : "Loser"} of {nameOf(source, sourceIndex)}
                    {holder !== undefined && !mine ? ` — taken by ${holder}` : ""}
                  </option>
                );
              });
            })}
          </select>
        </div>
      </div>

      {badSeed && (
        <p className="text-ccs-red text-xs mt-1">Letters and digits only — like 1 or 1A.</p>
      )}

      <div className="mt-1.5">
        <select
          value={teamId ?? ""}
          disabled={derived}
          aria-label={`${side} team`}
          title={derived ? "Filled in automatically once the source match is decided" : undefined}
          onChange={e => onChange(slot, e.target.value === "" ? null : Number(e.target.value))}
          className={`${CONTROL_CLASS} ${fieldError(issues, `${path}.match.team${side === "top" ? "A" : "B"}Id`)}`}
        >
          <option value="">{derived ? "— decided by results —" : "— TBD —"}</option>
          {teams
            .filter(t => t.id !== (side === "top" ? node.match.teamBId : node.match.teamAId))
            .map(t => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- side panel

/**
 * Live standings of every **earlier** group phase, each team with its resolved scenario.
 *
 * Read-only, deliberately. **Nothing is ever auto-filled from it** — a tie the ranking will not break
 * is exactly the case where the automatic answer is wrong and a human has to decide, which is why
 * entry slots are placed by hand at all. A tied row's scenario is provisional and marked as such.
 */
function CandidatesPanel({
  loading,
  error,
  phases,
}: {
  loading: boolean;
  error: string | null;
  phases: readonly CandidatePhase[];
}) {
  if (error) return <ErrorLine message={`Couldn't load the standings panel: ${error}`} />;
  if (loading) return <p className="text-text-dim text-sm">Loading standings…</p>;

  if (phases.length === 0) {
    return (
      <p className="text-text-dim text-sm">
        No earlier group phase to seed from. A bracket at the start of a season is placed entirely by
        hand.
      </p>
    );
  }

  return (
    <section className="border-t border-border pt-4">
      <h3 className="font-heading text-xs tracking-wider uppercase text-text-secondary mb-1">
        Who finished where
      </h3>
      <p className="text-text-secondary text-sm mb-3">
        For reference while placing entry slots. Nothing here fills anything in.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {phases.flatMap(p =>
          p.groups.map(table => (
            <div key={`${p.phaseId}:${table.group.id}`} className="bg-bg3 border border-border rounded-md p-3">
              <p className="font-heading text-[10px] tracking-wider uppercase text-text-dim mb-2">
                {p.phaseName} · Group {table.group.name}
              </p>
              <ol className="flex flex-col gap-1">
                {table.teams.map(team => (
                  <li key={team.teamId} className="flex items-baseline gap-2 text-sm">
                    <span className="font-mono text-xs text-text-secondary w-8 shrink-0">
                      {team.place}
                    </span>
                    <span className="text-text-bright">{team.code}</span>
                    <span className="text-text-dim text-xs">
                      {team.seriesWins}-{team.seriesLosses}
                    </span>
                    {team.scenario && (
                      <span
                        className={`ml-auto text-xs ${team.tied ? "text-text-dim italic" : "text-text-secondary"}`}
                        title={
                          team.tied
                            ? "Provisional — this team shares its rank, so the outcome is not settled"
                            : team.scenario.subtitle
                        }
                      >
                        {team.scenario.title}
                        {team.tied ? "?" : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )),
        )}
      </div>
    </section>
  );
}
