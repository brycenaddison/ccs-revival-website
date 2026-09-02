import { useParams } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { TeamDetailPanel } from "../components/stats/TeamDetailPanel";
import { useGoBack } from "../hooks/useGoBack";
import { useSeasonLink } from "../lib/leagueContext";

/**
 * A single team's page.
 *
 * This is the one place `/teams/:conf/:team` is used, and it's the endpoint's intended
 * purpose: comprehensive data for one team, fetched because a user asked for that team.
 * A team is identified by (conf, code) — codes are only unique within a conf.
 *
 * The back link goes **back**, not home. A team page is reached from a dozen places — the Teams tab, a
 * standings row, a bracket card, a match page, a stats leaderboard — and sending every one of them to
 * the front page threw away whichever list the reader was working through. It still falls back to the
 * front page for a cold arrival, where there is no back to go to; see `useGoBack`. The page wears the
 * site nav like every other data page; the link is the shortcut, not the only way out.
 */
export default function TeamPage() {
  const { conf, code } = useParams<{ conf: string; code: string }>();
  // The fallback shouldn't reset which season the visitor was browsing.
  const seasonLink = useSeasonLink();
  const goBack = useGoBack(seasonLink("/"));

  return (
    <PageShell maxWidth={1200}>
      <button
        type="button"
        onClick={goBack}
        className="mb-4 cursor-pointer border-none bg-transparent p-0 font-heading text-xs text-text-secondary hover:text-brand hover:underline"
      >
        &larr; Back
      </button>
      {conf && code ? (
        <TeamDetailPanel conf={conf} code={code} />
      ) : (
        <div className="py-10 text-center text-text-dim">No team specified.</div>
      )}
    </PageShell>
  );
}
