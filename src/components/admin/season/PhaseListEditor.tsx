/**
 * The season page — `PUT /tournaments/:conf/phases`.
 *
 * A season is an ordered list of phases, each a group phase or a bracket phase, in any order and any
 * number. `bracket, group, bracket` is legal; three group phases is legal; playoffs do not have to be
 * last. Nothing here privileges an arrangement because nothing upstream does.
 *
 * Three properties of the save drive the whole design of this file:
 *
 *  - **It is whole-document.** The array is the season, so a phase removed from it is a phase being
 *    deleted along with its groups, matches, bracket and codes. That is why deleting asks, and why the
 *    draft is held here in full rather than each row owning its own state.
 *  - **`ordinal` is array position.** It is never sent. Reordering is sending the array in a different
 *    order, which is why the buttons are Move up / Move down and there is no ordinal field.
 *  - **A phase's `kind` cannot change.** Changing it is a delete plus a create, and the server refuses
 *    it, so there is no kind field at all: the two Add buttons are where a kind is chosen, once.
 *
 * The season-day column is recomputed locally on every keystroke rather than read from `days`, because
 * the whole point of the running sum is that resizing phase 1 moves phase 3 — and the user needs to
 * see that *before* saving, not after.
 */

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, GitBranch, Plus, Trash2, Users } from "lucide-react";
import { ConfirmButton } from "../../ConfirmButton";
import { DateTimePicker } from "../../DateTimePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ErrorLine } from "../adminUi";
import { IssueList, invalidAt } from "./issues";
import { queryRoots } from "../../../lib/queries";
import {
  BEST_OF_VALUES,
  PHASE_NAME_MAX,
  SaveRejected,
  errorMessage,
  isBestOf,
  savePhaseList,
  toListEntry,
  type BestOf,
  type PhaseKind,
  type PhaseSummary,
  type ValidationIssue,
} from "../../../lib/api";

interface Props {
  conf: string;
  /** The list as last read from the server. Re-keyed by the caller when the conf changes. */
  phases: readonly PhaseSummary[];
  /** Opens the contents editor for one phase. Disabled for a phase that has not been saved yet. */
  onEdit: (phase: PhaseSummary) => void;
  onSaved: (message: string) => void;
}

/**
 * Client-side ids count **down** from -1, and are only ever unique within one request.
 *
 * A phase added, saved, and then followed by another gets -1 again, which is correct — the previous -1
 * became a real serial the moment the save returned.
 */
function nextId(phases: readonly PhaseSummary[]): number {
  return Math.min(0, ...phases.map(p => p.id)) - 1;
}

/** Season-day ranges for a draft, from array order. The same running sum the server does. */
function ranges(phases: readonly PhaseSummary[]): Array<{ from: number; to: number }> {
  let day = 1;
  return phases.map(p => {
    const from = day;
    day += p.matchDays;
    return { from, to: day - 1 };
  });
}

function blank(kind: PhaseKind, id: number): PhaseSummary {
  return {
    id,
    kind,
    bracketView: null,
    name: kind === "group" ? "Group Stage" : "Playoffs",
    ordinal: 1,
    matchDays: kind === "group" ? 8 : 3,
    // New phases start hidden. Publishing is the deliberate act of announcing a
    // season, and it should not be the side effect of adding a row to a list.
    published: false,
    defaultStartAt: null,
    defaultBestOf: 3,
    days: { from: 1, to: 1 },
  };
}

export function PhaseListEditor({ conf, phases, onEdit, onSaved }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PhaseSummary[]>([...phases]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const days = useMemo(() => ranges(draft), [draft]);

  // Compared against the server's copy rather than tracked with a flag, so an edit and its exact
  // reversal correctly reads as no change.
  const dirty = useMemo(
    () => JSON.stringify(draft.map(toListEntry)) !== JSON.stringify([...phases].map(toListEntry)),
    [draft, phases],
  );

  const update = (index: number, changes: Partial<PhaseSummary>): void => {
    setDraft(list => list.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  };

  const move = (index: number, by: -1 | 1): void => {
    setDraft(list => {
      const to = index + by;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  };

  const add = (kind: PhaseKind): void => {
    setDraft(list => [...list, blank(kind, nextId(list))]);
    setIssues([]);
  };

  const remove = (index: number): void => {
    setDraft(list => list.filter((_, i) => i !== index));
    setIssues([]);
  };

  const save = useMutation({
    mutationFn: () => savePhaseList(conf, draft.map(toListEntry)),
    onSuccess: async result => {
      setIssues([]);
      // The server's copy, with real ids and renumbered ordinals, replaces the draft. Reusing the
      // local one would leave negative ids in state, which the next save would read as new rows.
      setDraft(result.phases);
      // Both roots: a resize renumbers season days, and a delete takes matches with it.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.season }),
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      ]);
      onSaved(`Saved ${result.phases.length} ${result.phases.length === 1 ? "phase" : "phases"}.`);
    },
    onError: (e: unknown) => {
      setIssues(e instanceof SaveRejected ? e.issues : []);
    },
  });

  /** `phases.2.matchDays` as "Playoffs — length". The server points at the array it was sent. */
  const labelFor = (path: string): string | null => {
    const index = Number(path.split(".")[1]);
    return Number.isInteger(index) && draft[index] ? draft[index].name || `Phase ${index + 1}` : null;
  };

  const canSave = dirty && draft.every(p => p.name.trim() !== "");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary text-sm">
        The season, in order. A phase&apos;s position is where it sits in this list and its length is
        its match days — <span className="text-text">nothing stores where a phase starts</span>, so
        inserting or resizing one shifts every phase after it.
      </p>

      {draft.length === 0 ? (
        <Empty className="p-6 md:p-6">
          <EmptyHeader>
            <EmptyTitle>No phases yet. Add a group stage or a bracket to begin.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="flex flex-col gap-3">
          {draft.map((phase, index) => (
            <PhaseRow
              key={phase.id}
              phase={phase}
              index={index}
              days={days[index]}
              issues={issues}
              isFirst={index === 0}
              isLast={index === draft.length - 1}
              onChange={changes => update(index, changes)}
              onMove={by => move(index, by)}
              onDelete={() => remove(index)}
              onEdit={() => onEdit(phase)}
            />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => add("group")}>
          <Plus size={15} aria-hidden="true" />
          Add group stage
        </Button>
        <Button type="button" variant="outline" onClick={() => add("bracket")}>
          <Plus size={15} aria-hidden="true" />
          Add bracket
        </Button>
      </div>

      <IssueList issues={issues} label={labelFor} />

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="button" onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
          <Check size={15} aria-hidden="true" />
          {save.isPending ? "Saving…" : "Save season"}
        </Button>
        {dirty ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft([...phases]);
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
    </div>
  );
}

interface RowProps {
  phase: PhaseSummary;
  index: number;
  days: { from: number; to: number };
  issues: readonly ValidationIssue[];
  isFirst: boolean;
  isLast: boolean;
  onChange: (changes: Partial<PhaseSummary>) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onEdit: () => void;
}

function PhaseRow({
  phase,
  index,
  days,
  issues,
  isFirst,
  isLast,
  onChange,
  onMove,
  onDelete,
  onEdit,
}: RowProps) {
  const path = `phases.${index}`;
  const rowIssues = issues.filter(i => i.path === path || i.path.startsWith(`${path}.`));
  const isNew = phase.id < 0;
  const Icon = phase.kind === "group" ? Users : GitBranch;

  return (
    <li
      className={`bg-bg3 border rounded-lg p-4 ${
        rowIssues.length > 0 ? "border-ccs-red/50" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon size={16} className="text-text-secondary shrink-0" aria-hidden="true" />
          <span className="font-heading text-xs text-text-secondary">
            {phase.kind === "group" ? "Group stage" : "Bracket"}
          </span>
          <Badge variant={!phase.published ? "muted" : "default"}>
            {days.from === days.to ? `Day ${days.from}` : `Days ${days.from}–${days.to}`}
          </Badge>
          {isNew && <Badge variant="muted">Unsaved</Badge>}
          {!phase.published && !isNew && <Badge variant="muted">Hidden</Badge>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label={`Move ${phase.name} earlier`}
          >
            <ArrowUp size={13} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label={`Move ${phase.name} later`}
          >
            <ArrowDown size={13} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field data-invalid={invalidAt(issues, `${path}.name`)} className="sm:col-span-2">
          <FieldLabel htmlFor={`phase-name-${phase.id}`}>Name</FieldLabel>
          <Input
            id={`phase-name-${phase.id}`}
            value={phase.name}
            onChange={e => onChange({ name: e.target.value })}
            maxLength={PHASE_NAME_MAX}
            placeholder="Regular Season"
            aria-invalid={invalidAt(issues, `${path}.name`)}
          />
        </Field>

        <Field data-invalid={invalidAt(issues, `${path}.matchDays`)}>
          <FieldLabel htmlFor={`phase-days-${phase.id}`}>Match days</FieldLabel>
          <Input
            id={`phase-days-${phase.id}`}
            type="number"
            min={1}
            max={99}
            value={phase.matchDays}
            onChange={e => onChange({ matchDays: Math.max(1, Number(e.target.value) || 1) })}
            aria-invalid={invalidAt(issues, `${path}.matchDays`)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`phase-bo-${phase.id}`}>Default best-of</FieldLabel>
          <NativeSelect
            id={`phase-bo-${phase.id}`}
            value={phase.defaultBestOf}
            onChange={e => {
              const value = Number(e.target.value);
              if (isBestOf(value)) onChange({ defaultBestOf: value as BestOf });
            }}
          >
            {BEST_OF_VALUES.map(n => (
              <NativeSelectOption key={n} value={n}>
                Bo{n}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Field data-invalid={invalidAt(issues, `${path}.defaultStartAt`)} className="sm:col-span-2">
          <FieldLabel htmlFor={`phase-start-${phase.id}`}>First day kickoff</FieldLabel>
          <DateTimePicker
            id={`phase-start-${phase.id}`}
            value={phase.defaultStartAt}
            onChange={defaultStartAt => onChange({ defaultStartAt })}
            aria-invalid={invalidAt(issues, `${path}.defaultStartAt`)}
            aria-describedby={`phase-start-${phase.id}-hint`}
          />
          <FieldDescription id={`phase-start-${phase.id}-hint`}>
            Your local time. Later match days default to a week apart from here, so a bracket starting
            three weeks after the group stage is this one field.
          </FieldDescription>
        </Field>

        <div className="sm:col-span-2 flex flex-col justify-end">
          <label className="flex items-center gap-2.5 cursor-pointer text-sm text-text">
            <Checkbox
              checked={phase.published}
              onCheckedChange={v => onChange({ published: v === true })}
              aria-describedby={`phase-published-${phase.id}-hint`}
            />
            Visible to the public
          </label>
          <p id={`phase-published-${phase.id}-hint`} className="text-text-dim text-xs mt-1.5">
            An unpublished phase is left out of every public read entirely, not flagged. Build next
            split&apos;s playoffs in the open.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-border">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={isNew}
            aria-describedby={isNew ? `phase-edit-${phase.id}-hint` : undefined}
          >
            {phase.kind === "group" ? "Groups & scenarios" : "Bracket wiring"}
          </Button>
          {/* Said in text rather than a tooltip: a disabled button can be neither hovered nor focused. */}
          {isNew && (
            <span id={`phase-edit-${phase.id}-hint`} className="text-text-dim text-xs">
              Save the season first. This phase doesn&apos;t exist yet.
            </span>
          )}
        </div>

        <ConfirmButton
          title={`Remove ${phase.name || "this phase"}?`}
          description="Saving the season then deletes its groups, matches, bracket and codes."
          confirmLabel="Remove"
          onConfirm={onDelete}
          trigger={
            <Button type="button" variant="destructive" size="sm" aria-label={`Remove ${phase.name}`}>
              <Trash2 size={13} aria-hidden="true" />
              Remove
            </Button>
          }
        />
      </div>
    </li>
  );
}
