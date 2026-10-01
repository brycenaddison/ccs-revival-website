/**
 * League Admin > Predictions > Publish: the week's fixtures as a table, pick the available ones and
 * publish them in one batch.
 *
 * Each selection sends only its `scheduleMatchId` and the preview's `expectedRevision` fingerprint.
 * If the source, rules or settings moved since the preview, the API answers
 * `publication_preview_changed`: the selection is cleared and the week reloaded so staff review what
 * changed. The batch's request ID is kept across an uncertain failure so a retry cannot publish
 * twice, and dropped on any definite answer.
 *
 * Unavailable rows show their skip reason. One with an unrecognized reason is still unavailable and
 * reads "Unavailable" rather than a raw code.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ConfirmButton } from "../../ConfirmButton";
import { ErrorLine } from "../../admin/adminUi";
import { MatchupLabel } from "../../predictions/MatchupLabel";
import { predictionPath } from "../../predictions/PredictionCard";
import { absoluteInstant } from "../../predictions/PredictionUi";
import { SKIP_REASON_LABEL } from "../../predictions/predictionLabels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ApiError,
  errorMessage,
  placementLabel,
  PREDICTION_BATCH_MAX,
  predictionErrorReason,
  publishPredictions,
  type PredictionCandidate,
  type PredictionManage,
  type PublicationSelection,
} from "../../../lib/api";
import { queryRoots } from "../../../lib/queries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

/** The count appears only near the batch limit, where it starts to matter. */
const COUNT_FROM = PREDICTION_BATCH_MAX - 10;

interface Attempt { requestId: string; weekStart: string; selections: PublicationSelection[] }

export function PublishPanel({ conf, manage, readOnly = false, onPublished }: {
  conf: string;
  manage: PredictionManage;
  /** A hidden league: the week stays visible, but nothing can be selected or published. */
  readOnly?: boolean;
  onPublished: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const available = manage.candidates.filter(candidate => candidate.available);
  const chosen = available.filter(candidate => selected.has(candidate.scheduleMatchId));
  const allChosen = available.length > 0 && chosen.length === available.length;

  const publishing = useMutation({
    mutationFn: (next: Attempt) => publishPredictions(conf, next.weekStart, next.selections, next.requestId),
    onSuccess: async (_, published) => {
      setAttempt(null);
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      onPublished(`Published ${published.selections.length} ${published.selections.length === 1 ? "match" : "matches"}.`);
    },
    onError: async error => {
      if (!(error instanceof ApiError) || error.status >= 500) return;
      setAttempt(null);
      if (predictionErrorReason(error) === "publication_preview_changed") {
        setSelected(new Set());
        setNotice("This week changed since it loaded. Review the refreshed matches before publishing.");
      }
      if (error.status === 409) await qc.invalidateQueries({ queryKey: queryRoots.predictions });
    },
  });

  const toggle = (matchId: number, on: boolean) => {
    setNotice(null);
    setSelected(current => {
      const next = new Set(current);
      if (on) next.add(matchId); else next.delete(matchId);
      return next;
    });
  };
  const toggleAll = (on: boolean) => {
    setNotice(null);
    setSelected(on ? new Set(available.map(candidate => candidate.scheduleMatchId)) : new Set());
  };
  const publish = () => {
    if (publishing.isPending) return;
    const next = attempt ?? {
      requestId: crypto.randomUUID(),
      weekStart: manage.weekStart,
      selections: chosen.map(candidate => ({ scheduleMatchId: candidate.scheduleMatchId, expectedRevision: candidate.expectedRevision! })),
    };
    if (next.selections.length === 0) return;
    setAttempt(next);
    publishing.mutate(next);
  };

  if (manage.candidates.length === 0) {
    return <p className="py-6 text-center text-sm text-text-dim">No matches this week.</p>;
  }

  const count = attempt?.selections.length ?? chosen.length;
  const overLimit = count > PREDICTION_BATCH_MAX;
  const nameOf = (candidate: PredictionCandidate) => `${candidate.teamA?.name ?? "TBD"} vs ${candidate.teamB?.name ?? "TBD"}`;
  const locked = readOnly || attempt !== null || publishing.isPending;

  return (
    <div>
      <Table containerClassName="rounded-lg border border-border" className="w-full min-w-[640px] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-10">
                <Checkbox
                  aria-label="Select all available matches"
                  checked={allChosen ? true : chosen.length > 0 ? "indeterminate" : false}
                  disabled={available.length === 0 || locked}
                  onCheckedChange={value => toggleAll(value === true)}
                />
              </TableHead>
              <TableHead scope="col" className="w-full">Match</TableHead>
              <TableHead scope="col">Placement</TableHead>
              <TableHead scope="col">Format</TableHead>
              <TableHead scope="col">Kickoff</TableHead>
              <TableHead scope="col"><span className="sr-only">Status</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {manage.candidates.map(candidate => (
              <TableRow key={candidate.scheduleMatchId}>
                <TableCell>
                  {candidate.available ? (
                    <Checkbox
                      aria-label={`Select ${nameOf(candidate)}`}
                      checked={selected.has(candidate.scheduleMatchId)}
                      disabled={locked}
                      onCheckedChange={value => toggle(candidate.scheduleMatchId, value === true)}
                    />
                  ) : <span className="text-text-dim" aria-hidden="true">–</span>}
                </TableCell>
                <TableCell className="max-w-0">
                  <MatchupLabel teamA={candidate.teamA} teamB={candidate.teamB} conf={conf} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-text-secondary">{placementLabel(candidate.phase, 0) ?? ""}</TableCell>
                <TableCell className="whitespace-nowrap text-text-secondary">{candidate.bestOf ? `Bo${candidate.bestOf}` : ""}</TableCell>
                <TableCell className="whitespace-nowrap text-text-secondary">{absoluteInstant(candidate.closesAt, manage.siteTimeZone) ?? ""}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{!candidate.available && <SkipReason candidate={candidate} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

      {!readOnly && <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {count} of {available.length} available {available.length === 1 ? "match" : "matches"} selected
          {count >= COUNT_FROM && ` · up to ${PREDICTION_BATCH_MAX} per batch`}
        </p>
        <ConfirmButton
          title={attempt ? "Retry this publication?" : `Publish ${count} ${count === 1 ? "match" : "matches"}?`}
          description={
            <>
              Predictions open for these matches until each kickoff. Matches added later need their own publication.
              <ul className="mt-2 list-disc pl-5">
                {manage.candidates
                  .filter(candidate => (attempt?.selections ?? chosen).some(row => row.scheduleMatchId === candidate.scheduleMatchId))
                  .map(candidate => <li key={candidate.scheduleMatchId}>{nameOf(candidate)}</li>)}
              </ul>
            </>
          }
          confirmLabel={attempt ? "Retry" : "Publish"}
          confirmVariant="default"
          disabled={count === 0 || overLimit || publishing.isPending}
          onConfirm={publish}
          trigger={<Button disabled={count === 0 || overLimit || publishing.isPending}>{attempt ? "Retry publishing" : `Publish ${count}`}</Button>}
        />
      </div>}
      {notice && <p role="status" className="mt-3 text-sm text-text-secondary">{notice}</p>}
      {publishing.error && !notice && <ErrorLine message={errorMessage(publishing.error)} />}
    </div>
  );
}

function SkipReason({ candidate }: { candidate: PredictionCandidate }) {
  if (candidate.reason === "already_published" && candidate.eventId !== null) {
    return <Link to={predictionPath(candidate.eventId)} className="font-heading text-[10px] text-brand no-underline hover:underline">Published</Link>;
  }
  return <Badge variant="muted">{candidate.reason ? SKIP_REASON_LABEL[candidate.reason] : "Unavailable"}</Badge>;
}
