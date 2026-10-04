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
 * Saved manual rounds (`bracketView: false`) forbid every source. The editor keeps team and seed
 * controls but disables advancement choices; the API validates the same invariant on save.
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
import { DateTimePicker } from "../../DateTimePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ErrorLine } from "../adminUi";
import { IssueList, invalidAt } from "./issues";
import { PhaseViewField } from "./PhaseViewField";
import { DayKickoffField, StrandedDaysNotice, withDayDefault } from "./DayKickoff";
import { StandingsReference, type ReferenceTable } from "../../season/StandingsReference";
import { queries, queryRoots } from "../../../lib/queries";
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
  savePhaseList,
  seasonDayOf,
  shiftDayDefaults,
  strandedDayDefaults,
  toListEntry,
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
  const [viewChoice, setViewChoice] = useState<{ base: boolean | null; value: boolean } | null>(null);
  const [viewIssues, setViewIssues] = useState<ValidationIssue[]>([]);
  const [viewPath, setViewPath] = useState("");
  const view = viewChoice && viewChoice.base === phase.bracketView ? viewChoice.value : phase.bracketView;
  const manualRounds = phase.bracketView === false;
  const hasManualSources = manualRounds && draft.nodes.some(node => node.top.src !== null || node.bottom.src !== null);

  const candidates = useQuery(queries.phaseCandidates(conf, phase.id));

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(contents), [draft, contents]);
  const savedSources = contents.nodes.some(node => node.top.src !== null || node.bottom.src !== null);

  const saveView = useMutation({
    retry: false,
    mutationFn: async (bracketView: boolean) => {
      // The API replaces the entire season list. Read it on this click to preserve other phases
      // and their current settings instead of echoing the list cached when this editor opened.
      const phases = await qc.fetchQuery(queries.seasonPhases(conf));
      const index = phases.findIndex(p => p.id === phase.id);
      if (index === -1) throw new Error("This phase no longer exists. Return to the season page.");
      if (phases[index].bracketView === null) throw new Error("This server does not support saving a phase view yet.");
      setViewPath(`phases.${index}.bracketView`);
      return savePhaseList(conf, phases.map(p => toListEntry(p.id === phase.id ? { ...p, bracketView } : p)));
    },
    onSuccess: async () => {
      setViewIssues([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.season }),
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      ]);
      setViewChoice(null);
      onSaved(`Saved ${phase.name} view.`);
    },
    onError: (e: unknown) => setViewIssues(e instanceof SaveRejected ? e.issues : []),
  });

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
      <div className="flex max-w-2xl flex-col gap-3 rounded-md border border-border bg-bg2 p-4">
        <PhaseViewField
          id={`phase-view-${phase.id}`}
          value={view}
          disabled={save.isPending || saveView.isPending}
          invalid={viewPath ? invalidAt(viewIssues, viewPath) : undefined}
          onChange={value => {
            setViewChoice({ base: phase.bracketView, value });
            setViewIssues([]);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={view === null || view === phase.bracketView || dirty || (view === false && savedSources) || save.isPending || saveView.isPending}
            onClick={() => { if (view !== null) saveView.mutate(view); }}
          >
            {saveView.isPending ? "Saving view…" : "Save phase view"}
          </Button>
          {dirty && <p className="text-xs text-text-dim">Save or discard the match changes before saving the phase view.</p>}
          {view === false && savedSources && <p className="text-xs text-text-dim">Clear every advancement source and save the bracket first.</p>}
        </div>
        <IssueList issues={viewIssues} />
        <ErrorLine message={saveView.isError && !(saveView.error instanceof SaveRejected) ? errorMessage(saveView.error) : null} />
      </div>

      <fieldset disabled={saveView.isPending} className="flex min-w-0 flex-col gap-5 border-0 p-0">
        <p className="text-text-secondary text-sm max-w-2xl">
          {manualRounds ? (
            <>Each card is one match. Place teams by hand in each round. Results do not assign teams in
              later rounds, and advancement sources are unavailable while this phase uses manual rounds.</>
          ) : (
            <>Each card is one match. Wire a slot to the winner or loser of an earlier match, or leave it as an
              entry and place the team by hand. Saving fills in every team the results already imply.</>
          )}
        </p>
        <p className="text-text-secondary text-sm max-w-2xl">
          {manualRounds ? (
            <>Each column is one round. The arrows on a card set its order within that round.
              Use Phase view above to enable bracket wiring.</>
          ) : (
            <>A column is a match <em>day</em>, and the arrows on a card set its order within that day. The{" "}
              <span className="text-text">round</span> follows the wiring while the card stays where you put it.
              To switch to manual rounds, clear every advancement source and save here first.</>
          )}
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
                      <span className="font-display text-base text-text-bright ">
                        {manualRounds ? "Round" : "Day"} {matchDay}
                      </span>
                      <Badge variant="muted">Season day {seasonDayOf(phase, matchDay)}</Badge>
                      {/* Same reason as the group editor: a column of cards puts the button below the
                          fold, so adding several means scrolling back after each one. */}
                      <div className="ml-auto">
                        <Button type="button" variant="outline" size="sm" onClick={() => addNode(matchDay)}>
                          <Plus size={13} aria-hidden="true" />
                          Add
                        </Button>
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
                        dayKickoff={kickoffs[matchDay - 1] ?? null}
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

        {hasManualSources && (
          <p className="text-ccs-red text-sm">Manual rounds cannot contain advancement sources. Clear every source before saving.</p>
        )}

        {strandedNodes.length > 0 && (
          <p className="text-ccs-red text-sm">
            {strandedNodes.length} match(es) sit past day {phase.matchDays} and are not shown. Lengthen the
            phase on the season page, or they can&apos;t be saved.
          </p>
        )}

        <StandingsReference
          loading={candidates.isPending}
          error={candidates.isError ? errorMessage(candidates.error) : null}
          tables={toReference(candidates.data ?? [])}
        />

        <IssueList issues={issues} />

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={!dirty || stranded.length > 0 || cyclic.length > 0 || hasManualSources || save.isPending}
          >
            <Check size={15} aria-hidden="true" />
            {save.isPending ? "Saving…" : manualRounds ? "Save rounds" : "Save bracket"}
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(contents);
                setIssues([]);
              }}
              disabled={save.isPending}
            >
              Discard changes
            </Button>
          ) : (
            <span className="text-text-dim text-xs">No changes to save.</span>
          )}
        </div>

        <ErrorLine
          message={save.isError && !(save.error instanceof SaveRejected) ? errorMessage(save.error) : null}
        />
      </fieldset>
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
  dayKickoff,
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
  /** What a null kickoff resolves to: the day's own, so the picker opens on it. */
  dayKickoff: Date | null;
  onChange: (changes: Partial<NodeSave>) => void;
  onMove: (by: -1 | 1) => void;
  /** Day changes go through the parent: it renumbers the ordinal against the target day. */
  onSetDay: (matchDay: number) => void;
  onRemove: () => void;
}) {
  const path = `nodes.${index}`;
  const id = `node-${node.id}`;
  const bad =
    isCyclic ||
    issues.some(i => i.path === path || i.path.startsWith(`${path}.`)) ||
    issues.some(i => i.subjects?.includes(node.id));

  return (
    <div className={`border rounded-md p-3 bg-bg2 ${bad ? "border-ccs-red/50" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <Input
          value={node.label ?? ""}
          onChange={e => onChange({ label: e.target.value === "" ? null : e.target.value })}
          maxLength={NODE_LABEL_MAX}
          placeholder="Quarterfinal 1"
          aria-label="Match label"
          aria-invalid={invalidAt(issues, `${path}.label`)}
        />
        <Button type="button" variant="destructive" size="sm" onClick={onRemove} aria-label="Remove this match">
          <Trash2 size={13} aria-hidden="true" />
        </Button>
      </div>

      {/* The round, which the column cannot say because the column is a day. Read-only by construction:
          it is the wiring's answer, so the way to change it is to rewire a slot below. The arrows next to
          it move the card, which is a separate thing — position is `ordinal` and this is a label. */}
      <div className="flex items-center gap-2 mb-2.5">
        <Badge variant="muted">{phase.bracketView === false ? `Round ${node.match.matchDay}` : isCyclic ? "No round - looped" : roundName(round)}</Badge>
        <span className="text-text-dim text-xs">#{node.match.ordinal} on day {node.match.matchDay}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label="Move this match earlier in the day"
          >
            <ArrowUp size={13} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label="Move this match later in the day"
          >
            <ArrowDown size={13} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {isCyclic && (
        <p className="text-ccs-red text-xs mb-2.5">
          On a loop — this match ends up feeding itself. Clear one of its sources.
        </p>
      )}

      {phase.bracketView !== false && isTerminal && !isCyclic && (
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
        allowSources={phase.bracketView !== false}
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
        allowSources={phase.bracketView !== false}
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
          <Field data-invalid={invalidAt(issues, `${path}.match.matchDay`)}>
            <FieldLabel htmlFor={`${id}-day`}>Day</FieldLabel>
            {/* Moves the card to another column, landing it at the bottom — the parent renumbers the
                ordinal, because keeping this one would drop it wherever the target day had a gap. */}
            <NativeSelect
              id={`${id}-day`}
              value={node.match.matchDay}
              aria-invalid={invalidAt(issues, `${path}.match.matchDay`)}
              onChange={e => onSetDay(Number(e.target.value))}
            >
              {Array.from({ length: phase.matchDays }, (_, i) => i + 1).map(d => (
                <NativeSelectOption key={d} value={d}>
                  Day {d} · season day {seasonDayOf(phase, d)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-bo`}>Best of</FieldLabel>
            <NativeSelect
              id={`${id}-bo`}
              value={node.match.bestOf ?? ""}
              onChange={e => {
                const value = Number(e.target.value);
                onChange({
                  match: { ...node.match, bestOf: isBestOf(value) ? (value as BestOf) : null },
                });
              }}
            >
              <NativeSelectOption value="">Inherit — Bo{phase.defaultBestOf}</NativeSelectOption>
              {BEST_OF_VALUES.map(n => (
                <NativeSelectOption key={n} value={n}>
                  Bo{n}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field data-invalid={invalidAt(issues, `${path}.match.scheduledAt`)}>
          <FieldLabel htmlFor={`${id}-kickoff`}>Kickoff override</FieldLabel>
          {/* Opens on the day's kickoff without pinning it: nothing is stored until Apply. */}
          <DateTimePicker
            id={`${id}-kickoff`}
            value={node.match.scheduledAt}
            onChange={scheduledAt => onChange({ match: { ...node.match, scheduledAt } })}
            placeholder="Inherits the day"
            suggested={dayKickoff?.toISOString() ?? null}
            aria-invalid={invalidAt(issues, `${path}.match.scheduledAt`)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-stream`}>Stream</FieldLabel>
          <Input
            id={`${id}-stream`}
            value={node.match.streamUrl ?? ""}
            maxLength={STREAM_URL_MAX}
            placeholder="https://twitch.tv/…"
            onChange={e =>
              onChange({
                match: { ...node.match, streamUrl: e.target.value === "" ? null : e.target.value },
              })
            }
          />
        </Field>
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
  allowSources,
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
  allowSources: boolean;
  onChange: (slot: SlotSave, teamId?: number | null) => void;
}) {
  const teamId = side === "top" ? node.match.teamAId : node.match.teamBId;
  const other = side === "top" ? node.bottom : node.top;
  const derived = slot.src !== null;
  const value = slot.src ? `${slot.src.node}:${slot.src.output}` : "";
  // A stored seed is always valid — the normalizer drops what isn't — so this can only fire mid-typing.
  const badSeed = slot.seed !== null && !isSlotSeed(slot.seed);
  const id = `node-${node.id}-${side}`;

  return (
    // One slot is a labeled block of two rows, not one row of three fields. In a fixed-width column
    // there is no honest way to fit a seed box, a source picker and a team picker side by side — the
    // previous 2/5/5 split left the seed about 30px wide.
    <div role="group" aria-labelledby={`${id}-label`} className="mb-2.5">
      <p id={`${id}-label`} className="font-heading text-[10px] text-text-secondary mb-1">
        {side === "top" ? "Top" : "Bottom"}
      </p>

      {/*
        Sized by wrappers. `min-w-0` on the source picker is load-bearing: a select's min-content width
        comes from its longest option, and "Winner of Quarterfinal 1 (day 1)" would otherwise push the
        row wider than the column.
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
            <Input
              type="text"
              inputMode="text"
              maxLength={SLOT_SEED_MAX}
              value={slot.seed ?? ""}
              placeholder="Seed"
              aria-label={`${side} seed`}
              aria-invalid={badSeed || invalidAt(issues, `${path}.${side}.seed`)}
              aria-describedby={`${id}-seed-hint`}
              onChange={e => onChange({ ...slot, seed: e.target.value === "" ? null : e.target.value })}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <NativeSelect
            value={value}
            disabled={!allowSources && !derived}
            aria-label={`Where the ${side} team comes from`}
            aria-invalid={invalidAt(issues, `${path}.${side}.src`)}
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
          >
            <NativeSelectOption value="">Entry — placed by hand</NativeSelectOption>
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
                  <NativeSelectOption key={key} value={key} disabled={!allowSources || (holder !== undefined && !mine)}>
                    {output === "winner" ? "Winner" : "Loser"} of {nameOf(source, sourceIndex)}
                    {holder !== undefined && !mine ? ` — taken by ${holder}` : ""}
                  </NativeSelectOption>
                );
              });
            })}
          </NativeSelect>
        </div>
      </div>

      {!derived && (
        <p id={`${id}-seed-hint`} className={`text-xs mt-1 ${badSeed ? "text-ccs-red" : "sr-only"}`}>
          Letters and digits only — like 1 or 1A.
        </p>
      )}

      <div className="mt-1.5">
        <NativeSelect
          value={teamId ?? ""}
          disabled={derived}
          aria-label={`${side} team`}
          aria-invalid={invalidAt(issues, `${path}.match.team${side === "top" ? "A" : "B"}Id`)}
          onChange={e => onChange(slot, e.target.value === "" ? null : Number(e.target.value))}
        >
          <NativeSelectOption value="">{derived ? "— decided by results —" : "— TBD —"}</NativeSelectOption>
          {teams
            .filter(t => t.id !== (side === "top" ? node.match.teamBId : node.match.teamAId))
            .map(t => (
              <NativeSelectOption key={t.id} value={t.id}>
                {t.code} — {t.name}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- side panel

/**
 * `/candidates` in the shape `StandingsReference` renders.
 *
 * This endpoint is credentialed and site-admin only, which is why the panel takes a neutral shape
 * rather than this one: League Admin shows the same tables built from the season document, because
 * that route would 403 for it.
 */
function toReference(phases: readonly CandidatePhase[]): ReferenceTable[] {
  return phases.flatMap(p =>
    p.groups.map(table => ({
      key: `${p.phaseId}:${table.group.id}`,
      heading: `${p.phaseName} · Group ${table.group.name}`,
      rows: table.teams.map(team => ({
        key: String(team.teamId),
        place: team.place,
        code: team.code,
        tied: team.tied,
        seriesWins: team.seriesWins,
        seriesLosses: team.seriesLosses,
        scenario: team.scenario,
      })),
    })),
  );
}
