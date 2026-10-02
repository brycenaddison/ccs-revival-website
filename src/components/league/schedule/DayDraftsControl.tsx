/**
 * Creates a Drafter room for every fixture on a day with the server's default labels and each
 * match's best-of. The server validates the whole day before the first room, so a missing or
 * overlong team name refuses everything; those rooms are created per match with explicit labels.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Swords } from "lucide-react";
import { ErrorLine } from "../../admin/adminUi";
import { DRAFT_BATCH_LABEL, draftCodeText, draftErrorText } from "../../drafts/draftLabels";
import { scheduleMatchLabel } from "./codeReports";
import { queryRoots } from "../../../lib/queries";
import { createDayDrafts, type DraftBatchOutcome, type ScheduleMatch } from "../../../lib/api";
import { Button } from "@/components/ui/button";

export function DayDraftsControl({ conf, seasonDay, matches, disabled = false }: {
  conf: string;
  seasonDay: number;
  matches: readonly ScheduleMatch[];
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const batch = useMutation({
    mutationFn: () => createDayDrafts(conf, seasonDay),
    // An ambiguous provider failure may have created a room; only an explicit click asks again.
    retry: false,
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      qc.invalidateQueries({ queryKey: queryRoots.drafts }),
    ]),
  });

  return (
    <section aria-label="Draft rooms" className="my-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline" size="sm"
          type="button"
          disabled={disabled || batch.isPending || matches.length === 0}
          onClick={() => batch.mutate()}
        >
          <Swords size={13} aria-hidden="true" />
          {batch.isPending ? "Creating draft rooms…" : "Create this day's draft rooms"}
        </Button>
        {batch.isPending && <span role="status" className="text-xs text-text-secondary">Creating rooms on Drafter…</span>}
      </div>
      <p className="mt-2 text-xs text-text-dim">
        Uses team names and each match&apos;s best-of, with the site&apos;s current draft settings. Byes are
        skipped and existing rooms are never replaced. A team without a name, or with one over 35
        characters, stops the whole day; open that match&apos;s Draft panel to create its room with your own labels.
      </p>

      <ErrorLine message={batch.isError ? draftErrorText(batch.error) : null} />

      {batch.data && !batch.isPending && !batch.isError && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <h3 className="font-heading text-sm text-text-bright">Draft room report</h3>
          {batch.data.outcomes.length === 0 && <p className="text-sm text-text-dim">No matches on this day.</p>}
          <ul className="space-y-1 text-sm">
            {batch.data.outcomes.map(outcome => (
              <li key={outcome.scheduleMatchId} className="text-text-secondary">
                <Link to={`/match/${outcome.scheduleMatchId}`} className="text-brand hover:underline">
                  {scheduleMatchLabel(matches, outcome.scheduleMatchId)}
                </Link>
                {": "}{outcomeText(outcome)}
              </li>
            ))}
          </ul>
          {batch.data.partial && (
            <p className="text-xs text-text-dim">
              Rooms created before a failure were kept. Pressing again skips them. An uncertain room may
              exist on Drafter and cannot be retried from here; a site admin must inspect it.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function outcomeText(outcome: DraftBatchOutcome): string {
  // A per-match room with custom labels conflicts with the defaults; it is not a failed creation.
  if (outcome.error === "creation_conflict" && outcome.series?.status === "ready") {
    return "Already has a room with other labels. It was left as it is.";
  }
  const status = outcome.status ? DRAFT_BATCH_LABEL[outcome.status] : "Unknown outcome";
  const detail = outcome.error ? draftCodeText(outcome.error)
    : outcome.reason === "bye" ? "Byes have no draft room."
    : outcome.reason === "throttled" ? "Not attempted because Drafter started rate limiting."
    : outcome.reason;
  const mismatch = outcome.fixtureMismatch ? " The existing room no longer matches this match." : "";
  return `${status}${detail ? `. ${detail}` : "."}${mismatch}`;
}
