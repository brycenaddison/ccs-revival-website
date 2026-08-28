/**
 * League Admin → Team Applications. Roster review, intake, and publication.
 *
 * Three jobs on one screen because they are one job in three stages, and separating them would hide
 * the ordering that matters: intake has to close before anything can publish, every submitted
 * application has to be decided before that, and approval writes no team rows at all — the only
 * thing that creates a team is the publication transaction at the bottom of this page.
 *
 * **The controls need different scopes than the page does.** Review is `roster`; opening intake and
 * publishing are conference `admin`. `/auth/me` now carries the *effective* scope set per grant, so
 * `IntakePanel` is hidden outright from a `roster`-only reviewer instead of being offered and
 * answering `403` — which is what it did before that field existed.
 *
 * A site admin passes without a grant at all, so the check is `isSiteAdmin || hasScope(...)`. And
 * `hasScope` reads an **empty** scope list as permission rather than refusal: an older server sends
 * none, and hiding every control from everybody mid-rollout is a worse failure than a `403` the page
 * already shows verbatim.
 *
 * Rows are rendered in the order served within each status group. The queue arrives
 * `submittedAt asc`, which is the order the applications were made, and re-sorting a worklist by
 * anything else loses the queue.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, LockOpen, Rocket, X } from "lucide-react";
import { PlayerLink } from "../../profile/PlayerLink";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ACTION, ACTION_SM_DANGER, ACTION_SM_PRIMARY, ErrorLine, Pill } from "../../admin/adminUi";
import { SettingsRow } from "../../settings/SettingsSection";
import { Toast } from "../../Toast";
import { TeamLink } from "../TeamLink";
import { ApplicationDetailsBlock } from "../../apply/applyUi";
import { useAdminAccess } from "../../../lib/adminAccess";
import { useLeague } from "../../../lib/leagueContext";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import {
  errorMessage,
  hasScope,
  hexFromInt,
  publishTeams,
  readApplicationDetails,
  refusalOf,
  reviewApplication,
  setApplicationsOpen,
  APPLICATION_MESSAGE_MAX,
  type ApplicationStatus,
  type PublicationResult,
  type TeamApplication,
} from "../../../lib/api";

/**
 * Display order for the status groups, and it is a worklist order rather than the lifecycle order.
 *
 * `submitted` first because it is the only group with anything to do. `draft` sits low: an unsubmitted
 * application is the applicant's business, and it is here only so staff can see intake is being used.
 */
const GROUPS: readonly { status: ApplicationStatus; label: string; note?: string }[] = [
  { status: "submitted", label: "Awaiting review", note: "Every one of these has to be decided before the season can publish." },
  { status: "approved", label: "Approved", note: "No team rows exist yet — publishing below is what creates them." },
  { status: "rejected", label: "Rejected", note: "The applicant can revise and resubmit while intake is open." },
  { status: "draft", label: "Drafts", note: "Not submitted. Visible here so intake activity is legible; there is nothing to review." },
  { status: "published", label: "Published" },
  { status: "withdrawn", label: "Withdrawn" },
];

export function ApplicationsSection() {
  // Read from the route rather than taken as a prop: the section registry in `LeagueAdmin` is
  // deliberately just data, so a section that needed the conf passed in would force the shell to
  // thread props through it. Every other league section reads it the same way.
  const { conf = "" } = useParams();
  const [saved, setSaved] = useState<string | null>(null);
  const { isSiteAdmin, leagues } = useAdminAccess();

  const { data, isPending, error } = useQuery(queries.applicationQueue(conf));
  const applications = data ?? [];

  // Intake and publication are conference `admin`; the queue below only needs `roster`.
  const canRunIntake = isSiteAdmin || hasScope(leagues.find(l => l.conf === conf), "admin");

  if (isPending) return <p className="text-text-dim">Loading applications…</p>;

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorLine message={`Couldn't load the application queue: ${errorMessage(error)}`} />}

      {canRunIntake && <RulebookWarning conf={conf} />}

      {canRunIntake && <IntakePanel conf={conf} applications={applications} onSaved={setSaved} />}

      {applications.length === 0 ? (
        <p className="text-text-dim">
          No applications yet. Open intake above and the APPLY NOW button appears in the nav for every
          signed-in member.
        </p>
      ) : (
        GROUPS.map(group => {
          const rows = applications.filter(a => a.status === group.status);
          if (rows.length === 0) return null;
          return (
            <section key={group.status}>
              <h3 className="font-display text-[18px] text-text-bright tracking-widest">
                {group.label.toUpperCase()}
                <span className="ml-2 font-body text-sm tracking-normal text-text-dim">
                  {rows.length}
                </span>
              </h3>
              {group.note && <p className="text-text-dim text-xs mt-1">{group.note}</p>}
              <div className="mt-3 flex flex-col gap-3">
                {rows.map(application => (
                  <ApplicationCard
                    key={application.id}
                    conf={conf}
                    application={application}
                    onSaved={setSaved}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

/**
 * Warns the one person who can fix it that applicants can't see the rulebook.
 *
 * The applicant form links its rules confirmation at `rulebookUrl` off `GET /:conf/info`, and that
 * read is **published-only**. So a league that filled the field in and left its Info page as a draft
 * shows every applicant "the rulebook link isn't available" — and the applicant has no way to know
 * why, because the draft-aware read is league-admin only. This is the surface that *can* tell, so it
 * does.
 *
 * Two reads, and the gap between them is the whole diagnosis: `manageLeagueInfo` sees the draft,
 * `leagueInfo` sees only what the public sees. Silent when they agree.
 */
function RulebookWarning({ conf }: { conf: string }) {
  const { data: draft, isPending: draftPending } = useQuery(queries.manageLeagueInfo(conf));
  const { data: live, isPending: livePending } = useQuery(queries.leagueInfo(conf));
  if (draftPending || livePending) return null;

  // What the public can actually reach. Anything else is a problem an applicant is already hitting.
  if (live?.rulebookUrl) return null;

  const missing = !draft?.rulebookUrl;
  const infoHref = `/league/${encodeURIComponent(conf)}/admin/info`;

  return (
    <div role="alert" className="rounded-lg border border-ccs-orange/40 bg-ccs-orange/10 p-4">
      <p className="font-heading text-sm uppercase tracking-wider text-text-bright">
        Applicants can't see your rulebook
      </p>
      <p className="mt-1.5 text-sm text-text-secondary">
        {missing
          ? "This league's Info page has no rulebook link, so the team application form has nothing to point its rules confirmation at."
          : "The rulebook link is saved, but this league's Info page is still a draft — and the public read only serves a published page, so applicants see no link."}
      </p>
      <Link to={infoHref} className="mt-2 inline-block text-sm text-accent no-underline">
        {missing ? "Add it on the Info page" : "Publish the Info page"}
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------- intake

interface IntakeProps {
  conf: string;
  applications: readonly TeamApplication[];
  onSaved: (message: string) => void;
}

/**
 * Intake and publication — the two conference-level controls.
 *
 * The publish button's disabled state is a courtesy, not a check. Every condition it tests is
 * re-evaluated inside the server's transaction against a locked tournament row, so the response is
 * the authority and a refusal is rendered as one; this only saves an admin a round trip for the
 * cases the queue already makes obvious.
 */
function IntakePanel({ conf, applications, onSaved }: IntakeProps) {
  const qc = useQueryClient();
  const [published, setPublished] = useState<PublicationResult | null>(null);

  // Neither flag is read from `/admin/leagues`, which is site-admin only — a league admin belongs on
  // this page and would get a `403` from it. Both are derivable from reads any signed-in league
  // admin can already make, and each is one membership test rather than a computation:
  //
  //  - intake: `GET /tournaments/applications/open` lists exactly the hidden confs accepting
  //    applications, so this conf being in it *is* `applicationsOpen`;
  //  - listed: public `GET /tournaments` is the listed-only projection, and `LeagueProvider` has it
  //    cached for the session, so this conf being in it *is* `listed`.
  const { data: openSeasons } = useQuery(queries.openApplicationSeasons());
  const { tournaments } = useLeague();
  const open = (openSeasons ?? []).some(season => season.conf === conf);
  const listed = tournaments.some(t => t.conf === conf);

  const pending = applications.filter(a => a.status === "submitted").length;
  const approved = applications.filter(a => a.status === "approved").length;
  const alreadyPublished = applications.some(a => a.status === "published");

  const intake = useMutation({
    mutationFn: (next: boolean) => setApplicationsOpen(conf, next),
    onSuccess: async (_row, next) => {
      // The open-season list is what this panel reads its own state back from, so awaiting its
      // invalidation is what makes the toggle settle on the server's answer rather than on the
      // value that was just requested.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
        qc.invalidateQueries({ queryKey: queryRoots.tournaments }),
      ]);
      onSaved(next ? "Applications are open." : "Applications are closed.");
    },
  });

  const publish = useMutation({
    mutationFn: () => publishTeams(conf),
    onSuccess: async (result: PublicationResult) => {
      // Publication lists and activates the conference and inserts its teams, so the season picker,
      // the teams listing and the standings are all stale the instant it returns — the applications
      // root on its own would leave every public surface showing the season as if it did not exist.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
        qc.invalidateQueries({ queryKey: queryRoots.tournaments }),
        qc.invalidateQueries({ queryKey: queryRoots.teams }),
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
      ]);
      setPublished(result);
      onSaved(
        result.status === "already_published"
          ? "These teams were already published."
          : `Published ${result.teams.length} team${result.teams.length === 1 ? "" : "s"}.`,
      );
    },
  });

  // Why publication would be refused, in the order the server checks it. `null` means nothing here
  // can tell — which is not the same as "it will succeed": the transaction re-checks every roster
  // against a locked tournament row, so `blocked` only saves an admin the round trips the queue on
  // this page already makes obvious.
  const blocked =
    alreadyPublished && approved === 0
      ? "Every approved team has been published."
      : open
        ? "Close applications first."
        : pending > 0
          ? `${pending} application${pending === 1 ? "" : "s"} still awaiting review.`
          : approved === 0
            ? "Nothing approved yet."
            : null;

  const publishRefusal = publish.isError ? refusalOf(publish.error) : null;

  return (
    <div className="bg-bg3 border border-border rounded-lg p-4">
      <SettingsRow
        label="Applications"
        hint={
          listed
            ? "This season is already public, so intake stays closed — recruiting happens before publication, and the database enforces it."
            : "While intake is open, any signed-in member can submit a team for this season. The season itself stays out of site navigation until its teams are published."
        }
      >
        <div className="flex items-center gap-3">
          <Pill muted={!open}>{open ? "Open" : "Closed"}</Pill>
          <button
            type="button"
            disabled={intake.isPending || (listed && !open)}
            onClick={() => intake.mutate(!open)}
            className={ACTION}
          >
            {open ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
            {intake.isPending ? "Saving…" : open ? "Close applications" : "Open applications"}
          </button>
        </div>
      </SettingsRow>
      <ErrorLine message={intake.isError ? errorMessage(intake.error) : null} />

      <SettingsRow
        label="Publish teams"
        hint="Creates every approved team, makes this season selectable across the site and marks it as running — all in one transaction. It cannot publish half a field, and it cannot be undone from here."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={publish.isPending || blocked !== null}
            onClick={() => publish.mutate()}
            className={ACTION_SM_PRIMARY}
          >
            <Rocket size={14} aria-hidden="true" />
            {publish.isPending ? "Publishing…" : "Publish approved teams"}
          </button>
          {blocked && <span className="text-text-dim text-xs">{blocked}</span>}
          {alreadyPublished && !blocked && (
            <span className="text-text-dim text-xs">
              Already published — pressing this again returns the same teams.
            </span>
          )}
        </div>
      </SettingsRow>

      {publishRefusal && (
        <div role="alert" className="mt-2">
          <p className="text-ccs-red text-sm">{publishRefusal.message}</p>
          {publishRefusal.issues.length > 0 && (
            <ul className="mt-1.5 list-disc pl-5 text-ccs-red text-xs">
              {publishRefusal.issues.map(issue => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {publish.isError && !publishRefusal && <ErrorLine message={errorMessage(publish.error)} />}

      {published && published.teams.length > 0 && (
        <div className="mt-3">
          <span className={LABEL_CLASS}>Published teams</span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {published.teams.map(team => (
              <li key={team.id} className="text-sm">
                <TeamLink conf={team.conf} code={team.code} className="text-accent no-underline">
                  {team.name} ({team.code})
                </TeamLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- rows

interface CardProps {
  conf: string;
  application: TeamApplication;
  onSaved: (message: string) => void;
}

function ApplicationCard({ conf, application, onSaved }: CardProps) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");

  const review = useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      reviewApplication(conf, application.id, decision, message.trim() === "" ? null : message.trim()),
    onSuccess: async (_row, decision) => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      onSaved(`${application.teamName} ${decision}.`);
    },
  });

  const refusal = review.isError ? refusalOf(review.error) : null;
  const submitter = application.submittedBy;

  return (
    <div className="bg-bg2 border border-border rounded-lg p-4">
      <div className="flex flex-wrap items-start gap-3">
        {application.logo && (
          <img
            src={application.logo}
            alt=""
            className="w-10 h-10 rounded object-contain bg-bg3 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base tracking-wider text-text-bright">
            {application.teamName}
            <span className="ml-2 font-mono text-xs text-text-secondary">{application.teamCode}</span>
          </p>
          <p className="text-text-dim text-xs mt-0.5">
            Submitted by{" "}
            <PlayerLink profileId={application.submittedByProfileId} className="text-accent">
              {submitter?.name ?? `profile ${application.submittedByProfileId}`}
            </PlayerLink>
            {application.submittedAt && ` · ${fmtKickoff(application.submittedAt)}`}
          </p>
        </div>
        <ColorSwatches primary={application.color} secondary={application.colorSecondary} />
      </div>

      {application.applicantMessage && (
        <p className="mt-3 text-sm text-text-secondary whitespace-pre-wrap">
          {application.applicantMessage}
        </p>
      )}

      {/* The supplementary answers, from the same component the applicant sees them in — a reviewer
          reading something different from what was submitted is how a decision gets argued about.
          The experience write-up is the substance of a roster review; the rules confirmation is the
          one field a reviewer should check rather than assume. */}
      <ApplicationDetailsBlock details={readApplicationDetails(application.applicationMetadata)} />

      {application.decisionMessage && (
        <p className="mt-3 text-sm text-text-secondary">
          <span className={LABEL_CLASS}>Your response</span>
          {application.decisionMessage}
          {application.reviewedAt && (
            <span className="text-text-dim text-xs"> · {fmtKickoff(application.reviewedAt)}</span>
          )}
        </p>
      )}

      {/* The roster is the whole point of a roster review, and the queue read does not carry it yet
          — naming that here is the difference between "this team has nobody on it" and "the API has
          not been asked for the members". */}
      {application.members === undefined ? (
        <p className="mt-3 text-text-dim text-xs">
          Roster and invitation history aren't served by{" "}
          <span className="font-mono text-text-secondary">GET /:conf/applications/review</span> yet —
          see the gap analysis. Approving here checks the structural rules the server already
          enforces, not the people.
        </p>
      ) : (
        <MemberList application={application} />
      )}

      {application.status === "submitted" && (
        <div className="mt-4 border-t border-border pt-3">
          <label className={LABEL_CLASS} htmlFor={`decision-${application.id}`}>
            Response to the applicant (optional)
          </label>
          <textarea
            id={`decision-${application.id}`}
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={APPLICATION_MESSAGE_MAX}
            rows={2}
            className={CONTROL_CLASS}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={review.isPending}
              onClick={() => review.mutate("approved")}
              className={ACTION_SM_PRIMARY}
            >
              <Check size={14} aria-hidden="true" />
              Approve
            </button>
            <button
              type="button"
              disabled={review.isPending}
              onClick={() => review.mutate("rejected")}
              className={ACTION_SM_DANGER}
            >
              <X size={14} aria-hidden="true" />
              Reject
            </button>
          </div>
          <ErrorLine message={refusal ? refusal.message : review.isError ? errorMessage(review.error) : null} />
        </div>
      )}
    </div>
  );
}

/**
 * Both proposed colors, side by side, because a team picks a pair and the pair is what gets judged.
 *
 * An inline `backgroundColor` rather than a utility: this is applicant *data*, not a theme decision,
 * so there is no `@theme` token for it and Tailwind cannot express an arbitrary value from the wire.
 * Same reasoning as `TeamBadge`.
 */
function ColorSwatches({ primary, secondary }: { primary: number | null; secondary: number | null }) {
  if (primary === null && secondary === null) return null;
  return (
    <div className="flex items-center gap-1.5 shrink-0" aria-label="Proposed colors">
      {[primary, secondary].map((color, i) =>
        color === null ? null : (
          <span
            key={i}
            title={hexFromInt(color)}
            className="w-5 h-5 rounded border border-border3"
            style={{ backgroundColor: hexFromInt(color) }}
          />
        ),
      )}
    </div>
  );
}

/** The accepted and outstanding members, once the server serves them. */
function MemberList({ application }: { application: TeamApplication }) {
  const members = application.members ?? [];
  if (members.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-col gap-1">
      {members.map(member => (
        <li key={member.id} className="flex flex-wrap items-center gap-2 text-sm">
          <Pill muted={member.status !== "accepted"}>{member.status}</Pill>
          <PlayerLink profileId={member.profileId} className="text-accent">
            {member.name ?? `profile ${member.profileId}`}
          </PlayerLink>
          <span className="text-text-secondary text-xs">
            {member.roles.map(r => r.role).join(" · ")}
          </span>
          {member.dmStatus === "failed" && (
            <span className="text-ccs-orange text-xs" title="The invitation is still valid in their website inbox.">
              DM failed
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
