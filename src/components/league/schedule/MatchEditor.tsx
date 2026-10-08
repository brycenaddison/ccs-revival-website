/**
 * Editing one match — `PATCH /tournaments/schedule/:id`.
 *
 * The league admin's whole write surface, and it is deliberately narrow: kickoff, stream, best-of and
 * the two teams. Structure — which match days exist, a match's day or its order within one, whether it
 * is a bye, and how a bracket is wired — is site-admin only and lives in Site Admin → Season Structure.
 * Sending one of those keys here is a `400` rather than a silent no-op, so there is nothing to disable
 * defensively; the fields simply are not here.
 *
 * **PATCH semantics.** Only what moved is sent. An absent key is left alone and an explicit `null`
 * clears it, which is how a field goes back to inheriting the phase default — so "Inherit" is a real
 * option in the pickers, not the absence of one.
 *
 * Two things come from `GET /tournaments/schedule/:id` rather than being worked out here, because only
 * the server can: `inherited`, which is what this match's nulls resolve to, and `derivedSides`, the
 * bracket slots propagation owns. A derived side's picker is disabled — setting it looks like it works
 * and is overwritten by the next ingested game, which is worse than a refusal.
 */

import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { DateTimePicker } from "../../DateTimePicker";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ErrorLine } from "../../admin/adminUi";
import { IssueList, invalidAt } from "../../admin/season/issues";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import {
  BEST_OF_VALUES,
  STREAM_URL_MAX,
  SaveRejected,
  editMatch,
  errorMessage,
  isBestOf,
  type BestOf,
  type MatchEdit,
  type TeamRecord,
  type ValidationIssue,
} from "../../../lib/api";

interface Props {
  matchId: number;
  teams: readonly TeamRecord[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function MatchEditor({ matchId, teams, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const detail = useQuery(queries.matchDetail(matchId));
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  // Only the five editable fields are held, and each starts as "unchanged" rather than as a copy of the
  // current value — that is what keeps the PATCH minimal instead of rewriting fields nobody touched.
  const [edit, setEdit] = useState<MatchEdit>({});

  const save = useMutation({
    mutationFn: () => editMatch(matchId, edit),
    onSuccess: async () => {
      setIssues([]);
      setEdit({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
        qc.invalidateQueries({ queryKey: queryRoots.season }),
        // A team change moves the standings a group table is computed from.
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
      ]);
      onSaved("Match saved.");
    },
    onError: (e: unknown) => setIssues(e instanceof SaveRejected ? e.issues : []),
  });

  const dirty = Object.keys(edit).length > 0;

  if (detail.isPending) return <p className="text-text-dim text-sm p-3">Loading the match…</p>;
  if (detail.isError) {
    return <ErrorLine message={`Couldn't load the match: ${errorMessage(detail.error)}`} />;
  }
  if (detail.data === null) {
    return <p className="text-text-dim text-sm p-3">That match no longer exists.</p>;
  }

  const { match, phase, inherited, derivedSides, seasonDay } = detail.data;

  // Written out rather than `{ ...e, [key]: value }`: a computed key from a generic widens the result to
  // an index signature, which is no longer assignable to `MatchEdit`.
  const set = <K extends keyof MatchEdit>(key: K, value: MatchEdit[K]): void =>
    setEdit(e => {
      const next: MatchEdit = { ...e };
      next[key] = value;
      return next;
    });

  /**
   * What each control shows: the pending edit if the field has one, else what is stored.
   *
   * Five explicit reads rather than a generic accessor, because `undefined` here means *untouched* while
   * `null` means *cleared*, and the two must not collapse into one `??`.
   */
  const isBye = match.kind === "bye";
  const scheduledAt = edit.scheduledAt !== undefined ? edit.scheduledAt : match.scheduledAt;
  const streamUrl = edit.streamUrl !== undefined ? edit.streamUrl : match.streamUrl;
  const bestOf = edit.bestOf !== undefined ? edit.bestOf : match.bestOf;
  const teamAId = edit.teamAId !== undefined ? edit.teamAId : match.teamAId;
  const teamBId = edit.teamBId !== undefined ? edit.teamBId : match.teamBId;

  return (
    <div className="bg-bg2 border border-brand/40 rounded-md p-3.5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="font-heading text-xs text-text-secondary">
          {phase.name} · day {match.matchDay} of the phase · season day {seasonDay}
        </p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close the editor">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TeamField
          label={isBye ? "Team" : "Team A"}
          value={teamAId}
          exclude={teamBId}
          teams={teams}
          derived={derivedSides.includes("top")}
          issues={issues}
          path="teamAId"
          onChange={id => set("teamAId", id)}
        />

        {isBye ? (
          <Field aria-labelledby={`teamb-${matchId}`}>
            <FieldLabel asChild>
              <span id={`teamb-${matchId}`}>Team B</span>
            </FieldLabel>
            <p className="text-text-dim text-sm py-2">None — this is a bye.</p>
          </Field>
        ) : (
          <TeamField
            label="Team B"
            value={teamBId}
            exclude={teamAId}
            teams={teams}
            derived={derivedSides.includes("bottom")}
            issues={issues}
            path="teamBId"
            onChange={id => set("teamBId", id)}
          />
        )}

        <Field data-invalid={invalidAt(issues, "scheduledAt")}>
          <FieldLabel htmlFor={`kickoff-${matchId}`}>Kickoff</FieldLabel>
          <DateTimePicker
            id={`kickoff-${matchId}`}
            value={scheduledAt}
            onChange={value => set("scheduledAt", value)}
            placeholder="Inherits"
            suggested={inherited.scheduledAt}
            aria-invalid={invalidAt(issues, "scheduledAt")}
            aria-describedby={`kickoff-${matchId}-hint`}
          />
          <FieldDescription id={`kickoff-${matchId}-hint`}>
            {scheduledAt === null
              ? `Not set, so it inherits ${inherited.scheduledAt ? fmtKickoff(inherited.scheduledAt) : "nothing, as the phase has no kickoff set"}.`
              : "Overrides the phase default for this match only. Clear it to go back to inheriting."}
          </FieldDescription>
        </Field>

        <Field data-invalid={invalidAt(issues, "bestOf")}>
          <FieldLabel htmlFor={`bestof-${matchId}`}>Best of</FieldLabel>
          <NativeSelect
            id={`bestof-${matchId}`}
            value={bestOf ?? ""}
            aria-invalid={invalidAt(issues, "bestOf")}
            aria-describedby={`bestof-${matchId}-hint`}
            onChange={e => {
              const value = Number(e.target.value);
              set("bestOf", isBestOf(value) ? (value as BestOf) : null);
            }}
          >
            {/* The empty option is what the API means by null, and `inherited` is what it resolves to. */}
            <NativeSelectOption value="">Inherit — Bo{inherited.bestOf}</NativeSelectOption>
            {BEST_OF_VALUES.map(n => (
              <NativeSelectOption key={n} value={n}>
                Bo{n}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {/* Best-of decides when a series is won, so it can change who advances. */}
          <FieldDescription id={`bestof-${matchId}-hint`}>
            Saving updates the teams in any later match that this one feeds, straight away.
          </FieldDescription>
        </Field>

        <Field data-invalid={invalidAt(issues, "streamUrl")} className="sm:col-span-2">
          <FieldLabel htmlFor={`stream-${matchId}`}>Stream</FieldLabel>
          <Input
            id={`stream-${matchId}`}
            value={streamUrl ?? ""}
            maxLength={STREAM_URL_MAX}
            placeholder="https://twitch.tv/…"
            aria-invalid={invalidAt(issues, "streamUrl")}
            onChange={e => set("streamUrl", e.target.value === "" ? null : e.target.value)}
          />
        </Field>
      </div>

      {derivedSides.length > 0 && (
        <p className="text-text-dim text-xs mt-3">
          {derivedSides.length === 2 ? "Both teams are" : "One team is"} filled automatically, from an
          earlier match or a place in an earlier table. Contact a server admin to change how the bracket
          is wired.
        </p>
      )}

      <div className="mt-3">
        <IssueList issues={issues} />
      </div>

      <div className="flex items-center gap-3 mt-3">
        <Button type="button" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          <Check size={15} aria-hidden="true" />
          {save.isPending ? "Saving…" : "Save match"}
        </Button>
        {dirty ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEdit({});
              setIssues([]);
            }}
            disabled={save.isPending}
          >
            Discard
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

function TeamField({
  label,
  value,
  exclude,
  teams,
  derived,
  issues,
  path,
  onChange,
}: {
  label: string;
  value: number | null;
  exclude: number | null;
  teams: readonly TeamRecord[];
  derived: boolean;
  issues: readonly ValidationIssue[];
  path: string;
  onChange: (id: number | null) => void;
}) {
  const options = useMemo(() => teams.filter(t => t.id !== exclude), [teams, exclude]);
  const id = useId();

  return (
    <Field data-invalid={invalidAt(issues, path)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        value={value ?? ""}
        disabled={derived}
        aria-invalid={invalidAt(issues, path)}
        aria-describedby={derived ? `${id}-derived` : undefined}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <NativeSelectOption value="">{derived ? "— decided by results —" : "— TBD —"}</NativeSelectOption>
        {options.map(t => (
          <NativeSelectOption key={t.id} value={t.id}>
            {t.code} — {t.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {derived && (
        <FieldDescription id={`${id}-derived`}>
          Filled automatically, from an earlier match or a place in an earlier table.
        </FieldDescription>
      )}
    </Field>
  );
}
