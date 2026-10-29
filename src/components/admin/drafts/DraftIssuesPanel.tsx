/**
 * The draft repair inbox: saved Drafter deliveries that did not process, and room creations that
 * failed or could not be confirmed. The two lists page independently.
 *
 * Deliveries include `retry`, `unmatched`, `unsupported` and `review` receipts, and `processing`
 * receipts stranded by an expired lease; all take the same Reprocess. Reprocessing replays the saved
 * payload after a mapping or correlation repair; nothing here can substitute a payload. A `review`
 * receipt carries a draft this site cannot store, so it also links to its game's editor (webhook) or
 * its match's game list (fetch); saving a correction resolves it and it leaves this list. A receipt
 * that names no registered fixture has no such link.
 *
 * Creations have no action because room replacement is not part of the API: an uncertain attempt is
 * matched against Drafter's own history using its attempt ID.
 */
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ErrorLine } from "../adminUi";
import { CursorPager } from "../../CursorPager";
import { DRAFT_RECEIPT_LABEL, DRAFT_STATUS_LABEL, draftCodeText, draftErrorText } from "../../drafts/draftLabels";
import { useCursorPage } from "../../../hooks/useCursorPage";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import { draftCorrectionPath, draftFixturePath } from "./draftCorrectionLink";
import {
  draftRefusal,
  reprocessDraftReceipt,
  type DraftReceiptIssue,
  type DraftReceiptState,
  type DraftRepair,
} from "../../../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DraftIssuesPanel({ viewerId }: { viewerId: number | null }) {
  const qc = useQueryClient();
  const receiptPages = useCursorPage();
  const creationPages = useCursorPage();
  const issues = useQuery(queries.draftIssues(viewerId, {
    cursor: receiptPages.cursor,
    creationCursor: creationPages.cursor,
  }));
  const reprocess = useMutation({
    mutationFn: (receiptId: string) => reprocessDraftReceipt(receiptId),
    onSuccess: async result => {
      // A processed receipt can write games shown in a fixture's schedule panel.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.drafts }),
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      ]);
      toast.success(describeRepair(result));
    },
    onError: async error => {
      // Someone else's correction resolved it; reload so the row leaves the list.
      if (draftRefusal(error)?.category === "receipt_resolved") await qc.invalidateQueries({ queryKey: queryRoots.drafts });
    },
  });

  if (issues.isPending) return <p role="status" className="text-sm text-text-dim">Loading draft issues…</p>;
  if (issues.isError) return <ErrorLine message={draftErrorText(issues.error)} />;
  const { receipts, creations, nextCursor, nextCreationCursor } = issues.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h4 className="mb-1 font-heading text-sm text-text-secondary">Deliveries</h4>
        <p className="mb-2 text-xs text-text-dim">
          Saved Drafter deliveries and fetches that did not process. Repair the mapping first, then reprocess. A
          delivery in review carries a draft this site cannot store; correct its game instead.
        </p>
        {receipts.length === 0 ? (
          <p className="text-sm text-text-dim">No unresolved deliveries.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="w-full">Delivery</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map(receipt => (
                <TableRow key={receipt.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtKickoff(receipt.receivedAt)}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{receipt.state ? DRAFT_RECEIPT_LABEL[receipt.state] : "Unknown"}</Badge>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <div className="truncate text-sm text-text-bright">
                      {[receipt.source === "fetch" ? "Fetch" : receipt.source === "webhook" ? "Webhook" : null, receipt.event]
                        .filter(Boolean).join(" · ") || "Delivery"}
                      {receipt.gameNumber !== null && ` · Game ${receipt.gameNumber}`}
                    </div>
                    {receipt.errorCategory && (
                      <div className="truncate text-xs text-ccs-red">{draftCodeText(receipt.errorCategory)}</div>
                    )}
                    {receipt.state && RECEIPT_NEXT_STEP[receipt.state] && (
                      <div className="truncate text-xs text-text-secondary">{RECEIPT_NEXT_STEP[receipt.state]}</div>
                    )}
                    <div className="truncate font-mono text-[11px] text-text-dim">
                      {receipt.conf && <span className="font-heading">{receipt.conf} · </span>}
                      {receipt.providerSeriesId ?? "No series"} · {receipt.id}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{receipt.attempts}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <RepairLink receipt={receipt} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={reprocess.isPending}
                        onClick={() => reprocess.mutate(receipt.id)}
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                        {reprocess.isPending && reprocess.variables === receipt.id ? "Reprocessing…" : "Reprocess"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <ErrorLine message={reprocess.isError ? draftErrorText(reprocess.error) : null} />
        <CursorPager pages={receiptPages} nextCursor={nextCursor} />
      </div>

      <div>
        <h4 className="mb-1 font-heading text-sm text-text-secondary">Room creations</h4>
        <p className="mb-2 text-xs text-text-dim">
          Failed or unconfirmed rooms. They cannot be replaced from the site. For an uncertain room, look up
          its attempt ID in Drafter&apos;s history before doing anything else.
        </p>
        {creations.length === 0 ? (
          <p className="text-sm text-text-dim">No unresolved room creations.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-full">Room</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creations.map(series => (
                <TableRow key={series.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtKickoff(series.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{series.status ? DRAFT_STATUS_LABEL[series.status] : "Unknown"}</Badge>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <div className="truncate text-sm text-text-bright">
                      {series.scheduleMatchId !== null ? (
                        <Link to={`/match/${series.scheduleMatchId}`} className="text-brand hover:underline">
                          {series.team1Name} vs {series.team2Name}
                        </Link>
                      ) : `${series.team1Name} vs ${series.team2Name} (match deleted)`}
                      <span className="text-text-dim"> · {series.conf}</span>
                    </div>
                    {series.failureCategory && (
                      <div className="truncate text-xs text-ccs-red">{draftCodeText(series.failureCategory)}</div>
                    )}
                    <div className="truncate font-mono text-[11px] text-text-dim">
                      Attempt {series.attemptId ?? "unknown"}
                      {series.drafterSeriesId && ` · Drafter ${series.drafterSeriesId}`}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <CursorPager pages={creationPages} nextCursor={nextCreationCursor} />
      </div>
    </div>
  );
}

/**
 * What to do about a listed receipt. Nothing retries on a timer: a failed receipt waits for an
 * admin, and a `processing` receipt in this list is one whose lease expired when a worker stopped.
 */
const RECEIPT_NEXT_STEP: Partial<Record<DraftReceiptState, string>> = {
  retry: "Failed on our side. Reprocess it, or recheck the match's room.",
  processing: "Interrupted while processing. Reprocess it.",
  review: "Drafter sent a draft this site cannot store. Correct the game; reprocessing fails the same way unless the mapping changed.",
};

/**
 * Where to correct a `review` receipt. A webhook names one game of the Drafter series it carries; a
 * fetch can carry several, so it opens the match's game list.
 */
function RepairLink({ receipt }: { receipt: DraftReceiptIssue }) {
  if (receipt.state !== "review") return null;
  const to = receipt.source === "webhook" && receipt.providerSeriesId && receipt.gameNumber !== null
    ? draftCorrectionPath({ drafterSeriesId: receipt.providerSeriesId, game: receipt.gameNumber }, receipt.scheduleMatchId)
    : receipt.source === "fetch" && receipt.scheduleMatchId !== null
      ? draftFixturePath(receipt.scheduleMatchId)
      : null;
  if (!to) return null;
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to}>{receipt.source === "webhook" ? "Correct game" : "Open match games"}</Link>
    </Button>
  );
}

function describeRepair(result: DraftRepair): string {
  if (result.state !== "processed") {
    return `Receipt requeued. It is now ${result.state ? DRAFT_RECEIPT_LABEL[result.state].toLowerCase() : "waiting"}.`;
  }
  const counts = result.outcome;
  return counts
    ? `Receipt processed: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged.`
    : "Receipt processed.";
}
