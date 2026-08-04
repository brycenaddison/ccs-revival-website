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

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ACTION, ACTION_PRIMARY, ErrorLine } from "../../admin/adminUi";
import { IssueList, fieldError } from "../../admin/season/issues";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff, fromLocalInput, toLocalInput } from "../../../lib/utils";
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
    <div className="bg-bg2 border border-accent/40 rounded-md p-3.5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="font-heading text-xs tracking-wider uppercase text-text-secondary">
          {phase.name} · day {match.matchDay} of the phase · season day {seasonDay}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the editor"
          className="text-text-dim hover:text-text-bright cursor-pointer"
        >
          <X size={16} aria-hidden="true" />
        </button>
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
          <div>
            <label className={LABEL_CLASS}>Team B</label>
            <p className="text-text-dim text-sm py-2">None — this is a bye.</p>
          </div>
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

        <div>
          <label className={LABEL_CLASS} htmlFor={`kickoff-${matchId}`}>
            Kickoff
          </label>
          <input
            id={`kickoff-${matchId}`}
            type="datetime-local"
            value={toLocalInput(scheduledAt)}
            onChange={e => set("scheduledAt", fromLocalInput(e.target.value))}
            className={`${CONTROL_CLASS} ${fieldError(issues, "scheduledAt")}`}
          />
          <p className="text-text-dim text-xs mt-1.5">
            {scheduledAt === null
              ? `Empty — inherits ${inherited.scheduledAt ? fmtKickoff(inherited.scheduledAt) : "nothing, as the phase has no kickoff set"}.`
              : "Overrides the phase default for this match only. Clear the field to go back to inheriting."}
          </p>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor={`bestof-${matchId}`}>
            Best of
          </label>
          <select
            id={`bestof-${matchId}`}
            value={bestOf ?? ""}
            onChange={e => {
              const value = Number(e.target.value);
              set("bestOf", isBestOf(value) ? (value as BestOf) : null);
            }}
            className={`${CONTROL_CLASS} ${fieldError(issues, "bestOf")}`}
          >
            {/* The empty option is what the API means by null, and `inherited` is what it resolves to. */}
            <option value="">Inherit — Bo{inherited.bestOf}</option>
            {BEST_OF_VALUES.map(n => (
              <option key={n} value={n}>
                Bo{n}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor={`stream-${matchId}`}>
            Stream
          </label>
          <input
            id={`stream-${matchId}`}
            value={streamUrl ?? ""}
            maxLength={STREAM_URL_MAX}
            placeholder="https://twitch.tv/…"
            onChange={e => set("streamUrl", e.target.value === "" ? null : e.target.value)}
            className={`${CONTROL_CLASS} ${fieldError(issues, "streamUrl")}`}
          />
        </div>
      </div>

      {derivedSides.length > 0 && (
        <p className="text-text-dim text-xs mt-3">
          {derivedSides.length === 2 ? "Both teams arrive" : "One team arrives"} from an earlier bracket
          match and {derivedSides.length === 2 ? "fill" : "fills"} in automatically once it is decided.
          Contact a server admin to change how the bracket is wired.
        </p>
      )}

      <div className="mt-3">
        <IssueList issues={issues} />
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className={ACTION_PRIMARY}
        >
          <Check size={15} aria-hidden="true" />
          {save.isPending ? "Saving…" : "Save match"}
        </button>
        {dirty ? (
          <button
            type="button"
            onClick={() => {
              setEdit({});
              setIssues([]);
            }}
            disabled={save.isPending}
            className={ACTION}
          >
            Discard
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

  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <select
        value={value ?? ""}
        disabled={derived}
        aria-label={label}
        title={
          derived
            ? "This team arrives from an earlier bracket match and fills in automatically once it is decided."
            : undefined
        }
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`${CONTROL_CLASS} ${fieldError(issues, path)}`}
      >
        <option value="">{derived ? "— decided by results —" : "— TBD —"}</option>
        {options.map(t => (
          <option key={t.id} value={t.id}>
            {t.code} — {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
