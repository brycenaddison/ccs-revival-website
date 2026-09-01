/**
 * A group phase's contents — `PUT /tournaments/:conf/phases/:id`.
 *
 * Three things in one document, because one save covers all three: the phase's **scenario library**,
 * its **groups** (membership and the placement-to-scenario mapping), and its **matches**.
 *
 * The save is whole-document, so everything is held here and sent together. A group removed from the
 * list is deleted; a match removed is deleted along with its codes.
 *
 * Two rules the server enforces that this editor has to make visible rather than let people trip over:
 *
 *  - **A scenario is referenced by key, and deleting a key orphans the outcomes pointing at it** — the
 *    save refuses that. So removing a scenario says how many mappings would break, and offers to clear
 *    them with it.
 *  - **Position coverage is deliberately not enforced.** `N` moves every time a team joins or leaves a
 *    group, so upstream will not reject a gap. It is a warning here and nothing more.
 *
 * Matches carry `bestOf: null` and `scheduledAt: null` meaning *inherit*, and the empty option in each
 * picker says what that inherits to. Never substitute the resolved value into the field: saving it back
 * would pin it, and the phase default would stop moving anything.
 */

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ACTION, ACTION_PRIMARY, ACTION_SM, ACTION_SM_DANGER, ErrorLine, Pill } from "../adminUi";
import { IssueList, fieldError } from "./issues";
import { DayKickoffField, StrandedDaysNotice, withDayDefault } from "./DayKickoff";
import { queryRoots } from "../../../lib/queries";
import { fromLocalInput, toLocalInput } from "../../../lib/utils";
import { SCENARIO_TONES, toneForLevel } from "../../../lib/scenarioTones";
import { ScenarioPill } from "../../season/ScenarioPill";
import {
  BEST_OF_VALUES,
  GROUP_NAME_MAX,
  STREAM_URL_MAX,
  SaveRejected,
  clearDayDefaultsAfter,
  dayKickoffs,
  errorMessage,
  isBestOf,
  pinnedDaysAfter,
  savePhaseContents,
  seasonDayOf,
  shiftDayDefaults,
  strandedDayDefaults,
  type BestOf,
  type DayDefault,
  type GroupPhaseContents,
  type GroupSave,
  type MatchSave,
  type PhaseSummary,
  type Scenario,
  type TeamRecord,
  type ValidationIssue,
} from "../../../lib/api";

interface Props {
  conf: string;
  phase: PhaseSummary;
  contents: GroupPhaseContents;
  /** Every team in the conference, for the pickers. Team **ids** are what the save takes. */
  teams: readonly TeamRecord[];
  onSaved: (message: string) => void;
}

const nextId = (ids: readonly number[]): number => Math.min(0, ...ids) - 1;

export function GroupPhaseEditor({ conf, phase, contents, teams, onSaved }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<GroupPhaseContents>(contents);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(contents),
    [draft, contents],
  );

  const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  const save = useMutation({
    mutationFn: () => savePhaseContents(conf, phase.id, draft),
    onSuccess: async result => {
      setIssues([]);
      // Rewrite the local negative ids before anything else can save again — a stale negative reads as
      // a *new* row on the next request and duplicates everything.
      setDraft(applyIdMap(draft, result.idMap));
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.season }),
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      ]);
      onSaved(`Saved ${phase.name}.`);
    },
    onError: (e: unknown) => setIssues(e instanceof SaveRejected ? e.issues : []),
  });

  const setGroups = (groups: GroupSave[]): void => setDraft(d => ({ ...d, groups }));
  const setMatches = (matches: MatchSave[]): void => setDraft(d => ({ ...d, matches }));

  const setDayDefault = (matchDay: number, startAt: string | null): void =>
    setDraft(d => ({ ...d, dayDefaults: withDayDefault(d.dayDefaults, matchDay, startAt) }));

  /** One gesture, one entry per remaining day — the rule upstream leaves to this client. */
  const shiftLater = (matchDay: number, offsetMs: number): void =>
    setDraft(d => ({
      ...d,
      dayDefaults: shiftDayDefaults(phase, d.dayDefaults, matchDay + 1, offsetMs),
    }));

  /** The way back out of a shift, and what lets it be offered a second time. */
  const clearLater = (matchDay: number): void =>
    setDraft(d => ({ ...d, dayDefaults: clearDayDefaultsAfter(phase, d.dayDefaults, matchDay) }));

  // Days pinned past a phase that was shortened under them. The save is refused while one is here, so
  // the notice is not advisory — see `StrandedDaysNotice`.
  const stranded = strandedDayDefaults(phase, draft.dayDefaults);

  return (
    <div className="flex flex-col gap-6">
      <ScenarioLibraryEditor
        scenarios={draft.scenarios}
        groups={draft.groups}
        issues={issues}
        onChange={scenarios => setDraft(d => ({ ...d, scenarios }))}
        onClearOrphans={key =>
          setGroups(
            draft.groups.map(g => ({
              ...g,
              outcomes: g.outcomes.filter(o => o.scenarioKey !== key),
            })),
          )
        }
      />

      <GroupsEditor
        groups={draft.groups}
        scenarios={draft.scenarios}
        teams={teams}
        issues={issues}
        onChange={setGroups}
      />

      <MatchesEditor
        phase={phase}
        matches={draft.matches}
        dayDefaults={draft.dayDefaults}
        teamsById={teamsById}
        teams={teams}
        issues={issues}
        onChange={setMatches}
        onDayDefault={setDayDefault}
        onShiftLater={shiftLater}
        onClearLater={clearLater}
      />

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

      <IssueList issues={issues} />

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || stranded.length > 0 || save.isPending}
          className={ACTION_PRIMARY}
        >
          <Check size={15} aria-hidden="true" />
          {save.isPending ? "Saving…" : "Save phase"}
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

/** Replaces every negative id in the draft with the serial the server assigned it. */
function applyIdMap(
  draft: GroupPhaseContents,
  idMap: { matches: Record<string, number>; groups: Record<string, number> },
): GroupPhaseContents {
  return {
    ...draft,
    groups: draft.groups.map(g => ({ ...g, id: idMap.groups[String(g.id)] ?? g.id })),
    matches: draft.matches.map(m => ({ ...m, id: idMap.matches[String(m.id)] ?? m.id })),
  };
}

// ---------------------------------------------------------------- scenarios

function ScenarioLibraryEditor({
  scenarios,
  groups,
  issues,
  onChange,
  onClearOrphans,
}: {
  scenarios: Record<string, Scenario>;
  groups: readonly GroupSave[];
  issues: readonly ValidationIssue[];
  onChange: (next: Record<string, Scenario>) => void;
  onClearOrphans: (key: string) => void;
}) {
  const entries = Object.entries(scenarios);

  /** How many outcome rows point at this key. Deleting it without them is a refused save. */
  const usage = (key: string): number =>
    groups.reduce((n, g) => n + g.outcomes.filter(o => o.scenarioKey === key).length, 0);

  /**
   * A fresh scenario, under a generated key.
   *
   * **The key is an identity, not a label.** It is what `group_outcomes` rows point at, so it is minted
   * once here and never changes again — a rename would orphan every position mapped to it, which the
   * save refuses. Nothing reads it: the pickers below select by title, and the standings receive the
   * scenario resolved inline, so a key never reaches a screen or a payload anyone reads.
   *
   * Opaque rather than derived from the title, deliberately. A slug would be wrong the moment someone
   * edited the title, and this way it is obvious there is nothing to keep in sync. The loop skips
   * anything already taken, which includes the meaningful keys older seasons were written with
   * (`advance`, `playin`) — those keep working untouched.
   */
  const add = (): void => {
    let n = entries.length + 1;
    while (`scenario-${n}` in scenarios) n += 1;
    // The first color nobody has taken, walking the ramp from the top — so a library built by adding
    // rows comes out gold, green, teal rather than three identical golds waiting to be told apart.
    const taken = new Set(entries.map(([, s]) => s.level));
    const level = SCENARIO_TONES.find(t => !taken.has(t.level))?.level ?? 1;
    // A default title, not an empty one: the position pickers below label by title, so two untitled
    // scenarios would be two identical options with no way to tell them apart.
    onChange({ ...scenarios, [`scenario-${n}`]: { level, title: "Advances", subtitle: "" } });
  };

  return (
    <section>
      <h3 className="font-heading text-xs tracking-wider uppercase text-text-secondary mb-1">
        Scenario library
      </h3>
      <p className="text-text-secondary text-sm mb-3">
        What a finishing position means — &ldquo;Advances&rdquo;, &ldquo;Play-in&rdquo;,
        &ldquo;Eliminated&rdquo;. Groups map positions onto these, so an eight-team group and two
        six-team groups can each advance a different number of teams. The color is how the row is
        shaded in the standings, and each one is picked to read on both the light and the dark theme.
      </p>

      {entries.length === 0 ? (
        <p className="text-text-dim text-sm py-3">
          None yet. Without one, a group&apos;s standings show no outcome column.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {entries.map(([key, scenario]) => (
            <li key={key} className="bg-bg3 border border-border rounded-md p-3">
              <div className="grid gap-2.5 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <label className={LABEL_CLASS}>Title</label>
                  <input
                    value={scenario.title}
                    placeholder="Advances"
                    onChange={e =>
                      onChange({ ...scenarios, [key]: { ...scenario, title: e.target.value } })
                    }
                    aria-label="Scenario title"
                    className={CONTROL_CLASS}
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className={LABEL_CLASS}>Subtitle</label>
                  <input
                    value={scenario.subtitle}
                    placeholder="Play-in berth"
                    onChange={e =>
                      onChange({ ...scenarios, [key]: { ...scenario, subtitle: e.target.value } })
                    }
                    aria-label="Scenario subtitle"
                    className={CONTROL_CLASS}
                  />
                </div>
                {/* A real fieldset, not a bare label like the fields above: ten radios need one
                    accessible name over the group, and a legend is how that is said without ARIA.
                    `min-w-0` because a fieldset's default `min-inline-size: min-content` otherwise
                    stops it shrinking inside the grid. */}
                <fieldset className="sm:col-span-12 min-w-0">
                  <legend className={LABEL_CLASS}>Color</legend>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                    <TonePicker
                      scenarioKey={key}
                      level={scenario.level}
                      onPick={level => onChange({ ...scenarios, [key]: { ...scenario, level } })}
                    />
                    <ScenarioBadge scenario={scenario} />
                  </div>
                </fieldset>
              </div>

              <div className="flex items-center justify-between gap-3 mt-2.5">
                <span className="text-text-dim text-xs">
                  {usage(key) === 0
                    ? "Not mapped to any position yet."
                    : `Used by ${usage(key)} ${usage(key) === 1 ? "position" : "positions"}.`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    // The save refuses an outcome pointing at a key that is gone, so they go together.
                    if (usage(key) > 0) onClearOrphans(key);
                    const next = { ...scenarios };
                    delete next[key];
                    onChange(next);
                  }}
                  aria-label={`Remove ${scenario.title || "this scenario"}`}
                  className={ACTION_SM_DANGER}
                >
                  <Trash2 size={13} aria-hidden="true" />
                  {usage(key) > 0 ? `Remove and clear ${usage(key)}` : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={add} className={`${ACTION_SM} mt-3`}>
        <Plus size={13} aria-hidden="true" />
        Add scenario
      </button>

      {issues.some(i => i.path.startsWith("scenarios")) && (
        <div className="mt-3">
          <IssueList issues={issues.filter(i => i.path.startsWith("scenarios"))} />
        </div>
      )}
    </section>
  );
}

/**
 * The ten levels as swatches.
 *
 * Real radio inputs, visually hidden and drawn over, rather than buttons carrying `aria-pressed`. A
 * palette is a single choice out of ten, which is what a radio group *is* — and the native one brings
 * arrow-key navigation, one tab stop for the group rather than ten, and the right announcement ("Gold,
 * 1 of 10") at no cost. `name` is scoped to the scenario key, which is minted once and never changes,
 * so two scenarios never share a group.
 */
function TonePicker({
  scenarioKey,
  level,
  onPick,
}: {
  scenarioKey: string;
  level: number;
  onPick: (level: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SCENARIO_TONES.map(tone => {
        const picked = tone.level === level;
        return (
          <label key={tone.level} className="group cursor-pointer" title={tone.name}>
            <input
              type="radio"
              name={`tone-${scenarioKey}`}
              value={tone.level}
              checked={picked}
              onChange={() => onPick(tone.level)}
              className="sr-only peer"
            />
            {/* The dot is the tone's own color on its own fill — the same pairing the badge and the
                standings row use, so a swatch is a small preview rather than a legend for one.

                Selection is carried by three things at once: full opacity, a solid border where the
                others have a translucent one, and the step up in size. One of them alone is too quiet
                against nine neighbours that are all already colored. */}
            <span
              // `group-hover`, not `peer-hover`: the peer is the `sr-only` input, which is clipped to a
              // pixel and so is never the thing under the cursor. Focus is the other way round — the
              // input is what receives it — so that one stays a `peer-` variant.
              className={`flex h-7 w-7 items-center justify-center rounded-md border-2 transition group-hover:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg3 ${
                picked ? "scale-110" : "opacity-60"
              }`}
              style={{ background: tone.bg, borderColor: picked ? tone.fg : tone.line }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.fg }} />
            </span>
            <span className="sr-only">{tone.name}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * The scenario as the standings will render it.
 *
 * A swatch answers "which color" but not "what will this look like", and the title and subtitle do
 * as much of the work as the hue. `ScenarioPill` is the very component the public standings table
 * draws, imported rather than copied, so what an admin approves here is literally what a viewer gets.
 */
function ScenarioBadge({ scenario }: { scenario: Scenario }) {
  return <ScenarioPill scenario={scenario} />;
}

// ------------------------------------------------------------------- groups

function GroupsEditor({
  groups,
  scenarios,
  teams,
  issues,
  onChange,
}: {
  groups: readonly GroupSave[];
  scenarios: Record<string, Scenario>;
  teams: readonly TeamRecord[];
  issues: readonly ValidationIssue[];
  onChange: (next: GroupSave[]) => void;
}) {
  /** A team already in another group of this phase. The save refuses a second membership. */
  const takenBy = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of groups) for (const id of g.teams) map.set(id, g.name);
    return map;
  }, [groups]);

  const update = (index: number, changes: Partial<GroupSave>): void =>
    onChange(groups.map((g, i) => (i === index ? { ...g, ...changes } : g)));

  const add = (): void =>
    onChange([
      ...groups,
      {
        id: nextId(groups.map(g => g.id)),
        // A, B, C… by count, which is what every group stage calls them.
        name: String.fromCharCode(65 + groups.length),
        ordinal: groups.length + 1,
        teams: [],
        outcomes: [],
      },
    ]);

  return (
    <section>
      <h3 className="font-heading text-xs tracking-wider uppercase text-text-secondary mb-1">
        Groups
      </h3>
      <p className="text-text-secondary text-sm mb-3">
        There is no size field — a group is as big as its membership. There is no seed either: seeding
        is what the standings compute, and a stored one would be a second, staler answer.
      </p>

      {groups.length === 0 ? (
        <p className="text-text-dim text-sm py-3">
          No groups. A group phase with none still holds matches and still ranks the conference as a
          whole.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group, index) => (
            <li
              key={group.id}
              className={`bg-bg3 border rounded-md p-3.5 ${
                issues.some(i => i.path.startsWith(`groups.${index}`))
                  ? "border-ccs-red/50"
                  : "border-border"
              }`}
            >
              <div className="flex items-end gap-2.5 mb-3">
                <div className="w-28">
                  <label className={LABEL_CLASS}>Name</label>
                  <input
                    value={group.name}
                    onChange={e => update(index, { name: e.target.value })}
                    maxLength={GROUP_NAME_MAX}
                    aria-label={`Group ${index + 1} name`}
                    className={`${CONTROL_CLASS} ${fieldError(issues, `groups.${index}.name`)}`}
                  />
                </div>
                <div className="w-24">
                  <label className={LABEL_CLASS}>Order</label>
                  <input
                    type="number"
                    min={1}
                    value={group.ordinal}
                    onChange={e => update(index, { ordinal: Math.max(1, Number(e.target.value) || 1) })}
                    aria-label={`Group ${group.name} display order`}
                    className={`${CONTROL_CLASS} ${fieldError(issues, `groups.${index}.ordinal`)}`}
                  />
                </div>
                <Pill muted>
                  {group.teams.length} {group.teams.length === 1 ? "team" : "teams"}
                </Pill>
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={() => onChange(groups.filter((_, i) => i !== index))}
                    aria-label={`Remove group ${group.name}`}
                    className={ACTION_SM_DANGER}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>

              <label className={LABEL_CLASS}>Teams</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {group.teams.map(id => {
                  const team = teams.find(t => t.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update(index, { teams: group.teams.filter(t => t !== id) })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand/50 px-2.5 py-0.5 text-xs text-text-bright hover:border-ccs-red"
                    >
                      {team ? team.code : `#${id}`}
                      <span aria-hidden="true">×</span>
                      <span className="sr-only">Remove from group {group.name}</span>
                    </button>
                  );
                })}
                {group.teams.length === 0 && (
                  <span className="text-text-dim text-xs py-0.5">Nobody yet.</span>
                )}
              </div>

              <select
                value=""
                aria-label={`Add a team to group ${group.name}`}
                onChange={e => {
                  const id = Number(e.target.value);
                  if (id) update(index, { teams: [...group.teams, id] });
                }}
                className={CONTROL_CLASS}
              >
                <option value="">+ Add a team…</option>
                {teams
                  .filter(t => !group.teams.includes(t.id))
                  .map(t => {
                    const elsewhere = takenBy.get(t.id);
                    return (
                      <option key={t.id} value={t.id} disabled={elsewhere !== undefined}>
                        {t.code} — {t.name}
                        {elsewhere !== undefined ? ` (in ${elsewhere})` : ""}
                      </option>
                    );
                  })}
              </select>

              <OutcomesEditor
                group={group}
                index={index}
                scenarios={scenarios}
                issues={issues}
                onChange={outcomes => update(index, { outcomes })}
              />
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={add} className={`${ACTION_SM} mt-3`}>
        <Plus size={13} aria-hidden="true" />
        Add group
      </button>
    </section>
  );
}

function OutcomesEditor({
  group,
  index,
  scenarios,
  issues,
  onChange,
}: {
  group: GroupSave;
  index: number;
  scenarios: Record<string, Scenario>;
  issues: readonly ValidationIssue[];
  onChange: (next: GroupSave["outcomes"]) => void;
}) {
  const keys = Object.keys(scenarios);
  const byPosition = new Map(group.outcomes.map(o => [o.position, o.scenarioKey]));

  // One row per team, which is what "finishing position" means here. Coverage is not enforced upstream
  // because N moves whenever a team joins or leaves, so an unmapped row is blank rather than an error.
  const positions = Array.from({ length: group.teams.length }, (_, i) => i + 1);
  const orphaned = group.outcomes.filter(o => !(o.scenarioKey in scenarios));
  const unmapped = positions.filter(p => !byPosition.has(p));

  const set = (position: number, key: string): void => {
    const rest = group.outcomes.filter(o => o.position !== position);
    onChange(key === "" ? rest : [...rest, { position, scenarioKey: key }].sort((a, b) => a.position - b.position));
  };

  if (keys.length === 0) {
    return (
      <p className="text-text-dim text-xs mt-3">
        Add a scenario above to map finishing positions.
      </p>
    );
  }

  return (
    <div className="mt-3.5 pt-3 border-t border-border">
      <label className={LABEL_CLASS}>Finishing positions</label>

      {positions.length === 0 ? (
        <p className="text-text-dim text-xs">Add teams to map their finishing positions.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {positions.map(position => {
            // The mapped scenario's color, on the row it colors. Orphaned mappings resolve to no tone
            // — the warning below is what those rows get, and tinting one would suggest it is fine.
            const mapped = byPosition.get(position);
            const tone =
              mapped !== undefined && mapped in scenarios
                ? toneForLevel(scenarios[mapped].level)
                : null;

            return (
              <label
                key={position}
                // The rule and tint are always drawn, transparent when unmapped: coloring in a border
                // that was not there would nudge every row sideways as the pickers get filled.
                className="flex items-center gap-2 rounded border-l-[3px] pl-2 py-1"
                style={{ borderLeftColor: tone?.line ?? "transparent", background: tone?.bg }}
              >
                <span
                  className="font-mono text-xs w-8 shrink-0"
                  style={{ color: tone?.fg ?? "var(--text-secondary)" }}
                >
                  {position}
                  {position === 1 ? "st" : position === 2 ? "nd" : position === 3 ? "rd" : "th"}
                </span>
                <select
                  value={mapped ?? ""}
                  aria-label={`Outcome for position ${position} in group ${group.name}`}
                  onChange={e => set(position, e.target.value)}
                  className={`${CONTROL_CLASS} ${fieldError(issues, `groups.${index}.outcomes`)}`}
                >
                  <option value="">— none —</option>
                  {keys.map(key => (
                    <option key={key} value={key}>
                      {/* Never the key — it is a generated id and means nothing to a reader. */}
                      {scenarios[key].title || "(untitled)"}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}

      {orphaned.length > 0 && (
        <p className="text-ccs-red text-xs mt-2">
          {orphaned.length} {orphaned.length === 1 ? "position points" : "positions point"} at a
          scenario that no longer exists. Re-pick {orphaned.length === 1 ? "it" : "them"} before saving.
        </p>
      )}
      {unmapped.length > 0 && orphaned.length === 0 && (
        <p className="text-text-dim text-xs mt-2">
          {unmapped.length} of {positions.length} unmapped. That is allowed — those rows simply show no
          outcome.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ matches

function MatchesEditor({
  phase,
  matches,
  dayDefaults,
  teamsById,
  teams,
  issues,
  onChange,
  onDayDefault,
  onShiftLater,
  onClearLater,
}: {
  phase: PhaseSummary;
  matches: readonly MatchSave[];
  dayDefaults: readonly DayDefault[];
  teamsById: ReadonlyMap<number, TeamRecord>;
  teams: readonly TeamRecord[];
  issues: readonly ValidationIssue[];
  onChange: (next: MatchSave[]) => void;
  onDayDefault: (matchDay: number, startAt: string | null) => void;
  onShiftLater: (matchDay: number, offsetMs: number) => void;
  onClearLater: (matchDay: number) => void;
}) {
  const days = Array.from({ length: phase.matchDays }, (_, i) => i + 1);

  // From the draft, not the server: a time typed into day 5 has to show on day 5 now, not after a save.
  const kickoffs = dayKickoffs(phase, dayDefaults);
  // The same phase with nothing pinned — what each day would fall back to. `DayKickoffField` measures a
  // pin against it to work out how far the rest of the phase would move.
  const unpinned = dayKickoffs(phase, []);
  const pinnedFor = (matchDay: number): string | null =>
    dayDefaults.find(d => d.matchDay === matchDay)?.startAt ?? null;

  const update = (id: number, changes: Partial<MatchSave>): void =>
    onChange(matches.map(m => (m.id === id ? { ...m, ...changes } : m)));

  const add = (matchDay: number): void => {
    const onDay = matches.filter(m => m.matchDay === matchDay);
    onChange([
      ...matches,
      {
        id: nextId(matches.map(m => m.id)),
        matchDay,
        ordinal: onDay.length + 1,
        kind: "match",
        teamAId: null,
        teamBId: null,
        scheduledAt: null,
        bestOf: null,
        streamUrl: null,
      },
    ]);
  };

  return (
    <section>
      <h3 className="font-heading text-xs tracking-wider uppercase text-text-secondary mb-1">
        Match days
      </h3>
      <p className="text-text-secondary text-sm mb-3">
        A match day is a <em>position</em>, not a date — two rounds played on a Saturday and a Sunday
        are days 1 and 2. Change the phase&apos;s length on the season page to add or remove days. Days
        run a week apart from the phase start by default, and a kickoff set here{" "}
        <span className="text-text">pins that day alone</span> — use &ldquo;shift the days after this
        one&rdquo; for a break in the season.
      </p>
      <p className="text-text-secondary text-sm mb-3">
        Fixtures can be added before the teams are known. Leave both sides on{" "}
        <span className="text-text">TBD</span> and the day, count and best-of still save; a league admin
        fills the teams in from the schedule editor once the field is settled.
      </p>

      <div className="flex flex-col gap-4">
        {days.map(matchDay => {
          const onDay = [...matches]
            .filter(m => m.matchDay === matchDay)
            .sort((a, b) => a.ordinal - b.ordinal);

          return (
            <div key={matchDay} className="bg-bg3 border border-border rounded-md p-3.5">
              {/* Add match sits in the header, not under the list. A day of eight fixtures put the
                  button a screen and a half below the one before it, so adding several meant
                  scrolling back down after every click. Up here its position never moves. */}
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-display text-base text-text-bright tracking-widest">
                  DAY {matchDay}
                </span>
                <Pill muted>Season day {seasonDayOf(phase, matchDay)}</Pill>
                {/* Only when there are some — the empty case already says so below, and a header
                    reading "No matches" over a panel reading "Nothing scheduled" says it twice. */}
                {onDay.length > 0 && (
                  <span className="text-text-dim text-xs">
                    {onDay.length} {onDay.length === 1 ? "match" : "matches"}
                  </span>
                )}
                <div className="ml-auto">
                  <button type="button" onClick={() => add(matchDay)} className={ACTION_SM}>
                    <Plus size={13} aria-hidden="true" />
                    Add match
                  </button>
                </div>
              </div>

              <div className="mt-2.5 mb-3">
                <DayKickoffField
                  matchDay={matchDay}
                  matchDays={phase.matchDays}
                  pinned={pinnedFor(matchDay)}
                  resolved={kickoffs[matchDay - 1] ?? null}
                  inherited={unpinned[matchDay - 1] ?? null}
                  onChange={startAt => onDayDefault(matchDay, startAt)}
                  onShiftLater={offsetMs => onShiftLater(matchDay, offsetMs)}
                  laterPinned={pinnedDaysAfter(phase, dayDefaults, matchDay)}
                  onClearLater={() => onClearLater(matchDay)}
                />
              </div>

              {onDay.length === 0 ? (
                <p className="text-text-dim text-xs">Nothing scheduled.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {onDay.map(match => (
                    <MatchRow
                      key={match.id}
                      match={match}
                      index={matches.findIndex(m => m.id === match.id)}
                      phase={phase}
                      teams={teams}
                      teamsById={teamsById}
                      issues={issues}
                      onChange={changes => update(match.id, changes)}
                      onRemove={() => onChange(matches.filter(m => m.id !== match.id))}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {matches.some(m => m.matchDay > phase.matchDays) && (
        <p className="text-ccs-red text-xs mt-3">
          {matches.filter(m => m.matchDay > phase.matchDays).length} match(es) sit past day{" "}
          {phase.matchDays} and are not shown. Lengthen the phase on the season page, or they
          can&apos;t be saved.
        </p>
      )}
    </section>
  );
}

function MatchRow({
  match,
  index,
  phase,
  teams,
  teamsById,
  issues,
  onChange,
  onRemove,
}: {
  match: MatchSave;
  index: number;
  phase: PhaseSummary;
  teams: readonly TeamRecord[];
  teamsById: ReadonlyMap<number, TeamRecord>;
  issues: readonly ValidationIssue[];
  onChange: (changes: Partial<MatchSave>) => void;
  onRemove: () => void;
}) {
  const path = `matches.${index}`;
  const bad =
    issues.some(i => i.path === path || i.path.startsWith(`${path}.`)) ||
    issues.some(i =>
      i.subjects?.some(s => s === match.id || s === match.teamAId || s === match.teamBId),
    );
  const isBye = match.kind === "bye";
  // Not an error, and not styled as one. An empty side is how a season's shape gets written before its
  // field is known, and the save takes it — the only thing refused is a bye holding two teams.
  const unfilled = match.teamAId === null || (!isBye && match.teamBId === null);

  const teamOptions = (exclude: number | null) => (
    <>
      <option value="">— TBD —</option>
      {teams
        .filter(t => t.id !== exclude)
        .map(t => (
          <option key={t.id} value={t.id}>
            {t.code} — {t.name}
          </option>
        ))}
    </>
  );

  return (
    <li className={`border rounded-md p-3 bg-bg2 ${bad ? "border-ccs-red/50" : "border-border"}`}>
      <div className="grid gap-2.5 sm:grid-cols-12 items-end">
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>Type</label>
          <select
            value={match.kind}
            aria-label="Match type"
            onChange={e =>
              // A bye is one team and no opponent. Clearing B on the way in stops the save being
              // refused for a shape the user did not intend to send.
              onChange(
                e.target.value === "bye"
                  ? { kind: "bye", teamBId: null }
                  : { kind: "match" },
              )
            }
            className={CONTROL_CLASS}
          >
            <option value="match">Match</option>
            <option value="bye">Bye</option>
          </select>
        </div>

        <div className="sm:col-span-3">
          <label className={LABEL_CLASS}>{isBye ? "Team" : "Team A"}</label>
          {/* No `required` and nothing disabled by an empty value: a fixture with no teams is a legal
              document, not a half-finished one. */}
          <select
            value={match.teamAId ?? ""}
            aria-label={isBye ? "Team on the bye" : "Team A"}
            onChange={e => onChange({ teamAId: e.target.value === "" ? null : Number(e.target.value) })}
            className={`${CONTROL_CLASS} ${fieldError(issues, `${path}.teamAId`)}`}
          >
            {teamOptions(match.teamBId)}
          </select>
        </div>

        <div className="sm:col-span-3">
          <label className={LABEL_CLASS}>Team B</label>
          <select
            value={match.teamBId ?? ""}
            disabled={isBye}
            aria-label="Team B"
            onChange={e => onChange({ teamBId: e.target.value === "" ? null : Number(e.target.value) })}
            className={`${CONTROL_CLASS} ${fieldError(issues, `${path}.teamBId`)}`}
          >
            {teamOptions(match.teamAId)}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>Best of</label>
          <select
            value={match.bestOf ?? ""}
            aria-label="Best of"
            onChange={e => {
              const value = Number(e.target.value);
              onChange({ bestOf: isBestOf(value) ? (value as BestOf) : null });
            }}
            className={CONTROL_CLASS}
          >
            {/* Empty means inherit. Never pre-fill the resolved value: saving it back pins it. */}
            <option value="">Inherit — Bo{phase.defaultBestOf}</option>
            {BEST_OF_VALUES.map(n => (
              <option key={n} value={n}>
                Bo{n}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove match"
            className={ACTION_SM_DANGER}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>

        <div className="sm:col-span-4">
          <label className={LABEL_CLASS}>Kickoff override</label>
          <input
            type="datetime-local"
            value={toLocalInput(match.scheduledAt)}
            aria-label="Kickoff override"
            onChange={e => onChange({ scheduledAt: fromLocalInput(e.target.value) })}
            className={`${CONTROL_CLASS} ${fieldError(issues, `${path}.scheduledAt`)}`}
          />
        </div>

        <div className="sm:col-span-6">
          <label className={LABEL_CLASS}>Stream</label>
          <input
            value={match.streamUrl ?? ""}
            maxLength={STREAM_URL_MAX}
            placeholder="https://twitch.tv/…"
            aria-label="Stream URL"
            onChange={e => onChange({ streamUrl: e.target.value === "" ? null : e.target.value })}
            className={CONTROL_CLASS}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>Order</label>
          <input
            type="number"
            min={1}
            value={match.ordinal}
            aria-label="Display order within the day"
            onChange={e => onChange({ ordinal: Math.max(1, Number(e.target.value) || 1) })}
            className={CONTROL_CLASS}
          />
        </div>
      </div>

      <p className="text-text-dim text-xs mt-2">
        {describeSides(match, isBye, teamsById)}
        {unfilled && " — a league admin can fill this in later"}
        {match.scheduledAt === null && " · inherits the day's kickoff"}
      </p>
    </li>
  );
}

/**
 * The fixture in words — who is playing, or that nobody is yet.
 *
 * A team-less fixture reads as a deliberate state rather than a blank: the shape of a season is settled
 * before its field is, so `TBD vs TBD` is what most of a group phase looks like while teams are still
 * applying. A team id with no matching row is shown as the id, which only happens if the team list failed
 * to load — dropping to an empty string there would look like an empty slot instead.
 */
function describeSides(
  match: MatchSave,
  isBye: boolean,
  teamsById: ReadonlyMap<number, TeamRecord>,
): string {
  const name = (id: number | null): string =>
    id === null ? "TBD" : (teamsById.get(id)?.name ?? `#${id}`);

  if (isBye) return match.teamAId === null ? "Bye, team TBD" : `${name(match.teamAId)} — bye`;
  return `${name(match.teamAId)} vs ${name(match.teamBId)}`;
}
