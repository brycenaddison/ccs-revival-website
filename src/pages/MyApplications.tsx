/**
 * My applications — `/my-applications`. Every team the signed-in member has submitted, across every
 * league currently taking applications, with nowhere on the page to start a new one.
 *
 * It exists because `/register` is built around starting a team: the form for a new one sits at the
 * top, and the season is a single selection, so a captain running teams in two leagues saw one at a
 * time and had to find the other through a drop-down. Somebody coming back to check on what they sent
 * wants the opposite page, and this is it. Starting a team stays on `/register`, which is one link
 * away at the bottom.
 *
 * Grouped by league, because that is how the API serves them: `GET /:conf/applications` is per
 * conference and there is no cross-conference read, so the page fans one read out per open season
 * (`useQueries`) and each becomes a section. Each section opens with the league's own application
 * notes and rulebook folded into a disclosure, off the same `GET /tournaments/applications/open`
 * that names the season, so an applicant re-reading the rules for one league does not have to go back
 * to the registration page and reselect it.
 *
 * Only applications the member **submitted** are here. A team they were invited onto is the
 * inbox's business and reads as a line on `/register`; a card here means "yours to manage".
 *
 * The cards are the same `ApplicationCard` the registration page renders, with everything it does:
 * edit, invite, refresh ranks, submit, withdraw. This page removes the form, not the controls.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, PlusCircle } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { RequireAuth } from "../components/auth/RequireAuth";
import { ApplicationCard } from "../components/apply/ApplicationCard";
import { ErrorLine } from "../components/admin/adminUi";
import { Markdown } from "../components/Markdown";
import { Toast } from "../components/Toast";
import { useAuth } from "../lib/authContext";
import { queries } from "../lib/queries";
import { errorMessage, type ApplicationSeason, type TeamApplication } from "../lib/api";

export default function MyApplications() {
  return (
    <PageShell maxWidth={880}>
      <h1 className="mb-1 font-display text-[30px] tracking-widest text-text-bright">
        MY APPLICATIONS
      </h1>
      <p className="mb-6 text-sm text-text-secondary">
        Every team you've submitted, league by league.
      </p>
      <RequireAuth>
        <Panel />
      </RequireAuth>
    </PageShell>
  );
}

function Panel() {
  const { profile } = useAuth();
  const myProfileId = profile?.id ?? null;
  const [saved, setSaved] = useState<string | null>(null);

  const seasonsQuery = useQuery(queries.openApplicationSeasons());
  const seasons = seasonsQuery.data ?? [];

  // One read per open season, in the season list's order. `useQueries` rather than a component per
  // season, so the page can tell "still loading" from "nothing anywhere" before it draws either.
  const results = useQueries({
    queries: seasons.map(season => queries.myApplications(season.conf)),
  });

  if (seasonsQuery.isPending) {
    return <p className="text-text-dim">Checking which leagues are open…</p>;
  }
  if (seasonsQuery.error) {
    return (
      <ErrorLine message={`Couldn't check for open leagues: ${errorMessage(seasonsQuery.error)}`} />
    );
  }
  if (results.some(r => r.isPending)) {
    return <p className="text-text-dim">Loading your applications…</p>;
  }

  const sections = seasons.map((season, i) => ({
    season,
    error: results[i]?.error ?? null,
    applications: (results[i]?.data ?? []).filter(a => a.submittedByProfileId === myProfileId),
  }));
  // A league the member has nothing in is left out rather than shown empty: this page is about
  // what they sent, and an empty section under a heading reads as an invitation to fill it.
  const shown = sections.filter(s => s.applications.length > 0 || s.error !== null);

  if (shown.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg2 p-6">
        <h2 className="font-display text-[20px] tracking-widest text-text-bright">
          NOTHING SUBMITTED
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {seasons.length === 0
            ? "No league is taking teams right now, so there is nothing here to check on."
            : "You haven't started a team in any league that's taking them."}
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          {seasons.length > 0 && (
            <Link to="/register" className="text-brand no-underline hover:text-text-bright">
              Start a team
            </Link>
          )}
          <Link to="/team-invitations" className="text-brand no-underline hover:text-text-bright">
            Your team invitations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {shown.map(({ season, error, applications }) => (
        <LeagueSection
          key={season.conf}
          season={season}
          error={error}
          applications={applications}
          myProfileId={myProfileId}
          onSaved={setSaved}
        />
      ))}

      <p className="flex items-center gap-2 text-sm text-text-dim">
        <PlusCircle size={15} aria-hidden="true" />
        Want to enter another team?{" "}
        <Link to="/register" className="text-brand no-underline">
          Go to team registration
        </Link>
      </p>

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

function LeagueSection({
  season,
  error,
  applications,
  myProfileId,
  onSaved,
}: {
  season: ApplicationSeason;
  error: unknown;
  applications: readonly TeamApplication[];
  myProfileId: number | null;
  onSaved: (message: string) => void;
}) {
  // The division and season labels, when the league set them, under the full name. Both, because
  // sibling divisions share the season label and only the codename tells them apart.
  const sub = [season.codename, season.shortname].filter((s): s is string => s !== null);

  return (
    <section>
      <h2 className="font-display text-[22px] tracking-widest text-text-bright">
        {season.name.toUpperCase()}
      </h2>
      {sub.length > 0 && <p className="text-xs text-text-dim">{sub.join(" · ")}</p>}

      <div className="mt-3">
        <LeagueInfoDisclosure season={season} />
      </div>

      {error !== null && (
        <ErrorLine message={`Couldn't load your applications: ${errorMessage(error)}`} />
      )}

      <div className="mt-4 flex flex-col gap-5">
        {applications.map(application => (
          <ApplicationCard
            key={application.id}
            application={application}
            myProfileId={myProfileId}
            onSaved={onSaved}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The league's application notes and rulebook, folded shut.
 *
 * Closed by default because the person on this page has already applied: they read this once on
 * `/register`, and here it is a reference to reopen, not a briefing to scroll past on the way to
 * every card. A native `<details>` rather than a layered primitive, since nothing here traps focus or
 * floats over the page; it is a disclosure of static text, which is exactly the element's job.
 *
 * Both fields ride on the open-season list, which ignores publication, so this shows what the
 * league wrote even while its Info page is still a draft.
 */
function LeagueInfoDisclosure({ season }: { season: ApplicationSeason }) {
  const empty = season.applicationBody === null && season.rulebookUrl === null;

  return (
    <details className="group rounded-lg border border-border bg-bg2">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-heading text-sm uppercase tracking-wider text-text-bright [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={15}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-150 group-open:rotate-180"
        />
        League application info
      </summary>
      <div className="border-t border-border px-4 py-4">
        {season.rulebookUrl && (
          <p className="flex items-center gap-2 text-sm">
            <BookOpen size={15} aria-hidden="true" className="shrink-0 text-text-secondary" />
            <a
              href={season.rulebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand no-underline hover:text-text-bright"
            >
              Read the rulebook
            </a>
          </p>
        )}
        {season.applicationBody && (
          <div className={season.rulebookUrl ? "mt-3" : ""}>
            <Markdown body={season.applicationBody} />
          </div>
        )}
        {empty && (
          <p className="text-sm text-text-dim">
            This league hasn't written any application notes.
          </p>
        )}
      </div>
    </details>
  );
}
