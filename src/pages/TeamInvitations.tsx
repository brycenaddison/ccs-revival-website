/**
 * Team invitations — `/team-invitations`.
 *
 * **The path is not a choice.** The bot's invitation DM links here literally
 * (`FRONTEND_URL + "/team-invitations"` in `tournament-bot/src/utils/teamInvitationDiscord.ts`), so
 * renaming it sends every invitation notification to the SPA's catch-all 404.
 *
 * **This page is the authority, not the DM.** The invitation is committed before Discord is
 * attempted, so a recipient with DMs closed gets no message and still has a live invitation here —
 * which is exactly why it has to exist rather than being answered by reacting to a bot message.
 *
 * Answered invitations stay in the list. A player who declined wants to see that they did, and a
 * revoked row is how they find out they were taken off a roster.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { ACTION_SM, ACTION_SM_PRIMARY, ErrorLine } from "../components/admin/adminUi";
import { LABEL_CLASS } from "../components/stats/FilterBar";
import { PlayerLink } from "../components/profile/PlayerLink";
import { Toast } from "../components/Toast";
import {
  ApplicationStatusPill,
  InvitationStatusPill,
  roleSummary,
} from "../components/apply/applyUi";
import { queries, queryRoots } from "../lib/queries";
import { fmtKickoff } from "../lib/utils";
import {
  errorMessage,
  hexFromInt,
  respondToInvitation,
  type TeamInvitation,
} from "../lib/api";

export default function TeamInvitations() {
  return (
    <PageShell maxWidth={760}>
      <h1 className="mb-1 font-display text-[30px] tracking-widest text-text-bright">
        TEAM INVITATIONS
      </h1>
      <p className="mb-6 text-sm text-text-secondary">
        Teams that have asked you to play for them.
      </p>
      <RequireAuth>
        <Inbox />
      </RequireAuth>
    </PageShell>
  );
}

function Inbox() {
  const [saved, setSaved] = useState<string | null>(null);
  const { data, isPending, error } = useQuery(queries.myInvitations());
  const invitations = data ?? [];

  if (isPending) return <p className="text-text-dim">Loading your invitations…</p>;
  if (error) {
    return <ErrorLine message={`Couldn't load your invitations: ${errorMessage(error)}`} />;
  }

  // Pending first — those are the only ones asking for something — then the rest in the order
  // served, which is newest-invited first.
  const waiting = invitations.filter(i => i.status === "pending");
  const answered = invitations.filter(i => i.status !== "pending");

  if (invitations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg2 p-6">
        <h2 className="font-display text-[20px] tracking-widest text-text-bright">
          NOTHING WAITING
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          No team has invited you yet. A captain has to find you in the CCS Discord to send one — so
          make sure you're in the server. You can also{" "}
          <Link to="/register" className="text-accent no-underline">
            start a team of your own
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {waiting.length > 0 && (
        <section>
          <span className={LABEL_CLASS}>Waiting on you</span>
          <div className="flex flex-col gap-3">
            {waiting.map(invitation => (
              <InvitationCard key={invitation.id} invitation={invitation} onSaved={setSaved} />
            ))}
          </div>
        </section>
      )}

      {answered.length > 0 && (
        <section>
          <span className={LABEL_CLASS}>Already answered</span>
          <div className="flex flex-col gap-3">
            {answered.map(invitation => (
              <InvitationCard key={invitation.id} invitation={invitation} onSaved={setSaved} />
            ))}
          </div>
        </section>
      )}

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

function InvitationCard({
  invitation,
  onSaved,
}: {
  invitation: TeamInvitation;
  onSaved: (message: string) => void;
}) {
  const qc = useQueryClient();
  const application = invitation.application;
  const team = application?.teamName ?? null;
  const pending = invitation.status === "pending";
  const roles = invitation.roles ?? [];

  // A captain can only change an application while it is a draft or was sent back, so an invitation
  // attached to anything else is one the team can no longer revise.
  const locked =
    application !== undefined &&
    application.status !== "draft" &&
    application.status !== "rejected";

  const respond = useMutation({
    mutationFn: (response: "accepted" | "declined") =>
      respondToInvitation(invitation.id, response),
    onSuccess: async (_row, response) => {
      // Both roots: the inbox is this list, and accepting changes the roster on the captain's
      // application — which the applicant page shows on the same session.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.invitations }),
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
      ]);
      onSaved(
        response === "accepted"
          ? `You're on ${team ?? "the team"}.`
          : `Declined ${team ?? "the invitation"}.`,
      );
    },
  });

  return (
    <div className="rounded-lg border border-border bg-bg2 p-4">
      <div className="flex flex-wrap items-start gap-3">
        {application?.logo ? (
          <img
            src={application.logo}
            alt=""
            className="h-11 w-11 shrink-0 rounded bg-bg3 object-contain"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded border border-border bg-bg3" />
        )}

        <div className="min-w-0 flex-1">
          <p className="font-heading text-base tracking-wider text-text-bright">
            {team ?? `Invitation ${invitation.id}`}
            {application && (
              <span className="ml-2 font-mono text-xs text-text-secondary">
                {application.teamCode}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-text-secondary">
            {/* Served flat on the invitation. It has to be: an application only exists while its
                conference is hidden, so the public tournament list cannot name it. */}
            {invitation.confName && <>{invitation.confName} · </>}
            {roles.length > 0 ? (
              <>
                as <span className="text-text-bright">{roleSummary(roles)}</span>
              </>
            ) : (
              "role not specified"
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-dim">
            Invited by{" "}
            <PlayerLink profileId={invitation.invitedByProfileId} className="text-accent">
              {invitation.invitedBy?.name ?? "the team's captain"}
            </PlayerLink>
            {invitation.invitedAt && ` · ${fmtKickoff(invitation.invitedAt)}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {application && (
            <Swatches
              primary={application.color}
              secondary={application.colorSecondary}
            />
          )}
          <InvitationStatusPill status={invitation.status} perspective="invitee" />
        </div>
      </div>

      {pending && roles.some(r => r.role === "owner") && (
        <p className="mt-3 text-sm text-ccs-orange">
          Accepting makes you the owner of this application — you'd take over running it.
        </p>
      )}

      {pending && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={respond.isPending}
            onClick={() => respond.mutate("accepted")}
            className={ACTION_SM_PRIMARY}
          >
            <Check size={14} aria-hidden="true" />
            Accept
          </button>
          <button
            type="button"
            disabled={respond.isPending}
            onClick={() => respond.mutate("declined")}
            className={ACTION_SM}
          >
            <X size={14} aria-hidden="true" />
            Decline
          </button>
          {locked && application && (
            <span className="text-xs text-text-dim">
              This team is already with the league staff.
            </span>
          )}
        </div>
      )}

      {!pending && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-dim">
          {invitation.status === "revoked"
            ? "The captain took you off this roster."
            : invitation.respondedAt
              ? `You answered ${fmtKickoff(invitation.respondedAt)}.`
              : null}
          {application && <ApplicationStatusPill status={application.status} />}
        </div>
      )}

      {/* Declining is the only way out once answered — upstream lets a captain re-invite somebody who
          declined, so a change of heart is their side of the transition, not a button here. */}
      {invitation.status === "declined" && (
        <p className="mt-2 text-xs text-text-dim">
          Changed your mind? Ask the captain to invite you again.
        </p>
      )}

      <ErrorLine message={respond.isError ? errorMessage(respond.error) : null} />
    </div>
  );
}

/** The team's colors, so an invitation is recognizable at a glance. See `ApplicationCard`. */
function Swatches({ primary, secondary }: { primary: number | null; secondary: number | null }) {
  if (primary === null && secondary === null) return null;
  return (
    <span className="flex items-center gap-1" aria-label="Team colors">
      {[primary, secondary].map((color, i) =>
        color === null ? null : (
          <span
            key={i}
            title={hexFromInt(color)}
            className="h-5 w-5 rounded border border-border3"
            style={{ backgroundColor: hexFromInt(color) }}
          />
        ),
      )}
    </span>
  );
}
