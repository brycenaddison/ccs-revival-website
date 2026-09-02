/**
 * Showing why a save was refused.
 *
 * The API answers a refusal with a **list**, not a first failure — everything wrong comes back at
 * once, so fixing four mistakes is one round trip. Two fields make that useful and both are worth
 * using:
 *
 *  - **`path`** is a dotted pointer into the body that was sent (`phases.2.matchDays`,
 *    `nodes.7.top.src`). `issueAt` matches it, so a field can mark itself rather than the page
 *    showing a banner and leaving the user to find it.
 *  - **`subjects`** names the entities at fault — the node ids in a cycle, the team booked twice.
 *    `issueFor` matches on those, for a canvas where a body index is not what anyone sees.
 *
 * Nothing here is season-specific: `PATCH /tournaments/schedule/:id` refuses in the same shape, and
 * the schedule editor uses the same helpers.
 */

import { AlertTriangle } from "lucide-react";
import type { ValidationIssue } from "../../../lib/api";

/**
 * The issues whose path is exactly `path`, or nested under it.
 *
 * Prefix matching is on a **segment boundary**, so `phases.1` does not claim `phases.10`. Nested
 * matches are included because a row that owns `groups.2` wants to know about `groups.2.teams.0` too
 * — it is the thing that can scroll it into view.
 */
export function issueAt(
  issues: readonly ValidationIssue[],
  path: string,
): ValidationIssue[] {
  return issues.filter(i => i.path === path || i.path.startsWith(`${path}.`));
}

/** The issues naming any of these entities in `subjects`. */
export function issueFor(
  issues: readonly ValidationIssue[],
  ...ids: number[]
): ValidationIssue[] {
  return issues.filter(i => i.subjects?.some(s => ids.includes(s)));
}

/** Border class for a control the server complained about. Empty string when it is fine. */
export function fieldError(issues: readonly ValidationIssue[], path: string): string {
  return issueAt(issues, path).length > 0 ? "border-ccs-red" : "";
}

/**
 * The refusal, above the form.
 *
 * Shown as well as the per-field marks, not instead of them: an issue whose path points at something
 * scrolled off screen — or at a phase other than the one being looked at — would otherwise be
 * invisible, and the save would just appear not to work.
 */
export function IssueList({
  issues,
  /** Renders a path as something a person recognizes. Falls back to the raw pointer. */
  label,
}: {
  issues: readonly ValidationIssue[];
  label?: (path: string) => string | null;
}) {
  if (issues.length === 0) return null;

  return (
    <div role="alert" className="border border-ccs-red/40 rounded-md p-3.5 bg-ccs-red/5">
      <p className="flex items-center gap-2 font-heading text-xs text-ccs-red">
        <AlertTriangle size={14} aria-hidden="true" />
        {issues.length === 1 ? "Save refused" : `Save refused — ${issues.length} problems`}
      </p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {issues.map((issue, index) => {
          const named = label?.(issue.path) ?? null;
          return (
            <li key={`${issue.path}:${index}`} className="text-sm text-text">
              {named && <span className="text-text-secondary">{named}: </span>}
              {issue.message}
            </li>
          );
        })}
      </ul>
      <p className="text-text-dim text-xs mt-2.5">Nothing was saved.</p>
    </div>
  );
}
