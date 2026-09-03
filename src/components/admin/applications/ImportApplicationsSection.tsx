/**
 * Site Admin → Import Applications. Entering a team application on a captain's behalf, then messaging
 * the players when the admin is ready.
 *
 * This exists for one job: the league collected this season's applications on an external form, and
 * the applicant routes cannot take them, because every one of them gates on the caller being the
 * submitter. It is **not** a second review queue. Reviewing and publishing stay on League Admin →
 * Team Applications, where the `roster` grant is; this page creates drafts and sends invitations, both
 * of which act as somebody else, which is why the routes behind it are site-admin only and live under
 * `/admin/leagues/:conf/applications`.
 *
 * **Two commands, deliberately separate.** Import writes the application and stages its roster as
 * `pending` invitations that have not been DMed. Send invites is a button on the card, per
 * application, and it is a `ConfirmButton` because it messages people: a batch of imports can be
 * checked over, or a mistaken one deleted, before anybody in the Discord hears about it. The
 * invitations are visible in each invitee's inbox on the site from the moment of import, which is the
 * trade-off Brycen chose: no second `staged` state anywhere in the vocabulary.
 *
 * The league picker reads `/admin/leagues`, like every site-admin picker, because an application
 * belongs to a season nobody can see yet. The list below the form is the same `applicationQueue` read
 * League Admin uses (a site admin passes its `roster` check), so there is no import-specific read and
 * nothing here distinguishes an imported application from one a captain started. Deleting is offered
 * for `draft` and `rejected` regardless of origin, because the two are indistinguishable and a
 * mistaken import is the case this page has to be able to undo; the confirmation names the team.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ConfirmButton } from "../../ConfirmButton";
import { Toast } from "../../Toast";
import { PlayerLink } from "../../profile/PlayerLink";
import {
  ApplicationTeamHeader,
  InvitationStatusPill,
  MemberAvatar,
  memberLabel,
  roleSummary,
} from "../../apply/applyUi";
import { ACTION_SM_DANGER, ACTION_SM_PRIMARY, ErrorLine, Pill, stateNote } from "../adminUi";
import { ImportApplicationForm } from "./ImportApplicationForm";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import {
  discardApplication,
  errorMessage,
  refusalOf,
  sendApplicationInvitations,
  type ApplicationMember,
  type InvitationSendResult,
  type TeamApplication,
} from "../../../lib/api";

export function ImportApplicationsSection() {
  const { data, isPending, error } = useQuery(queries.adminLeagues());
  const leagues = data ?? [];

  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // Bumped after every import so the form remounts empty for the next row of the spreadsheet.
  const [imports, setImports] = useState(0);

  // A hidden season is the only kind an application can be imported into, so the first one is the
  // default; falling back to whatever is first keeps the picker honest when there is none.
  const conf =
    selected ?? leagues.find(l => l.listed === false)?.conf ?? leagues[0]?.conf ?? "";
  const league = leagues.find(l => l.conf === conf) ?? null;

  if (isPending) return <p className="text-text-dim">Loading leagues…</p>;

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorLine message={`Couldn't load the league list: ${errorMessage(error)}`} />}

      <div>
        <label className={LABEL_CLASS} htmlFor="import-league">
          League
        </label>
        <select
          id="import-league"
          value={conf}
          onChange={e => setSelected(e.target.value)}
          className={CONTROL_CLASS}
        >
          {leagues.map(t => (
            <option key={t.conf} value={t.conf}>
              {t.name} ({t.conf}){stateNote(t)}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-text-dim">
          Applications belong to a season that is still hidden. Intake does not have to be open for an
          import.
        </p>
      </div>

      {league?.listed === true && (
        <div role="alert" className="rounded-lg border border-ccs-orange/40 bg-ccs-orange/10 p-4">
          <p className="font-heading text-sm text-text-bright">This season is already public</p>
          <p className="mt-1.5 text-sm text-text-secondary">
            An application can only be imported into a hidden season; the server refuses one here. A
            team joining a public season is added directly in League Admin → Teams.
          </p>
        </div>
      )}

      {league && (
        <>
          <section>
            <h3 className="font-display text-[18px] text-text-bright">Import a team</h3>
            <p className="mt-1 text-xs text-text-dim">
              One external form response at a time. The result is a draft the captain owns.
            </p>
            <div className="mt-3">
              <ImportApplicationForm
                key={`${conf}:${imports}`}
                conf={conf}
                onDone={message => {
                  setSaved(message);
                  setImports(n => n + 1);
                }}
              />
            </div>
          </section>

          <ApplicationList conf={conf} onSaved={setSaved} />
        </>
      )}

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

// -------------------------------------------------------------------- the list

function ApplicationList({ conf, onSaved }: { conf: string; onSaved: (message: string) => void }) {
  const { data, isPending, error } = useQuery(queries.applicationQueue(conf));
  const applications = data ?? [];

  return (
    <section>
      <h3 className="font-display text-[18px] text-text-bright">
        Applications in this league
        {!isPending && (
          <span className="ml-2 font-body text-sm text-text-dim">{applications.length}</span>
        )}
      </h3>
      <p className="mt-1 text-xs text-text-dim">
        Every application in the season, imported or not, in the order they were made. Send invites
        messages the people on a roster who have not been messaged yet.
      </p>

      {error && (
        <ErrorLine message={`Couldn't load the applications: ${errorMessage(error)}`} />
      )}
      {isPending && <p className="mt-3 text-text-dim">Loading applications…</p>}

      {!isPending && applications.length === 0 && (
        <p className="mt-3 text-sm text-text-dim">Nothing here yet.</p>
      )}

      {applications.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {applications.map(application => (
            <ApplicationCard
              key={application.id}
              conf={conf}
              application={application}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// -------------------------------------------------------------------- one card

interface CardProps {
  conf: string;
  application: TeamApplication;
  onSaved: (message: string) => void;
}

/** Whether a member is still waiting on a DM: outstanding, and never successfully messaged. */
const awaitingDm = (m: ApplicationMember): boolean =>
  m.status === "pending" && m.dmStatus !== "sent";

function ApplicationCard({ conf, application, onSaved }: CardProps) {
  const qc = useQueryClient();
  const members = application.members ?? [];
  const unsent = members.filter(awaitingDm);
  const canDiscard = application.status === "draft" || application.status === "rejected";

  const send = useMutation({
    mutationFn: () => sendApplicationInvitations(conf, application.id),
    onSuccess: async (result: InvitationSendResult) => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      // A failed DM is a caveat on a success, not an error: the invitation stands in their inbox.
      onSaved(
        result.failed === 0
          ? `Messaged ${result.sent} ${result.sent === 1 ? "person" : "people"} for ${application.teamName}.`
          : `Messaged ${result.sent} for ${application.teamName}; ${result.failed} couldn't be reached on Discord. They can still answer from their inbox on the site.`,
      );
    },
  });

  const discard = useMutation({
    mutationFn: () => discardApplication(conf, application.id),
    onSuccess: async () => {
      // `invitations` too: deleting takes every pending invitation out of its invitee's inbox.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
        qc.invalidateQueries({ queryKey: queryRoots.invitations }),
      ]);
      onSaved(`Deleted ${application.teamName}.`);
    },
  });

  const sendError = send.isError
    ? (refusalOf(send.error)?.message ?? errorMessage(send.error))
    : null;
  const discardError = discard.isError
    ? (refusalOf(discard.error)?.message ?? errorMessage(discard.error))
    : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg2">
      <ApplicationTeamHeader team={application} />

      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
          <Pill muted={application.status === "draft"}>{application.status}</Pill>
          <span>
            Submitter{" "}
            <PlayerLink profileId={application.submittedByProfileId} className="text-brand hover:underline">
              {application.submittedBy?.name ?? `profile ${application.submittedByProfileId}`}
            </PlayerLink>
          </span>
          {application.createdAt && <span>· created {fmtKickoff(application.createdAt)}</span>}
        </div>

        {/* `undefined` is a deployment too old to serve the roster with the queue; nothing to send. */}
        {application.members === undefined ? (
          <p className="mt-3 text-xs text-text-dim">
            This deployment isn't serving rosters with the queue, so there is nothing to send from
            here.
          </p>
        ) : members.length === 0 ? (
          <p className="mt-3 text-xs text-text-dim">Nobody on the roster.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {members.map(member => (
              <li key={member.id} className="flex flex-wrap items-center gap-2 text-sm">
                <MemberAvatar member={member} />
                <PlayerLink profileId={member.profileId} className="text-brand hover:underline">
                  {memberLabel(member)}
                </PlayerLink>
                <span className="text-xs text-text-secondary">{roleSummary(member.roles)}</span>
                <InvitationStatusPill status={member.status} perspective="captain" />
                {member.status === "pending" && <DmNote member={member} />}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <ConfirmButton
            title={`Message ${unsent.length} ${unsent.length === 1 ? "person" : "people"} about ${application.teamName}?`}
            description={
              <>
                Each of them gets a Discord DM from the bot inviting them to the team on behalf of{" "}
                {application.submittedBy?.name ?? "the submitter"}, with a link to answer on the site.
                People already messaged, and anyone who has answered, are left alone.
              </>
            }
            confirmLabel="Send invites"
            confirmVariant="default"
            disabled={send.isPending || unsent.length === 0}
            onConfirm={() => send.mutate()}
            trigger={
              <button
                type="button"
                disabled={send.isPending || unsent.length === 0}
                className={ACTION_SM_PRIMARY}
              >
                <Send size={14} aria-hidden="true" />
                {send.isPending
                  ? "Sending…"
                  : unsent.length === 0
                    ? "Send invites"
                    : `Send invites (${unsent.length})`}
              </button>
            }
          />
          {unsent.length === 0 && members.length > 0 && (
            <span className="text-xs text-text-dim">
              Everyone still waiting has been messaged.
            </span>
          )}

          {canDiscard && (
            <ConfirmButton
              title={`Delete ${application.teamName}?`}
              description="Removes the application, its roster and every pending invitation to it, for good. Nobody is messaged. If a captain started this themselves rather than you importing it, they lose their draft."
              confirmLabel="Delete application"
              disabled={discard.isPending}
              onConfirm={() => discard.mutate()}
              trigger={
                <button type="button" disabled={discard.isPending} className={`${ACTION_SM_DANGER} ml-auto`}>
                  <Trash2 size={14} aria-hidden="true" />
                  {discard.isPending ? "Deleting…" : "Delete"}
                </button>
              }
            />
          )}
        </div>

        <ErrorLine message={sendError ?? discardError} />
      </div>
    </div>
  );
}

/**
 * Where a pending member's Discord message stands. Three states, none of them an error: not yet
 * attempted is the state every import lands in, `failed` most often means closed DMs, and either way
 * the invitation is live in their inbox on the site.
 */
function DmNote({ member }: { member: ApplicationMember }) {
  if (member.dmStatus === "sent") {
    return <span className="text-xs text-text-dim">messaged</span>;
  }
  if (member.dmStatus === "failed") {
    return (
      <span
        className="text-xs text-ccs-orange"
        title="The invitation is still valid in their website inbox."
      >
        DM failed
      </span>
    );
  }
  return <span className="text-xs text-text-dim">not messaged yet</span>;
}
