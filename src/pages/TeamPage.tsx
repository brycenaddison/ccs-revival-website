import { useParams } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { TeamDetailPanel } from "../components/stats/TeamDetailPanel";
import { BackLink } from "../components/BackLink";
import { useSeasonLink } from "../lib/leagueContext";

/**
 * A single team's page.
 *
 * This is the one place `/teams/by-id/:id` is used, and it's the endpoint's intended
 * purpose: comprehensive data for one team, fetched because a user asked for that team.
 * A team is identified by `teams.id`, which survives a tag change; the conf comes from the team.
 *
 * The back link goes **back**, not home. A team page is reached from a dozen places — the Teams tab, a
 * standings row, a bracket card, a match page, a stats leaderboard — and sending every one of them to
 * the front page threw away whichever list the reader was working through. It still falls back to the
 * front page for a cold arrival, where there is no back to go to; see `useGoBack`. The page wears the
 * site nav like every other data page; the link is the shortcut, not the only way out.
 */
export default function TeamPage() {
  const { teamId: param } = useParams<{ teamId: string }>();
  // The fallback shouldn't reset which season the visitor was browsing.
  const seasonLink = useSeasonLink();

  return (
    <PageShell maxWidth={1200}>
      <BackLink fallback={seasonLink("/")} />
      <TeamDetailPanel teamId={parseTeamId(param)} />
    </PageShell>
  );
}

/** A positive decimal ID, or null, so a malformed segment is not found without asking the API. */
function parseTeamId(param: string | undefined): number | null {
  if (!param || !/^\d+$/.test(param)) return null;
  const id = Number(param);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
