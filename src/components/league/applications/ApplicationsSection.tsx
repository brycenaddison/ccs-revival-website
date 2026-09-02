/**
 * League Admin → Team Applications. Roster review and publication, with the season's state beside it.
 *
 * Review and publish sit on one screen because they are one job in two stages, and separating them
 * would hide the ordering that matters: approval writes no team rows, publishing creates them. Both
 * are `roster` calls — the same scope that edits a published team, and the scope this page is gated
 * on — so nothing here is hidden from a reviewer.
 *
 * **Intake and listing are not controls here any more.** Opening or closing applications and making
 * the season public moved upstream to `/admin/leagues`, site-admin only, because each changes what
 * the *whole site* offers where a league grant governs one conference's data. The old
 * `/tournaments` paths answer `404`. What roster staff get instead is a read —
 * `GET /tournaments/:conf/applications/intake` — and `SeasonPanel` renders it: whether more
 * applications may still arrive, whether the season is public, and when its teams were first
 * published. **Nothing on this page names the site-admin portal.** A league admin cannot reach it,
 * so pointing there reads as a door they are not allowed through; the panel reports state only.
 *
 * The "before you apply" copy is edited here too, rather than on the Info page whose document stores
 * it. It is intake copy: an applicant reads it on the registration form beside the rulebook link and
 * it is never rendered on the Info page. The save is the Info document's whole-document `PUT`, which
 * needs the conference `admin` scope — the one control on this page still gated narrower than the
 * page, with `isSiteAdmin || hasScope(...)`. `hasScope` reads an **empty** scope list as permission
 * rather than refusal: an older server sends none, and hiding the editor from everybody mid-rollout
 * is a worse failure than a `403` the page already shows verbatim.
 *
 * **Publishing a team and publishing a season are not the same act.** Publishing runs while intake is
 * open and while other applications still await review — it takes whatever is approved now and can
 * be run again later — so an approved team leaves the queue and becomes editable in League Admin →
 * Teams without the league appearing anywhere on the site. Listing is the separate, later act, and
 * somebody else's.
 *
 * Rows are rendered in the order served within each status group. The queue arrives
 * `submittedAt asc`, which is the order the applications were made, and re-sorting a worklist by
 * anything else loses the queue.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, Rocket, X } from "lucide-react";
import { PlayerLink } from "../../profile/PlayerLink";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import {
  ACTION,
  ACTION_PRIMARY,
  ACTION_QUIET,
  ACTION_SM_DANGER,
  ACTION_SM_PRIMARY,
  ErrorLine,
  Pill,
} from "../../admin/adminUi";
import { MarkdownEditor } from "../../content/MarkdownEditor";
import { SettingsRow } from "../../settings/SettingsSection";
import { Toast } from "../../Toast";
import { TeamLink } from "../TeamLink";
import {
  ApplicationDetailsBlock,
  ApplicationTeamHeader,
  isPlaying,
  RankChip,
} from "../../apply/applyUi";
import { useAdminAccess } from "../../../lib/adminAccess";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtDay, fmtKickoff } from "../../../lib/utils";
import {
  errorMessage,
  hasScope,
  publishApplication,
  publishTeams,
  readApplicationDetails,
  refreshApplicationAccounts,
  refusalOf,
  reviewApplication,
  saveLeagueInfo,
  APPLICATION_MESSAGE_MAX,
  type ApplicationStatus,
  type LeagueInfo,
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
  { status: "submitted", label: "Awaiting review", note: "Decide these before making the season public." },
  { status: "approved", label: "Approved", note: "No team row exists yet. Publish one from its card, or the whole group above." },
  { status: "rejected", label: "Rejected", note: "The applicant can revise and resubmit while intake is open." },
  { status: "draft", label: "Drafts", note: "Not submitted. Visible here so intake activity is legible; there is nothing to review." },
  { status: "published", label: "Published" },
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

  // The Info document's `PUT` — behind the rulebook warning and the application notes — is
  // conference `admin`; everything else on this page, the queue and publishing included, is `roster`.
  const canEditInfo = isSiteAdmin || hasScope(leagues.find(l => l.conf === conf), "admin");

  if (isPending) return <p className="text-text-dim">Loading applications…</p>;

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorLine message={`Couldn't load the application queue: ${errorMessage(error)}`} />}

      {canEditInfo && <RulebookWarning conf={conf} />}

      <SeasonPanel conf={conf} applications={applications} onSaved={setSaved} />

      {canEditInfo && <ApplicationCopy conf={conf} onSaved={setSaved} />}

      {applications.length === 0 ? (
        <p className="text-text-dim">
          No applications yet. Once applications open for this season, the APPLY NOW button appears
          in the nav for every signed-in member and their teams land here.
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
 * One read, and it is the draft-aware one: `rulebookUrl` now rides on
 * `GET /tournaments/applications/open`, which ignores publication entirely, so a rulebook saved on
 * an unpublished Info page reaches the applicant fine. That used to be the common failure and this
 * panel diagnosed it by comparing the draft against the public copy; both the comparison and the
 * public read are gone with it.
 *
 * What is left is the case nothing on the server catches: **no rulebook at all**. Upstream requires
 * neither a value nor a publication (see §14), so the League Admin editor's own required-field check
 * is the only enforcement — and a league that saved before that check existed has an empty field and
 * an application form pointing at nothing.
 */
function RulebookWarning({ conf }: { conf: string }) {
  const { data: draft, isPending } = useQuery(queries.manageLeagueInfo(conf));
  if (isPending || draft?.rulebookUrl) return null;

  const infoHref = `/league/${encodeURIComponent(conf)}/admin/info`;

  return (
    <div role="alert" className="rounded-lg border border-ccs-orange/40 bg-ccs-orange/10 p-4">
      <p className="font-heading text-sm uppercase tracking-wider text-text-bright">
        Applicants can't see your rulebook
      </p>
      <p className="mt-1.5 text-sm text-text-secondary">
        This league's Info page has no rulebook link, so the team application form has nothing to
        point its rules confirmation at.
      </p>
      <Link to={infoHref} className="mt-2 inline-block text-sm text-brand no-underline">
        Add it on the Info page
      </Link>
    </div>
  );
}

// ----------------------------------------------------------- application copy

/**
 * Loads the draft-aware Info document and hands it to the editor below, remounting the editor when the
 * server's copy changes so its local text starts from what is stored. Same shape as `InfoSection`.
 *
 * The read is `manageLeagueInfo`, which `RulebookWarning` above already subscribes to, so this costs
 * no request of its own. Its access rule is the same as the write's — league `admin` — which is what
 * `canEditInfo` already gates on.
 */
function ApplicationCopy({ conf, onSaved }: { conf: string; onSaved: (message: string) => void }) {
  const { data, isPending, error } = useQuery(queries.manageLeagueInfo(conf));
  if (isPending) return null;
  if (error) {
    return <ErrorLine message={`Couldn't load the application notes: ${errorMessage(error)}`} />;
  }
  return (
    <ApplicationCopyPanel
      key={`${conf}:${data?.updatedAt ?? "new"}`}
      conf={conf}
      info={data ?? null}
      onSaved={onSaved}
    />
  );
}

/**
 * The "read this before you apply" Markdown an applicant sees on the registration form.
 *
 * It lives on the league's Info document, and that document only has a whole-document `PUT`, so the
 * save sends **every other field back exactly as stored** and changes only `applicationBody`. This
 * editor never trims, reorders or repairs anything it did not write: an Info page that predates the
 * rulebook field goes back with `rulebookUrl: ""` (upstream reads that as `null`, which is what it
 * already was), and its publication state is untouched.
 *
 * A league with no Info document yet gets one created — an unpublished draft with the editor's
 * default title, no links and no rulebook — because the alternative is telling the person opening
 * intake to go make an Info page first for the sake of a paragraph. Upstream requires nothing of an
 * empty draft, and `RulebookWarning` keeps nudging about the rulebook until it is filled in.
 *
 * Applicants read the result off `GET /tournaments/applications/open`, not off this document, so the
 * save invalidates `queryRoots.applications` as well as `queryRoots.info` — otherwise the registration
 * page in another tab, and the Apply Now check the nav runs, keep the old copy for the rest of its
 * stale window.
 */
function ApplicationCopyPanel({
  conf,
  info,
  onSaved,
}: {
  conf: string;
  info: LeagueInfo | null;
  onSaved: (message: string) => void;
}) {
  const qc = useQueryClient();
  const stored = info?.applicationBody ?? "";
  const [text, setText] = useState(stored);
  // Whitespace-only becomes `null` upstream, so a draft of nothing but blank lines is not a change.
  const next = text.trim() === "" ? null : text;
  const dirty = next !== (info?.applicationBody ?? null);

  const save = useMutation({
    mutationFn: () =>
      saveLeagueInfo(conf, {
        title: info?.title ?? "League Information",
        body: info?.body ?? null,
        links: info?.links ?? [],
        rulebookUrl: info?.rulebookUrl ?? "",
        applicationBody: next,
        isPublished: info?.isPublished ?? false,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.info }),
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
      ]);
      onSaved(next === null ? "Application notes cleared." : "Application notes saved.");
    },
  });

  return (
    <form
      className="bg-bg3 border border-border rounded-lg p-4"
      onSubmit={event => {
        event.preventDefault();
        if (dirty && !save.isPending) save.mutate();
      }}
    >
      <SettingsRow
        label="Application notes"
        hint="Shown to every applicant on the registration form. Include anything a captain should read before they start a team. Markdown is supported. It is not part of the public Info page."
      >
        <MarkdownEditor
          value={text}
          onChange={setText}
          rows={8}
          placeholder={"## Before you apply\n\nRosters lock on week one…"}
          ariaLabel="Application notes"
        />
      </SettingsRow>
      <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
      <div className="flex items-center gap-2">
        <button type="submit" className={ACTION_PRIMARY} disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : dirty ? "Save notes" : "Saved"}
        </button>
        {dirty && (
          <button
            type="button"
            className={ACTION}
            disabled={save.isPending}
            onClick={() => setText(stored)}
          >
            Reset
          </button>
        )}
      </div>
    </form>
  );
}

// -------------------------------------------------------------- season state

interface SeasonProps {
  conf: string;
  applications: readonly TeamApplication[];
  onSaved: (message: string) => void;
}

/**
 * Where the season stands, and the one conference-level command roster staff hold: publishing.
 *
 * The state comes from `GET /tournaments/:conf/applications/intake`, read straight off the
 * tournaments row. It used to be *derived* — intake from this conf's membership in the open-season
 * list, listing from its membership in the public tournament list — because `/admin/leagues` is
 * site-admin only and would `403` for the league admin this page is for. The dedicated read makes
 * both derivations unnecessary and adds the one fact neither could supply, `teamsPublishedAt`.
 *
 * The publish button's disabled state is a courtesy, not a check. Every condition it tests is
 * re-evaluated inside the server's transaction against a locked tournament row, so the response is
 * the authority and a refusal is rendered as one; this only saves an admin a round trip for the
 * cases the queue already makes obvious.
 */
function SeasonPanel({ conf, applications, onSaved }: SeasonProps) {
  const qc = useQueryClient();
  const [published, setPublished] = useState<PublicationResult | null>(null);

  const { data: season, error: seasonError } = useQuery(queries.applicationIntake(conf));
  // Both default to the state a season is prepared in, so the panel reads sensibly while the request
  // is in flight and after a failure it reports below.
  const open = season?.applicationsOpen === true;
  const listed = season?.listed === true;

  const approved = applications.filter(a => a.status === "approved").length;
  const alreadyPublished = applications.some(a => a.status === "published");

  const publish = useMutation({
    mutationFn: () => publishTeams(conf),
    onSuccess: async (result: PublicationResult) => {
      // New team rows, so the teams listing and the standings are stale even though the season is
      // still private: a league admin can see an unlisted conference's teams, so those reads are
      // not dormant just because the public cannot reach them. `tournaments` because the first
      // publication stamps `teamsPublishedAt`, which the site admin's league editor shows.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
        qc.invalidateQueries({ queryKey: queryRoots.tournaments }),
        qc.invalidateQueries({ queryKey: queryRoots.teams }),
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
      ]);
      setPublished(result);
      onSaved(`Published ${result.teams.length} team${result.teams.length === 1 ? "" : "s"}.`);
    },
  });

  // Why publication would be refused. `null` means nothing here can tell, which is not the same as
  // "it will succeed": the transaction re-checks every roster against a locked tournament row, so
  // this only saves an admin a round trip for what the queue already makes obvious.
  //
  // Open intake, undecided applications and an unlisted season are deliberately **not** blockers.
  // The first two used to be, and between them they were the reason a team could not exist before
  // its season did.
  const blocked =
    approved === 0
      ? alreadyPublished
        ? "Every approved team has been published."
        : "Nothing approved yet."
      : null;

  const publishRefusal = publish.isError ? refusalOf(publish.error) : null;

  // The intake and listing switches are not on this page and are not offered here in any form: a
  // control that answers `404` helps nobody, and naming another portal from this one sends a league
  // admin somewhere they cannot go. The rows below report state and nothing else.
  return (
    <div className="bg-bg3 border border-border rounded-lg p-4">
      {seasonError && (
        <ErrorLine message={`Couldn't read the season's state: ${errorMessage(seasonError)}`} />
      )}

      <SettingsRow
        label="Applications"
        hint={
          open
            ? "Any signed-in member can submit a team for this season right now, so this queue may still grow. Approved teams can be published as they come in."
            : listed
              ? "This season is public, so intake stays closed. Recruiting happens before publication, and the database enforces it."
              : "Closed. Nothing new arrives until intake is opened, so what is in the queue is the field unless it is reopened."
        }
      >
        <Pill muted={!open}>{open ? "Open" : "Closed"}</Pill>
      </SettingsRow>

      <SettingsRow
        label="Publish teams"
        hint="Creates a team entry for everything approved right now. Run it again as more are approved."
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
        </div>
      </SettingsRow>

      <SettingsRow
        label="Public visibility"
        hint={
          listed
            ? "Every visitor can see this season in the site's selectors, schedule and standings."
            : "Hidden from every visitor and every public read."
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Pill muted={!listed}>{listed ? "Listed" : "Hidden"}</Pill>
          {season?.teamsPublishedAt && (
            <span className="text-text-dim text-xs">
              Teams first published {fmtDay(season.teamsPublishedAt)}
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
                <TeamLink conf={team.conf} code={team.code} className="text-brand no-underline">
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
      onSaved(
        decision === "rejected"
          ? `${application.teamName} sent back. The submitter has been DMed.`
          : `${application.teamName} approved.`,
      );
    },
  });

  // Same transaction as the group publish, over this one application. It is here as well as in the
  // panel above because a group refuses whole when any single roster is bad, and the reviewer
  // looking at the good ones should not have to wait for the bad one to be fixed.
  const publish = useMutation({
    mutationFn: () => publishApplication(conf, application.id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
        qc.invalidateQueries({ queryKey: queryRoots.teams }),
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
      ]);
      onSaved(`${application.teamName} is a team now.`);
    },
  });

  // The ranks below come from upstream's cache and never trigger a lookup on their own.
  const refresh = useMutation({
    mutationFn: () => refreshApplicationAccounts(conf, application.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      onSaved("Ranks updated.");
    },
  });

  const refusal = review.isError ? refusalOf(review.error) : null;
  const publishRefusal = publish.isError ? refusalOf(publish.error) : null;
  const submitter = application.submittedBy;

  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      {/* The proposed pair, drawn as the Teams tab will draw it. A reviewer judging colors should
          see them on the surface they will actually be painted on, not as two squares. */}
      <ApplicationTeamHeader team={application} />

      <div className="p-4">
        <p className="text-text-dim text-xs">
          Submitted by{" "}
          <PlayerLink profileId={application.submittedByProfileId} className="text-brand">
            {submitter?.name ?? `profile ${application.submittedByProfileId}`}
          </PlayerLink>
          {application.submittedAt && ` · ${fmtKickoff(application.submittedAt)}`}
        </p>

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

        {/* `undefined` is a deployment too old to serve the roster, which is not the same as a team
            with nobody on it — and a reviewer needs to know which of the two they are looking at
            before they approve anything. */}
        {application.members === undefined ? (
          <p className="mt-3 text-text-dim text-xs">
            This deployment isn't serving the roster with the queue. Approving here checks the
            structural rules the server already enforces, not the people.
          </p>
        ) : (
          <MemberList
            application={application}
            onRefresh={() => refresh.mutate()}
            refreshing={refresh.isPending}
            refreshError={refresh.isError ? errorMessage(refresh.error) : null}
          />
        )}

        {application.status === "approved" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <button
              type="button"
              disabled={publish.isPending}
              onClick={() => publish.mutate()}
              className={ACTION_SM_PRIMARY}
            >
              <Rocket size={14} aria-hidden="true" />
              {publish.isPending ? "Publishing…" : "Publish this team"}
            </button>
            <span className="text-text-dim text-xs">
              Creates the team row. The season stays private.
            </span>
            {publishRefusal && (
              <div role="alert" className="w-full">
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
            {publish.isError && !publishRefusal && (
              <ErrorLine message={errorMessage(publish.error)} />
            )}
          </div>
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
    </div>
  );
}

/**
 * The accepted and outstanding members.
 *
 * The rank chip is the substance of a roster review after the write-up: it says whether a player
 * has proved they own a Riot account — which upstream requires of the whole lineup and refuses
 * publication without — and, when one is cached, where they are ranked. It is deliberately absent
 * from an owner or contact who does not play, because no such requirement applies to them.
 */
function MemberList({
  application,
  onRefresh,
  refreshing,
  refreshError,
}: {
  application: TeamApplication;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: string | null;
}) {
  const members = application.members ?? [];
  if (members.length === 0) return null;

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={LABEL_CLASS}>Roster</span>
        {/* Ranks are read from a cache, never fetched on load — a queue of a dozen rosters would
            otherwise spend the shared Riot key on a page view. */}
        <button type="button" onClick={onRefresh} disabled={refreshing} className={ACTION_QUIET}>
          <RefreshCw size={13} aria-hidden="true" />
          {refreshing ? "Checking…" : "Refresh ranks"}
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {members.map(member => (
          <li key={member.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Pill muted={member.status !== "accepted"}>{member.status}</Pill>
            <PlayerLink profileId={member.profileId} className="text-brand">
              {member.name ?? `profile ${member.profileId}`}
            </PlayerLink>
            <span className="text-text-secondary text-xs">
              {member.roles.map(r => r.role).join(" · ")}
            </span>
            {isPlaying(member.roles) && <RankChip riot={member.riot} />}
            {member.dmStatus === "failed" && (
              <span className="text-ccs-orange text-xs" title="The invitation is still valid in their website inbox.">
                DM failed
              </span>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine message={refreshError} />
    </>
  );
}
