/**
 * One of the caller's own team applications, in whatever state it is in.
 *
 * Editable only while it is a `draft` or `rejected` — the two states upstream's `getOwnedDraft`
 * accepts. A rejected application is deliberately not a dead end: saving it clears the previous
 * decision and returns it to `draft`, which is why the card labels that state "Changes needed" and
 * keeps the form open.
 *
 * The readiness checklist below duplicates the server's `publicationIssues`. That is a deliberate
 * exception to not re-deriving server logic, and a narrow one: it is form guidance computed from the
 * members this card already has, it decides nothing, and the `409` from Submit remains the only
 * authority. The alternative is a Submit button that fails with a list of surprises.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, RefreshCw, Send, Trash2, UserPlus, X } from "lucide-react";
import {
  ACTION,
  ACTION_DANGER,
  ACTION_PRIMARY,
  ACTION_SM,
  ACTION_SM_DANGER,
  ErrorLine,
} from "../admin/adminUi";
import { LABEL_CLASS } from "../stats/FilterBar";
import { PlayerLink } from "../profile/PlayerLink";
import { ConfirmButton } from "../ConfirmButton";
import { ApplicationForm } from "./ApplicationForm";
import { InviteMember } from "./InviteMember";
import {
  ApplicationDetailsBlock,
  ApplicationStatusPill,
  ApplicationTeamHeader,
  InvitationStatusPill,
  isPlaying,
  MemberAvatar,
  memberLabel,
  RankChip,
  roleSummary,
  STARTER_ROLES,
  ROLE_LABEL,
} from "./applyUi";
import { queryRoots } from "../../lib/queries";
import { fmtKickoff } from "../../lib/utils";
import {
  errorMessage,
  readApplicationDetails,
  refreshApplicationAccounts,
  refusalOf,
  revokeInvitation,
  submitApplication,
  withdrawApplication,
  type ApplicationDetails,
  type ApplicationMember,
  type TeamApplication,
} from "../../lib/api";

/** Whether the applicant may still change this application. Mirrors upstream's `getOwnedDraft`. */
const EDITABLE = new Set(["draft", "rejected"]);

interface Props {
  application: TeamApplication;
  /** The signed-in profile, so the card knows whether it is the applicant's copy or a member's. */
  myProfileId: number | null;
  onSaved: (message: string) => void;
}

export function ApplicationCard({ application, myProfileId, onSaved }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  // One panel, two jobs: `true` invites somebody new, a member edits that member's roles. Owned here
  // rather than in `RosterList` so opening a row's editor closes the invite form and vice versa —
  // two open at once would be two forms racing the same upsert.
  const [inviting, setInviting] = useState<true | ApplicationMember | null>(null);

  const conf = application.conf;
  const owned = myProfileId !== null && application.submittedByProfileId === myProfileId;
  const editable = owned && EDITABLE.has(application.status);
  // Somebody the captain removed is gone from this page. Upstream keeps serving them, since a
  // reviewer reads invitation history, but on the applicant's own roster a "Removed" row is clutter
  // that outlives every refresh, and re-inviting the person is an upsert that works whether or not
  // the old row is on screen. Declined people stay: that is an answer the captain needs to see.
  const members = (application.members ?? []).filter(m => m.status !== "revoked");

  const submit = useMutation({
    mutationFn: () => submitApplication(conf, application.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      onSaved(`${application.teamName} is with the league staff now.`);
    },
  });

  const withdraw = useMutation({
    mutationFn: () => withdrawApplication(conf, application.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      onSaved(`Withdrew ${application.teamName}.`);
    },
  });

  // Answers the whole application, so the list this card renders is replaced wholesale rather than
  // patched member by member.
  const refresh = useMutation({
    mutationFn: () => refreshApplicationAccounts(conf, application.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      onSaved("Ranks updated.");
    },
  });

  const details = readApplicationDetails(application.applicationMetadata);
  const blockers = readinessBlockers(members, details);
  const submitRefusal = submit.isError ? refusalOf(submit.error) : null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg2">
      {/* The team as the site will draw it, colors included: the header *is* the color preview. */}
      <ApplicationTeamHeader team={application} />

      <div className="p-5">
        <StatusNote application={application} owned={owned} />

        {/* Hidden while the form is open, since the form is showing the same answers as inputs. */}
        {!editing && <ApplicationDetailsBlock details={details} />}

        {editable && (
          <div className="mt-5">
            {editing ? (
              <ApplicationForm
                conf={conf}
                application={application}
                onDone={message => {
                  setEditing(false);
                  onSaved(message);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <button type="button" onClick={() => setEditing(true)} className={ACTION}>
                <Pencil size={15} aria-hidden="true" />
                Edit team details
              </button>
            )}
          </div>
        )}

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-sm uppercase tracking-wider text-text-bright">Roster</h3>
            <div className="flex flex-wrap items-center gap-2">
              {/* Ranks come from a cache upstream, never a live lookup, so somebody who linked an
                account a minute ago sees "Rank pending" until this is pressed. */}
              <button
                type="button"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className={ACTION}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {refresh.isPending ? "Checking…" : "Refresh ranks"}
              </button>
              {editable && inviting === null && (
                <button type="button" onClick={() => setInviting(true)} className={ACTION}>
                  <UserPlus size={15} aria-hidden="true" />
                  Invite a player
                </button>
              )}
            </div>
          </div>
          <ErrorLine message={refresh.isError ? errorMessage(refresh.error) : null} />

          {application.members === undefined ? (
            <p className="mt-2 text-sm text-text-dim">
              This deployment isn't serving the roster yet.
            </p>
          ) : (
            <RosterList
              conf={conf}
              applicationId={application.id}
              members={members}
              editable={editable}
              myProfileId={myProfileId}
              onEdit={setInviting}
              onSaved={onSaved}
            />
          )}

          {inviting !== null && (
            <div className="mt-3">
              <InviteMember
                // Keyed on the target so switching from one member's editor to another's resets the
                // role picker to that member rather than carrying the previous selection across.
                key={inviting === true ? "new" : inviting.id}
                conf={conf}
                applicationId={application.id}
                members={members}
                editing={inviting === true ? undefined : inviting}
                onDone={message => {
                  setInviting(null);
                  onSaved(message);
                }}
                onCancel={() => setInviting(null)}
              />
            </div>
          )}
        </div>

        {editable && (
          <div className="mt-6 border-t border-border pt-4">
            {blockers.length > 0 && (
              <div className="mb-3">
                <span className={LABEL_CLASS}>Before you can submit</span>
                <ul className="flex flex-col gap-1">
                  {blockers.map(blocker => (
                    <li key={blocker} className="flex items-start gap-2 text-sm text-text-secondary">
                      <X size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ccs-orange" />
                      {blocker}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {blockers.length === 0 && (
              <p className="mb-3 flex items-center gap-2 text-sm text-ccs-green">
                <Check size={15} aria-hidden="true" />
                Your roster is complete.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submit.isPending || blockers.length > 0}
                onClick={() => submit.mutate()}
                className={ACTION_PRIMARY}
              >
                <Send size={15} aria-hidden="true" />
                {submit.isPending ? "Submitting…" : "Submit for review"}
              </button>
              <ConfirmButton
                title={`Withdraw ${application.teamName}?`}
                description="This deletes the application. There's no reopening it, so getting back in means starting a new one from scratch, and everyone you invited would have to be invited again."
                confirmLabel="Withdraw"
                onConfirm={() => withdraw.mutate()}
                disabled={withdraw.isPending}
                trigger={
                  <button type="button" className={ACTION_DANGER}>
                    <Trash2 size={15} aria-hidden="true" />
                    Withdraw
                  </button>
                }
              />
            </div>

            {submitRefusal && (
              <div role="alert" className="mt-3">
                <p className="text-sm text-ccs-red">{submitRefusal.message}</p>
                {submitRefusal.issues.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-5 text-xs text-ccs-red">
                    {submitRefusal.issues.map(issue => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {submit.isError && !submitRefusal && <ErrorLine message={errorMessage(submit.error)} />}
            <ErrorLine message={withdraw.isError ? errorMessage(withdraw.error) : null} />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The status pill and what that state means for the person reading it, and what to do about it.
 * The pill sits here rather than in the header because the header is now the team's own colors, and
 * a status chip on a gradient is a chip nobody can read.
 */
function StatusNote({ application, owned }: { application: TeamApplication; owned: boolean }) {
  const note = (() => {
    if (!owned) {
      return `${application.submittedBy?.name ?? "Someone else"} runs this application. You're on the roster.`;
    }
    switch (application.status) {
      case "draft":
        return "This is still a draft. Fill in the roster, then submit it for review once players accept and verify their account.";
      case "submitted":
        return "League staff are reviewing it. You can't change it while they have it.";
      case "approved":
        return "Approved. Welcome to the CCS.";
      case "rejected":
        return "Staff sent it back. Fix what they asked for and submit it again; saving any change reopens it as a draft.";
      case "published":
        return "Your team is in the league.";
    }
  })();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <ApplicationStatusPill status={application.status} />
        <p className="text-sm text-text-secondary">{note}</p>
      </div>
      {application.decisionMessage && (
        <div className="mt-2 rounded-md border border-border bg-bg3 p-3">
          <span className={LABEL_CLASS}>From the league staff</span>
          <p className="whitespace-pre-wrap text-sm text-text">{application.decisionMessage}</p>
          {application.reviewedAt && (
            <p className="mt-1 text-xs text-text-dim">{fmtKickoff(application.reviewedAt)}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface RosterProps {
  conf: string;
  applicationId: number;
  members: readonly ApplicationMember[];
  editable: boolean;
  myProfileId: number | null;
  /** Opens the role editor for one member — the panel above owns which one is open. */
  onEdit: (member: ApplicationMember) => void;
  onSaved: (message: string) => void;
}

/**
 * Everyone still on the application, answered and unanswered alike.
 *
 * Declined people stay in the list rather than disappearing: a captain needs to see that somebody
 * said no rather than wondering whether the invitation ever sent. Revoked people do not reach this
 * list at all; the card above filters them out, and the comment there says why.
 */
function RosterList({ conf, applicationId, members, editable, myProfileId, onEdit, onSaved }: RosterProps) {
  const qc = useQueryClient();

  const revoke = useMutation({
    mutationFn: (memberId: number) => revokeInvitation(conf, applicationId, memberId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      onSaved("Removed from the roster.");
    },
  });

  if (members.length === 0) {
    return <p className="mt-2 text-sm text-text-dim">Nobody invited yet.</p>;
  }

  return (
    <>
      <ul className="mt-3 flex flex-col">
        {members.map(member => (
          <li
            key={member.id}
            className="flex flex-wrap items-center gap-2.5 border-b border-border py-2.5 last:border-b-0"
          >
            <MemberAvatar member={member} />
            <PlayerLink profileId={member.profileId} className="text-brand no-underline">
              {memberLabel(member)}
            </PlayerLink>
            {member.profileId === myProfileId && (
              <span className="text-[10px] uppercase tracking-wider text-text-dim">you</span>
            )}
            <span className="text-xs text-text-secondary">{roleSummary(member.roles)}</span>
            <InvitationStatusPill status={member.status} perspective="captain" />
            {/* Only for the lineup. An owner or contact who does not play has no account
                requirement, so a chip on their row would read as a demand nobody is making. */}
            {isPlaying(member.roles) && <RankChip riot={member.riot} />}
            {member.status === "pending" && member.dmStatus === "failed" && (
              <span
                className="text-xs text-ccs-orange"
                title="Their Discord DMs are probably closed. The invitation is still waiting for them on the site."
              >
                DM failed
              </span>
            )}
            {/* Both actions include your own row. A captain invites themselves like anybody else, so
                there is no reason theirs should be the one nobody can fix. */}
            {editable && (
              <span className="ml-auto flex gap-2">
                <button type="button" onClick={() => onEdit(member)} className={ACTION_SM}>
                  <Pencil size={13} aria-hidden="true" />
                  Roles
                </button>
                <ConfirmButton
                  title={`Remove ${memberLabel(member)}?`}
                  description={
                    member.status === "accepted"
                      ? "They've already accepted, so they'll be taken off the roster and told about it on Discord. You can invite them again afterwards."
                      : "Their invitation is canceled. You can invite them again afterwards."
                  }
                  confirmLabel="Remove"
                  onConfirm={() => revoke.mutate(member.id)}
                  disabled={revoke.isPending}
                  trigger={
                    <button type="button" className={ACTION_SM_DANGER}>
                      <X size={13} aria-hidden="true" />
                      Remove
                    </button>
                  }
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine message={revoke.isError ? errorMessage(revoke.error) : null} />
    </>
  );
}

/**
 * What still stands between this roster and a submission.
 *
 * The wording is the applicant's, not the server's: upstream says "exactly one accepted sup is
 * required", which is accurate and unreadable. Otherwise these are `publicationIssues`' rules, and
 * the server still has the final word.
 *
 * **One deliberate divergence: no owner blocker.** The `owner` role is optional here — see the
 * comment beside the contact check — while `publicationIssues` still requires exactly one until the
 * server change lands. Until then a team with no owner clears this list and Submit answers `409`,
 * which the card renders verbatim with its issue list; that is the interim, not a mistake to repair
 * by putting the blocker back.
 */
function readinessBlockers(
  members: readonly ApplicationMember[],
  details: ApplicationDetails,
): string[] {
  const blockers: string[] = [];

  // First, because these are the ones the applicant can clear on their own without waiting for anybody.
  if (!details.rulesAcknowledged) {
    blockers.push("Confirm you've read the league rules. The check box is under \"Edit team details\".");
  }
  if (!details.ticketOpened) {
    blockers.push(
      "Open a team apps ticket in #ticket-questions on Discord, then confirm it by checking the box under \"Edit team details\".",
    );
  }
  const accepted = members.filter(m => m.status === "accepted");
  const holds = (role: string) =>
    accepted.filter(m => m.roles.some(assignment => assignment.role === role));

  const waiting = members.filter(m => m.status === "pending");
  if (waiting.length > 0) {
    blockers.push(
      waiting.length === 1
        ? `${memberLabel(waiting[0])} hasn't answered yet — wait for them, or remove them.`
        : `${waiting.length} people haven't answered yet. Wait for them, or remove them.`,
    );
  }

  // No owner blocker. `owner` is a label the league records, not a requirement and not authority:
  // control of an application follows whoever created it, so a team that names nobody its owner is
  // a complete team. The contact requirement stays — the league has to have somebody to write to,
  // and it is **two**, because one contact is one point of failure for a whole season of messages.
  const contacts = holds("contact").length;
  if (contacts === 0) blockers.push("The team needs two points of contact.");
  else if (contacts === 1) blockers.push("Name a second point of contact.");

  const missing = STARTER_ROLES.filter(role => holds(role).length === 0);
  if (missing.length > 0) {
    blockers.push(
      `Still need a confirmed ${missing.map(role => ROLE_LABEL[role].toLowerCase()).join(", ")}.`,
    );
  }
  for (const role of STARTER_ROLES) {
    if (holds(role).length > 1) {
      blockers.push(`Two people are down as ${ROLE_LABEL[role].toLowerCase()}.`);
    }
  }

  if (holds("sub").length > 5) blockers.push("Five substitutes at most.");

  // Everyone in the lineup — starters and bench — needs a Riot account they have proved they own.
  // Named per person, because the fix is per person: whoever it is has to go and link theirs.
  // A contact or owner who does not play is exempt.
  const unlinked = accepted.filter(m => isPlaying(m.roles) && m.riot.verifiedAccounts === 0);
  if (unlinked.length > 0) {
    blockers.push(
      `${unlinked.map(memberLabel).join(", ")} ${unlinked.length === 1 ? "needs" : "need"
      } a linked Riot account. They can add one under Settings → Connections.`,
    );
  }

  return blockers;
}
