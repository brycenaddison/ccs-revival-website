/**
 * Team registration — `/register`. The applicant side of the team-application workflow.
 *
 * This is where the nav's APPLY NOW and JOIN CCS buttons land, which is why the path is unchanged
 * even though the page is now a form rather than a signpost.
 *
 * The season being applied to comes from `GET /tournaments/applications/open`, **not** from the
 * site's `?conf=` selection. Those are different questions: the selector names the season you are
 * *reading*, while intake happens on a hidden conference that is deliberately absent from it. Using
 * the selector here would offer a league that has already published its teams.
 *
 * Signed in only. That is not a policy choice — the route is `401` for anonymous callers, because an
 * application belongs to a profile and an invitation is addressed to one. `RequireAuth` turns that
 * into a sign-in prompt rather than an error.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { ApplicationCard } from "../components/apply/ApplicationCard";
import { ApplicationForm } from "../components/apply/ApplicationForm";
import { ApplicationStatusPill } from "../components/apply/applyUi";
import { ErrorLine } from "../components/admin/adminUi";
import { Markdown } from "../components/Markdown";
import { CONTROL_CLASS, LABEL_CLASS } from "../components/stats/FilterBar";
import { Toast } from "../components/Toast";
import { useAuth } from "../lib/authContext";
import { queries } from "../lib/queries";
import { errorMessage } from "../lib/api";
import { DISCORD_INVITE } from "../lib/siteLinks";

export default function Register() {
  return (
    <PageShell maxWidth={880}>
      <h1 className="mb-1 font-display text-[30px] tracking-widest text-text-bright">
        TEAM REGISTRATION
      </h1>
      <p className="mb-6 text-sm text-text-secondary">
        Start a team, invite your players, and send it to the league for review.
      </p>
      <RequireAuth>
        <ApplyPanel />
      </RequireAuth>
    </PageShell>
  );
}

function ApplyPanel() {
  const { profile } = useAuth();
  const [saved, setSaved] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const { data: seasons, isPending, error } = useQuery(queries.openApplicationSeasons());
  const open = seasons ?? [];

  // An explicit choice wins; otherwise the first open season, which is the only one most of the time.
  const conf = chosen && open.some(s => s.conf === chosen) ? chosen : open[0]?.conf ?? "";
  const season = open.find(s => s.conf === conf) ?? null;

  if (isPending) return <p className="text-text-dim">Checking which leagues are open…</p>;

  if (error) {
    return <ErrorLine message={`Couldn't check for open leagues: ${errorMessage(error)}`} />;
  }

  if (open.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg2 p-6">
        <h2 className="font-display text-[20px] tracking-widest text-text-bright">
          NO LEAGUES ARE TAKING TEAMS RIGHT NOW
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Registration opens before each season. Join the Discord and you'll hear about it there
          first — and if somebody has already invited you to their team, the invitation is waiting in
          your inbox.
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          {/* Dropped rather than dead when the deployment has no invite configured — see
              `lib/siteLinks.ts`. */}
          {DISCORD_INVITE && (
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand no-underline hover:text-text-bright"
            >
              Open Discord
            </a>
          )}
          <Link to="/team-invitations" className="text-brand no-underline hover:text-text-bright">
            Your team invitations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {open.length > 1 && (
        <div className="max-w-sm">
          <label className={LABEL_CLASS} htmlFor="apply-conf">
            Applying to
          </label>
          <select
            id="apply-conf"
            value={conf}
            onChange={e => setChosen(e.target.value)}
            className={CONTROL_CLASS}
          >
            {open.map(season => (
              <option key={season.conf} value={season.conf}>
                {season.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {open.length === 1 && (
        <p className="text-sm text-text-secondary">
          Applying to <span className="text-text-bright">{open[0].name}</span>.
        </p>
      )}

      {/* The league's own "read this before you apply" copy, off the same list that named the
          season — so it reaches an applicant while the Info page is still a draft, like the rulebook
          the form links to. Rendered through the shared `Markdown` so it obeys the one Markdown
          policy on the site. Absent means the league wrote none, and nothing is drawn for it. */}
      {season?.applicationBody && (
        <section className="rounded-lg border border-border bg-bg2 p-5">
          <h2 className="font-display text-[20px] tracking-widest text-text-bright">
            LEAGUE INFORMATION
          </h2>
          <div className="mt-2">
            <Markdown body={season.applicationBody} />
          </div>
        </section>
      )}

      <ConfApplications conf={conf} myProfileId={profile?.id ?? null} onSaved={setSaved} />

      <p className="flex items-center gap-2 text-sm text-text-dim">
        <Inbox size={15} aria-hidden="true" />
        Invited to somebody else's team?{" "}
        <Link to="/team-invitations" className="text-brand no-underline">
          Check your invitations
        </Link>
      </p>

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

interface ConfProps {
  conf: string;
  myProfileId: number | null;
  onSaved: (message: string) => void;
}

function ConfApplications({ conf, myProfileId, onSaved }: ConfProps) {
  const [starting, setStarting] = useState(false);

  const { data, isPending, error } = useQuery(queries.myApplications(conf));
  const applications = data ?? [];

  if (isPending) return <p className="text-text-dim">Loading your applications…</p>;
  if (error) {
    return <ErrorLine message={`Couldn't load your applications: ${errorMessage(error)}`} />;
  }

  // The read returns applications you submitted *or* are a member of, so the two are separated here:
  // one you run, the other you were invited to and can only read. Withdrawing deletes, so nothing
  // here has to hide a finished one; what is served is what is live.
  const live = applications.filter(a => a.submittedByProfileId === myProfileId);
  const asMember = applications.filter(a => a.submittedByProfileId !== myProfileId);

  return (
    <div className="flex flex-col gap-5">
      {live.length === 0 && !starting && (
        <div className="rounded-lg border border-border bg-bg2 p-5">
          <h2 className="font-display text-[20px] tracking-widest text-text-bright">
            START A TEAM
          </h2>
          {/* Says nothing about ownership. A new application starts with an empty roster and the
              captain invites everybody — themselves included — and running the application is not a
              role: it follows whoever created it. The readiness checklist names what is missing. */}
          <p className="mt-2 text-sm text-text-secondary">
            Nothing goes to the league until you submit it. You'll invite your players next — add
            yourself too if you're playing.
          </p>
          <div className="mt-4">
            <ApplicationForm
              conf={conf}
              onDone={message => {
                setStarting(false);
                onSaved(message);
              }}
            />
          </div>
        </div>
      )}

      {live.map(application => (
        <ApplicationCard
          key={application.id}
          application={application}
          myProfileId={myProfileId}
          onSaved={onSaved}
        />
      ))}

      {/* Nothing here is actionable — an invitee answers in their inbox, not on the captain's page —
          so these are one line each rather than full cards. */}
      {asMember.length > 0 && (
        <section>
          <h2 className="font-heading text-sm uppercase tracking-wider text-text-bright">
            Teams you're on
          </h2>
          <ul className="mt-2 flex flex-col">
            {asMember.map(application => (
              <li
                key={application.id}
                className="flex flex-wrap items-center gap-2.5 border-b border-border py-2.5 last:border-b-0"
              >
                <span className="font-heading text-sm tracking-wider text-text-bright">
                  {application.teamName}
                </span>
                <span className="font-mono text-xs text-text-secondary">
                  {application.teamCode}
                </span>
                <ApplicationStatusPill status={application.status} />
                <span className="text-xs text-text-dim">
                  run by {application.submittedBy?.name ?? "another player"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {live.length > 0 && !starting && (
        <button
          type="button"
          onClick={() => setStarting(true)}
          className="self-start bg-transparent border-none p-0 cursor-pointer font-heading text-xs uppercase tracking-wider text-text-dim hover:text-text-bright"
        >
          Start another team
        </button>
      )}

      {starting && live.length > 0 && (
        <div className="rounded-lg border border-border bg-bg2 p-5">
          <h2 className="font-display text-[20px] tracking-widest text-text-bright">
            ANOTHER TEAM
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            One person can run more than one team, though you can only play for one of them.
          </p>
          <div className="mt-4">
            <ApplicationForm
              conf={conf}
              onDone={message => {
                setStarting(false);
                onSaved(message);
              }}
              onCancel={() => setStarting(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
