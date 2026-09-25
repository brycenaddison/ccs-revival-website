/** Day and match delivery share one action and report; the server owns recipient selection. */
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { ACTION_SM, ErrorLine } from "../../admin/adminUi";
import { PlayerLink } from "../../profile/PlayerLink";
import { teamMembers } from "../../../lib/roster";
import {
  codeDeliveryIssues,
  errorMessage,
  sendDayCodes,
  sendMatchCodes,
  type CodeDeliveryMatch,
  type CodeDeliveryReport,
  type CodeDeliveryStatus,
  type ScheduleMatch,
  type TeamRecord,
} from "../../../lib/api";

type Target = { conf: string; seasonDay: number } | { matchId: number };

const ISSUE_TEXT: Record<string, string> = {
  missing_teams: "Both teams must be assigned before sending codes.",
  no_codes: "No confirmed, unplayed codes are available. Mint or confirm codes before sending.",
  no_recipients: "No recipients are listed. Add players, substitutes, contacts or an owner to the teams.",
  no_discord: "This player needs a saved Discord account before codes can be sent.",
};

const RECIPIENT_TEXT: Record<CodeDeliveryStatus, string> = {
  sent: "Sent",
  already_sent: "Already sent — skipped",
  failed: "Failed — retry delivery",
  storage_failed: "Not sent — delivery could not be saved; retry delivery",
  no_discord: "Not sent — no saved Discord account",
  in_progress: "In progress — reserved; ask a site admin to inspect if it stays unresolved",
  unknown: "Uncertain — may have been sent; a site admin must inspect before recovery",
};

const MATCH_TEXT: Record<CodeDeliveryMatch["status"], string> = {
  sent: "Delivery complete",
  partial: "Partially delivered",
  failed: "Delivery incomplete",
  skipped: "Skipped",
};

export function CodeDeliveryControl({
  target,
  matches,
  teams,
  disabled = false,
}: {
  target: Target;
  matches: readonly ScheduleMatch[];
  teams: readonly TeamRecord[];
  disabled?: boolean;
}) {
  const delivery = useMutation({
    mutationFn: (): Promise<CodeDeliveryReport> => "matchId" in target
      ? sendMatchCodes(target.matchId)
      : sendDayCodes(target.conf, target.seasonDay),
    // A network failure can hide a successful send; only an explicit click starts another request.
    retry: false,
  });
  const issues = codeDeliveryIssues(delivery.error);
  const people = new Map<number, string>();
  for (const team of teams) {
    for (const person of teamMembers(team)) {
      people.set(person.profileId, person.name?.trim() || "Unnamed player");
    }
  }
  const matchLabel = (id: number) => {
    const match = matches.find(match => match.id === id);
    if (!match) return "View match";
    return `${match.teamA?.name ?? "TBD"} ${match.kind === "bye" ? "— bye" : `vs ${match.teamB?.name ?? "TBD"}`}`;
  };
  const player = (id: number) => (
    <PlayerLink profileId={id} className="text-brand hover:underline">
      {people.get(id) ?? "Unnamed player"}
    </PlayerLink>
  );

  return (
    <section aria-label="Code delivery" className="my-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={ACTION_SM}
          disabled={disabled || delivery.isPending || matches.length === 0}
          onClick={() => delivery.mutate()}
        >
          <Send size={13} aria-hidden="true" />
          {delivery.isPending ? "Sending codes…" : "matchId" in target ? "Send codes via Discord" : "Send this day's codes via Discord"}
        </button>
        {delivery.isPending && <span role="status" className="text-xs text-text-secondary">Delivering Discord DMs…</span>}
      </div>
      <p className="mt-2 text-xs text-text-dim">
        Sends confirmed, unplayed codes to both teams&apos; players, substitutes, contacts and owners.
        Mint codes first. Successful deliveries are skipped when you retry the same code set.
      </p>

      {issues !== null ? (
        <div role="alert" className="mt-3 text-sm text-ccs-red">
          <p>Nothing was sent. Fix these issues, then send again:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {issues.map((issue, index) => (
              <li key={`${issue.scheduleMatchId}-${issue.profileId}-${issue.reason}-${index}`}>
                <Link to={`/match/${issue.scheduleMatchId}`} className="text-brand hover:underline">
                  {matchLabel(issue.scheduleMatchId)}
                </Link>
                {issue.profileId !== null && <> · {player(issue.profileId)}</>}
                {": "}{ISSUE_TEXT[issue.reason] ?? issue.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : <ErrorLine message={delivery.isError ? errorMessage(delivery.error) : null} />}

      {delivery.data && !delivery.isPending && !delivery.isError && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <h3 className="font-heading text-sm text-text-bright">Delivery report</h3>
          {delivery.data.matches.length === 0 && <p className="text-sm text-text-dim">No matches to deliver.</p>}
          {delivery.data.matches.map(match => (
            <details
              key={match.scheduleMatchId}
              open={match.status === "partial" || match.status === "failed"}
              className="rounded-md border border-border bg-bg2 p-3"
            >
              <summary className="cursor-pointer text-sm text-text-bright">
                {matchLabel(match.scheduleMatchId)} · {MATCH_TEXT[match.status]}
                {match.status === "skipped"
                  ? ` (${match.reason === "bye" ? "bye" : match.reason ?? "no delivery"})`
                  : ` · ${match.codeCount} ${match.codeCount === 1 ? "code" : "codes"}`}
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                {match.recipients.map(recipient => (
                  <li key={recipient.profileId}>
                    {player(recipient.profileId)} · {RECIPIENT_TEXT[recipient.status]}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <p className="text-xs text-text-dim">
            Send again to retry failed deliveries. Uncertain or reserved deliveries need inspection by
            a site admin; retrying does not resend them. Changing the confirmed codes allows a new delivery.
          </p>
        </div>
      )}
    </section>
  );
}
