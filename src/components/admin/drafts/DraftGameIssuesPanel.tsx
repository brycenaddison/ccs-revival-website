/**
 * Played games whose draft is wrong or missing, computed on read. A champion mismatch excludes the
 * game's draft from every statistic until it is corrected; a missing draft is a played game on a
 * drafted match with no draft for its number. Each row opens the correction editor. Wrong bans, pick
 * order, first pick or roles never appear here; those drafts are opened from the staff schedule or
 * the game page instead (see `draftCorrectionLink.ts`).
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ErrorLine } from "../adminUi";
import { CursorPager } from "../../CursorPager";
import { DRAFT_GAME_ISSUE_LABEL, draftErrorText } from "../../drafts/draftLabels";
import { DraftDifference } from "./DraftDifference";
import type { DraftGameRef } from "./draftCorrectionLink";
import { useCursorPage } from "../../../hooks/useCursorPage";
import { queries } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import type { DraftGameIssue } from "../../../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DraftGameIssuesPanel({ viewerId, onCorrect }: {
  viewerId: number | null;
  onCorrect: (ref: DraftGameRef) => void;
}) {
  const pages = useCursorPage();
  const issues = useQuery(queries.draftGameIssues(viewerId, pages.cursor));

  if (issues.isPending) return <p role="status" className="text-sm text-text-dim">Loading game issues…</p>;
  if (issues.isError) return <ErrorLine message={draftErrorText(issues.error)} />;
  const { issues: rows, nextCursor } = issues.data;

  return (
    <div>
      <p className="mb-2 text-xs text-text-dim">
        Games whose champions differ from their draft, or that have no draft. Corrected games count in statistics
        on the next refresh, about 30 seconds after saving.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-text-dim">No game issues.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {rows.map(issue => (
            <IssueRow key={`${issue.kind}-${issue.matchId}`} issue={issue} onCorrect={onCorrect} />
          ))}
        </ul>
      )}
      <CursorPager pages={pages} nextCursor={nextCursor} />
    </div>
  );
}

function IssueRow({ issue, onCorrect }: { issue: DraftGameIssue; onCorrect: (ref: DraftGameRef) => void }) {
  const label = issue.kind ? DRAFT_GAME_ISSUE_LABEL[issue.kind] : null;
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={issue.kind === "champion_mismatch" ? "destructive" : "muted"}>{label?.label ?? issue.kind ?? "Unknown"}</Badge>
          {issue.correctedAt && <Badge variant="muted">Corrected {fmtKickoff(issue.correctedAt)}, still differs</Badge>}
          <span className="text-sm text-text-bright">
            {issue.scheduleMatchId !== null ? (
              <Link to={`/match/${issue.scheduleMatchId}`} className="text-brand hover:underline">Game {issue.game}</Link>
            ) : `Game ${issue.game}`}
            {issue.conf && <span className="text-text-dim"> · {issue.conf}</span>}
          </span>
          <Link to={`/game/${encodeURIComponent(issue.matchId)}`} className="font-mono text-[11px] text-text-dim hover:text-brand">
            {issue.matchId}
          </Link>
        </div>
        {label && <p className="text-xs text-text-dim">{label.detail}</p>}
        <DraftDifference difference={issue.difference} conf={issue.conf} />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => onCorrect({ drafterSeriesId: issue.drafterSeriesId, game: issue.game })}
      >
        Correct draft
      </Button>
    </li>
  );
}
