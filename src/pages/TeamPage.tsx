import { useNavigate, useParams } from "react-router-dom";
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
 * The header goes **back**, not home. A team page is reached from a dozen places — the Teams tab, a
 * standings row, a bracket card, a match page, a stats leaderboard — and sending every one of them to
 * the front page threw away whichever list the reader was working through. It still falls back to the
 * front page for a cold arrival, where there is no back to go to; see `useGoBack`.
 */
export default function TeamPage() {
  const { conf, code } = useParams<{ conf: string; code: string }>();
  const navigate = useNavigate();
  // The fallback shouldn't reset which season the visitor was browsing.
  const seasonLink = useSeasonLink();
  const goBack = useGoBack(seasonLink("/"));

  return (
    <div className="bg-bg min-h-screen w-full text-text font-body">
      <div className="bg-bg border-b border-bg2 px-4 py-3">
        <div className="max-w-[1200px] mx-auto">
          <button
            type="button"
            onClick={goBack}
            className="cursor-pointer border-none bg-transparent text-accent font-heading text-xs tracking-wider uppercase hover:text-text-bright"
          >
            &larr; Back
          </button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {conf && code ? (
          <TeamDetailPanel
            conf={conf}
            code={code}
            onSelectMatch={matchId => navigate(`/game/${encodeURIComponent(matchId)}`)}
          />
        ) : (
          <div className="text-center py-10 text-text-dim">No team specified.</div>
        )}
      </div>
    </div>
  );
}
